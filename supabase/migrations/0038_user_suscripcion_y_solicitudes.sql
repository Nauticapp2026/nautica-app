-- =============================================================================
-- 0038 — Suscripción de usuario (free/premium) + Solicitudes de membership.
--
-- Dos features que se cobran aparte de los planes SaaS de las guarderías:
--
--   1) profiles.suscripcion ('free'|'premium')
--        Plan del usuario individual. Premium habilita contactar servicios del
--        marketplace y registrar negocio propio.
--        - suscripcion_renews_at: cuándo expira (lo setea el provider de pagos
--          cuando exista; mientras tanto el super admin lo setea a mano).
--        - suscripcion_solicitada: flag "el user pidió Premium pero todavía no
--          hay provider de pagos integrado". El super admin lo ve en el panel
--          y activa suscripcion manualmente.
--
--   2) solicitudes_membership
--        Cuando un usuario sin club ("sin_rol") quiere unirse a una guardería,
--        deja una solicitud aquí. El admin del club la aprueba o rechaza desde
--        el panel web. Si aprueba, el trigger crea la membership rol='socio'.
--
-- Regla de auto-downgrade (trigger en memberships AFTER INSERT):
--   Si un usuario con suscripcion='premium' pasa a tener una membership de
--   socio activa en cualquier guardería con plan SaaS asignado, se le baja la
--   suscripción a 'free' (el club ya lo cubre vía su plan SaaS). Como
--   guarderias.plan tiene default 'esencial', en la práctica todo socio
--   activo nunca paga Premium individual. Si en el futuro hace falta soportar
--   clubes "trial" que NO cubran al socio, agregar guarderias.plan_pago_activo
--   y refinar el chequeo.
--
-- Sin notificaciones automáticas: los avisos (admin ve solicitudes nuevas,
-- socio ve que lo aprobaron) los gestiona la UI cuando alguien abre la
-- pantalla. No se enchufan triggers a platform_notificaciones (esa cola es
-- para mensajes masivos del super admin, no para eventos uno-a-uno).
--
-- Idempotente.
-- =============================================================================


-- 1) profiles: columnas de suscripción ---------------------------------------

alter table public.profiles
  add column if not exists suscripcion text not null default 'free';

alter table public.profiles
  add column if not exists suscripcion_renews_at timestamptz;

alter table public.profiles
  add column if not exists suscripcion_solicitada text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_suscripcion_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_suscripcion_check
        check (suscripcion in ('free', 'premium'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_suscripcion_solicitada_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_suscripcion_solicitada_check
        check (suscripcion_solicitada is null or suscripcion_solicitada in ('premium'));
  end if;
end$$;

comment on column public.profiles.suscripcion is
  'Plan del usuario individual. ''free'' por default. ''premium'' habilita contactar servicios del marketplace y registrar negocio propio.';

comment on column public.profiles.suscripcion_solicitada is
  'Flag: el user pidió Premium desde la app pero todavía no hay provider de pagos integrado. El super admin lo ve y activa suscripcion manualmente.';


-- 2) solicitudes_membership --------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_solicitud_membership') then
    create type public.estado_solicitud_membership as enum (
      'pendiente', 'aprobada', 'rechazada'
    );
  end if;
end$$;

create table if not exists public.solicitudes_membership (
  id              uuid primary key default gen_random_uuid(),
  solicitante_id  uuid not null references public.profiles(id) on delete cascade,
  guarderia_id    uuid not null references public.guarderias(id) on delete cascade,
  estado          public.estado_solicitud_membership not null default 'pendiente',
  motivo_rechazo  text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles(id) on delete set null
);

create unique index if not exists solicitudes_membership_pendiente_unique
  on public.solicitudes_membership (solicitante_id, guarderia_id)
  where (estado = 'pendiente');

create index if not exists solicitudes_membership_guarderia_idx
  on public.solicitudes_membership (guarderia_id, estado);

create index if not exists solicitudes_membership_solicitante_idx
  on public.solicitudes_membership (solicitante_id, created_at desc);

comment on table public.solicitudes_membership is
  'Pedido de un usuario para unirse a una guardería. El admin aprueba/rechaza desde el panel; si aprueba, el trigger crea la membership rol=socio.';


-- 3) RLS de solicitudes_membership -------------------------------------------

alter table public.solicitudes_membership enable row level security;

drop policy if exists "solicitudes_membership_select" on public.solicitudes_membership;
create policy "solicitudes_membership_select"
  on public.solicitudes_membership
  for select
  to authenticated
  using (
    solicitante_id = auth.uid()
    or public.is_guarderia_admin(guarderia_id)
  );

drop policy if exists "solicitudes_membership_insert" on public.solicitudes_membership;
create policy "solicitudes_membership_insert"
  on public.solicitudes_membership
  for insert
  to authenticated
  with check (
    solicitante_id = auth.uid()
    and estado = 'pendiente'
  );

drop policy if exists "solicitudes_membership_update" on public.solicitudes_membership;
create policy "solicitudes_membership_update"
  on public.solicitudes_membership
  for update
  to authenticated
  using (public.is_guarderia_admin(guarderia_id))
  with check (public.is_guarderia_admin(guarderia_id));


-- 4) Trigger BEFORE UPDATE: aprobar = crear membership ----------------------

create or replace function public._on_solicitud_membership_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado = new.estado then
    return new;
  end if;

  if old.estado <> 'pendiente' then
    return new;
  end if;

  if new.resolved_at is null then
    new.resolved_at := now();
  end if;
  if new.resolved_by is null then
    new.resolved_by := auth.uid();
  end if;

  if new.estado = 'aprobada' then
    insert into public.memberships (user_id, guarderia_id, rol, status)
    values (new.solicitante_id, new.guarderia_id, 'socio', 'active')
    on conflict (user_id, guarderia_id) do update
      set rol = excluded.rol,
          status = 'active',
          updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_solicitudes_membership_resolved on public.solicitudes_membership;
create trigger trg_solicitudes_membership_resolved
  before update of estado on public.solicitudes_membership
  for each row
  execute function public._on_solicitud_membership_resolved();


-- 5) Trigger AFTER INSERT en memberships: auto-downgrade Premium -----------

create or replace function public._on_membership_socio_downgrade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rol <> 'socio' or new.status <> 'active' then
    return new;
  end if;

  if exists (
    select 1 from public.guarderias g
    where g.id = new.guarderia_id and g.plan is not null
  ) then
    update public.profiles
      set suscripcion = 'free',
          suscripcion_renews_at = null,
          suscripcion_solicitada = null,
          updated_at = now()
      where id = new.user_id
        and (suscripcion = 'premium' or suscripcion_solicitada is not null);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_memberships_socio_downgrade on public.memberships;
create trigger trg_memberships_socio_downgrade
  after insert on public.memberships
  for each row
  execute function public._on_membership_socio_downgrade();
