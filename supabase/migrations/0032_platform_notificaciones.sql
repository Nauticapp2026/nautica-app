-- =============================================================================
-- Super admin: notificaciones push de plataforma (sección "Notificaciones").
--
-- Cola de notificaciones que el super admin compone desde la web. Cada
-- registro queda en estado 'pendiente' hasta que la app mobile las consuma
-- (vía un job o suscripción) y las despache por FCM/APNS, momento en el
-- cual el consumidor pasa el estado a 'enviada' o 'fallida'.
--
-- Audiencia:
--   - 'todas'     → todos los usuarios mobile de todas las guarderías.
--   - 'guarderia' → todos los usuarios de una guardería específica (guarderia_id NOT NULL).
--
-- RLS:
--   - SELECT/INSERT/UPDATE/DELETE: solo super_admin.
--     (La mobile, cuando se integre, leerá vía service_role o función segura
--      con el filtro de su guardería.)
--
-- Idempotente.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notificacion_audiencia') then
    create type public.notificacion_audiencia as enum ('todas', 'guarderia');
  end if;
  if not exists (select 1 from pg_type where typname = 'notificacion_estado') then
    create type public.notificacion_estado as enum ('pendiente', 'enviada', 'fallida');
  end if;
end$$;

create table if not exists public.platform_notificaciones (
  id            uuid primary key default gen_random_uuid(),
  autor_id      uuid references public.profiles(id) on delete set null,
  titulo        text not null,
  cuerpo        text not null,
  audiencia     public.notificacion_audiencia not null,
  guarderia_id  uuid references public.guarderias(id) on delete cascade,
  estado        public.notificacion_estado not null default 'pendiente',
  error         text,
  enviado_en    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint platform_notificaciones_guarderia_consistente
    check (
      (audiencia = 'guarderia' and guarderia_id is not null)
      or
      (audiencia = 'todas' and guarderia_id is null)
    )
);

comment on table public.platform_notificaciones is
  'Cola de notificaciones push a nivel plataforma. El super admin las compone desde /super-admin/notificaciones; el consumidor mobile (a integrar) las despacha por FCM/APNS y actualiza estado.';

create index if not exists platform_notificaciones_estado_idx
  on public.platform_notificaciones (estado, created_at desc);

-- RLS ------------------------------------------------------------------------

alter table public.platform_notificaciones enable row level security;

drop policy if exists "platform_notificaciones_super_admin_all"
  on public.platform_notificaciones;
create policy "platform_notificaciones_super_admin_all"
  on public.platform_notificaciones
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
