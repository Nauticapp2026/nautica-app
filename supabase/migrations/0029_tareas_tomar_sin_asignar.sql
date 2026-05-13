-- =============================================================================
-- Permite a cualquier miembro activo del club tomar una tarea sin asignar.
-- Reemplaza la policy UPDATE de tareas para que un member pueda hacer UPDATE
-- cuando operario_id IS NULL, siempre que el post-update lo asigne a sí mismo.
-- El caso ya existente (operario asignado mueve estado) se preserva.
-- Uso principal: app mobile del operario, donde "el que la elige primero la toma"
-- en lavados.
-- =============================================================================

drop policy if exists "tareas_update_admin_or_operario" on public.tareas;

create policy "tareas_update_admin_or_operario"
  on public.tareas
  for update
  to authenticated
  using (
    public.is_super_admin()
    or public.is_guarderia_admin(guarderia_id)
    or (
      public.is_guarderia_member(guarderia_id)
      and (operario_id = auth.uid() or operario_id is null)
    )
  )
  with check (
    public.is_super_admin()
    or public.is_guarderia_admin(guarderia_id)
    or (
      public.is_guarderia_member(guarderia_id)
      and operario_id = auth.uid()
    )
  );
