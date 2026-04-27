-- =============================================================================
-- Soporte para el rol `seguridad` desde la app mobile.
--
-- 1) Columna `ingreso_en` en porteria_invitados: cuándo el guardia confirmó
--    el ingreso del invitado (timestamptz). NULL = todavía no entró.
-- 2) Helper `is_guarderia_seguridad(p_guarderia_id)`: chequea que el usuario
--    actual tenga membership activa con rol seguridad en esa guardería.
-- 3) Policies adicionales para que el rol seguridad pueda:
--    - leer y actualizar `porteria_invitados` de su club (no solo las propias),
--    - insertar `tareas` en su club (para disparar la tarea de "preparar
--      embarcación" en el primer ingreso de una salida).
--
-- Las policies existentes (socio dueño en porteria_invitados; admin en tareas)
-- NO se tocan; se acumulan, RLS evalúa por OR.
-- =============================================================================

-- 1) Columna ingreso_en --------------------------------------------------------

alter table public.porteria_invitados
  add column if not exists ingreso_en timestamptz;

comment on column public.porteria_invitados.ingreso_en is
  'Cuándo el rol seguridad confirmó el ingreso del invitado al club. NULL = aún no ingresó. Bloquea reutilización del QR cuando ya está seteado.';

-- 2) Helper is_guarderia_seguridad ---------------------------------------------

create or replace function public.is_guarderia_seguridad(p_guarderia_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and guarderia_id = p_guarderia_id
      and status = 'active'
      and rol = 'seguridad'
  );
$$;

-- 3) Policies para rol seguridad -----------------------------------------------

drop policy if exists "porteria_invitados_select_seguridad" on public.porteria_invitados;
create policy "porteria_invitados_select_seguridad"
  on public.porteria_invitados
  for select
  to authenticated
  using (
    exists (
      select 1 from public.porteria p
      where p.id = porteria_invitados.porteria_id
        and public.is_guarderia_seguridad(p.guarderia_id)
    )
  );

drop policy if exists "porteria_invitados_update_seguridad" on public.porteria_invitados;
create policy "porteria_invitados_update_seguridad"
  on public.porteria_invitados
  for update
  to authenticated
  using (
    exists (
      select 1 from public.porteria p
      where p.id = porteria_invitados.porteria_id
        and public.is_guarderia_seguridad(p.guarderia_id)
    )
  )
  with check (
    exists (
      select 1 from public.porteria p
      where p.id = porteria_invitados.porteria_id
        and public.is_guarderia_seguridad(p.guarderia_id)
    )
  );

drop policy if exists "tareas_insert_seguridad" on public.tareas;
create policy "tareas_insert_seguridad"
  on public.tareas
  for insert
  to authenticated
  with check (
    public.is_guarderia_seguridad(guarderia_id)
  );
