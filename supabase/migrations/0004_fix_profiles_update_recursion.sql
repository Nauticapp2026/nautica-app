-- =============================================================================
-- Fix: "infinite recursion detected in policy for relation profiles"
--
-- La policy original hacía un subselect a public.profiles dentro del WITH CHECK,
-- lo que retriggerea RLS sobre la misma tabla y produce recursión.
-- Reemplazamos por public.is_super_admin() (SECURITY DEFINER, bypassa RLS).
-- =============================================================================

drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_super_admin = public.is_super_admin()
  );
