-- =============================================================================
-- 0047 — Embarcaciones: SELECT habilitado para todos los miembros activos
-- =============================================================================
--
-- Contexto: mismo patrón que 0046 sobre porteria. La mig 0007 dejó SELECT
-- sobre `embarcaciones` limitado a `is_guarderia_seguridad`. El operario
-- en mobile no puede leer la tabla, lo que rompe los JOINs anidados desde
-- `tareas → embarcacion_id → embarcaciones` para mostrar nombre y matrícula
-- en el listado/detalle del operario.
--
-- Esta mig equipara el SELECT al patrón de `tareas` (mig 0005): cualquier
-- miembro activo del club puede leer las embarcaciones de su guardería.
-- UPDATE/INSERT/DELETE no se tocan.
-- =============================================================================

-- Aseguramos RLS habilitada (idempotente).
alter table public.embarcaciones enable row level security;

drop policy if exists "embarcaciones_select_member" on public.embarcaciones;

create policy "embarcaciones_select_member"
  on public.embarcaciones
  for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_guarderia_member(guarderia_id)
  );
