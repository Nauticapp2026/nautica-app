-- =============================================================================
-- Historial de cambios de precio en servicios (tarifario).
--
-- Cada vez que cambia `servicios.precio`, un trigger inserta una fila en
-- `servicios_historial` con el delta. Permite auditar ajustes manuales y
-- masivos (porcentaje / monto) y mostrarlos en el panel de tarifario.
--
-- El "origen" lo setea la app vía GUC `app.origen_cambio` antes del UPDATE.
-- Si no hay GUC, el trigger asume 'manual'. Esto cubre cambios que vengan
-- por fuera de las server actions (ej. SQL editor) sin perder la fila.
--
-- El `usuario_id` también viene por GUC `app.usuario_id`: el cliente
-- Drizzle se conecta al pooler directamente, así que `auth.uid()` queda
-- null. Las server actions setean el GUC con el id del session antes del
-- UPDATE, dentro de una transacción para que sea local.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.servicios_historial (
  id              uuid primary key default gen_random_uuid(),
  servicio_id     uuid not null references public.servicios(id) on delete cascade,
  guarderia_id    uuid not null references public.guarderias(id) on delete cascade,
  precio_anterior numeric(12, 2),
  precio_nuevo    numeric(12, 2),
  origen          text not null default 'manual',
  usuario_id      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

comment on table public.servicios_historial is
  'Auditoría de cambios de precio en servicios. Insertado por trigger AFTER UPDATE OF precio.';

create index if not exists servicios_historial_servicio_idx
  on public.servicios_historial (servicio_id, created_at desc);

create index if not exists servicios_historial_guarderia_idx
  on public.servicios_historial (guarderia_id);

-- Trigger function ----------------------------------------------------------

create or replace function public._on_servicio_precio_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen text;
  v_user uuid;
begin
  -- No registrar cambios "fantasma" donde el precio queda igual.
  if old.precio is not distinct from new.precio then
    return new;
  end if;

  -- El origen lo provee la app antes del UPDATE; default 'manual'.
  v_origen := coalesce(nullif(current_setting('app.origen_cambio', true), ''), 'manual');

  -- Usuario: primero intentamos el GUC seteado por la server action
  -- (Drizzle/pooler no propaga auth.uid()). Si no hay GUC, fallback a
  -- auth.uid() para los pocos paths que sí pasan por Supabase Auth.
  begin
    v_user := nullif(current_setting('app.usuario_id', true), '')::uuid;
  exception when others then
    v_user := null;
  end;
  if v_user is null then
    begin
      v_user := auth.uid();
    exception when others then
      v_user := null;
    end;
  end if;

  insert into public.servicios_historial (
    servicio_id, guarderia_id, precio_anterior, precio_nuevo, origen, usuario_id
  ) values (
    new.id, new.guarderia_id, old.precio, new.precio, v_origen, v_user
  );

  return new;
end;
$$;

drop trigger if exists trg_servicio_precio_change on public.servicios;
create trigger trg_servicio_precio_change
after update of precio on public.servicios
for each row
execute function public._on_servicio_precio_change();

-- RLS -----------------------------------------------------------------------
-- SELECT: super admin o admin de la guardería dueña del registro.
-- INSERT/UPDATE/DELETE: solo el trigger (SECURITY DEFINER bypassa RLS); la
-- app no escribe directo en esta tabla.

alter table public.servicios_historial enable row level security;

drop policy if exists "servicios_historial_select_admin" on public.servicios_historial;
create policy "servicios_historial_select_admin"
  on public.servicios_historial
  for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_guarderia_admin(guarderia_id)
  );

-- Sin policies de INSERT/UPDATE/DELETE: con RLS habilitado y sin policies,
-- los clientes authenticated quedan bloqueados. El trigger inserta vía
-- SECURITY DEFINER y pasa por encima.
