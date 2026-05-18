-- =============================================================================
-- 0048 — Memberships: SELECT habilitado para todos los miembros del club
-- =============================================================================
--
-- Contexto: la policy original `memberships_select_own` (mig 0001) solo
-- permite leer la PROPIA membership. La `memberships_select_guarderia_admin`
-- permite a admins ver todas las del club. Pero un **operario** o **socio**
-- sin permisos de admin no puede leer las memberships de otros miembros.
--
-- Esto rompe en cascada otras RLS que hacen JOIN sobre `memberships` para
-- evaluar la pertenencia a una guardería: por ejemplo
-- `profiles_select_guarderia_members` (mig 0022) hace
-- `from memberships m1 join memberships m2 ...`. Cuando un operario intenta
-- leer el profile de un socio, RLS de memberships le esconde la fila m2 del
-- socio → el EXISTS devuelve false → el SELECT a profiles devuelve []
-- silenciosamente (sin error).
--
-- Fix: agregar policy SELECT a `memberships` que abre la lectura a cualquier
-- miembro activo del club. UPDATE/INSERT/DELETE no se tocan (siguen
-- restringidos a admin).
-- =============================================================================

drop policy if exists "memberships_select_guarderia_member" on public.memberships;

create policy "memberships_select_guarderia_member"
  on public.memberships
  for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_guarderia_member(guarderia_id)
  );
