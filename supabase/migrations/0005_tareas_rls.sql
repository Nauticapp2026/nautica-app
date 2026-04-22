-- =============================================================================
-- RLS para tareas.
-- Scope: todas las operaciones están limitadas a la guardería del usuario.
-- Permisos:
--   - SELECT: cualquier miembro activo de la guardería.
--   - INSERT/DELETE: solo admin (administrador_general o super_admin).
--   - UPDATE: admin, o el operario asignado (cambia estado / notas).
-- =============================================================================

alter table public.tareas enable row level security;

-- SELECT: miembros de la guardería
create policy "tareas_select_member"
  on public.tareas
  for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_guarderia_member(guarderia_id)
  );

-- INSERT: solo admin crea
create policy "tareas_insert_admin"
  on public.tareas
  for insert
  to authenticated
  with check (
    public.is_super_admin()
    or public.is_guarderia_admin(guarderia_id)
  );

-- UPDATE: admin o el operario asignado
create policy "tareas_update_admin_or_operario"
  on public.tareas
  for update
  to authenticated
  using (
    public.is_super_admin()
    or public.is_guarderia_admin(guarderia_id)
    or (
      public.is_guarderia_member(guarderia_id)
      and operario_id = auth.uid()
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

-- DELETE: solo admin
create policy "tareas_delete_admin"
  on public.tareas
  for delete
  to authenticated
  using (
    public.is_super_admin()
    or public.is_guarderia_admin(guarderia_id)
  );

-- Trigger updated_at
create trigger tareas_touch_updated_at
  before update on public.tareas
  for each row execute function public.touch_updated_at();
