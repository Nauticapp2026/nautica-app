-- =============================================================================
-- 0077 — Embarcaciones: INSERT/UPDATE/DELETE para el propio socio
-- =============================================================================
-- Contexto: la mig 0047 habilitó RLS en embarcaciones y agregó SELECT para
-- miembros activos, pero no definió policies de escritura. La app mobile
-- permite al socio gestionar sus propias embarcaciones (crear, editar,
-- eliminar, cambiar la principal) directamente desde el perfil.
-- La admin web usa service_role y no necesita estas policies.
-- =============================================================================

-- INSERT: el socio puede insertar embarcaciones con su propio profile_id.
drop policy if exists "embarcaciones_insert_own" on public.embarcaciones;
create policy "embarcaciones_insert_own"
  on public.embarcaciones
  for insert to authenticated
  with check (profile_id = auth.uid());

-- UPDATE: el socio puede modificar solo sus propias embarcaciones.
drop policy if exists "embarcaciones_update_own" on public.embarcaciones;
create policy "embarcaciones_update_own"
  on public.embarcaciones
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- DELETE: el socio puede eliminar solo sus propias embarcaciones.
drop policy if exists "embarcaciones_delete_own" on public.embarcaciones;
create policy "embarcaciones_delete_own"
  on public.embarcaciones
  for delete to authenticated
  using (profile_id = auth.uid());
