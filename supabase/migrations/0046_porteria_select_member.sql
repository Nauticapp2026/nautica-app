-- =============================================================================
-- 0046 — Porteria: SELECT habilitado para todos los miembros activos del club
-- =============================================================================
--
-- Contexto: la mig 0007 creó una policy SELECT sobre `porteria` solo para
-- `seguridad`. El socio puede ver sus propias portería en mobile, pero el
-- **operario** no podía leerlas, lo que rompía JOINs anidados desde `tareas`
-- a `porteria → socio_id → profiles`. Sin acceso a `porteria`, el listado
-- de tareas del operario no podía mostrar el nombre del socio cuando la
-- tarea no tenía `embarcacion_id` cargado.
--
-- La policy nueva equipara el SELECT de `porteria` con el de `tareas`
-- (mig 0005): cualquier miembro activo de la guardería puede leerla.
-- El UPDATE sigue acotado a seguridad / socio según corresponda; esta
-- migración es solo SELECT.
-- =============================================================================

-- Aseguramos RLS habilitada en porteria (idempotente).
alter table public.porteria enable row level security;

drop policy if exists "porteria_select_member" on public.porteria;

create policy "porteria_select_member"
  on public.porteria
  for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_guarderia_member(guarderia_id)
  );
