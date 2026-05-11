-- =============================================================================
-- Suma 'administrativo' al enum public.rol y actualiza is_guarderia_admin
-- para que reconozca a 'administrativo' con los mismos permisos que
-- 'administrador_general'.
--
-- Decisión de producto: el rol "Administrativo" tiene exactamente los mismos
-- permisos que "Admin" (administrador_general). Se modela como rol separado
-- para distinguir en los listados de equipo, pero el gating es el mismo.
--
-- Idempotente.
-- =============================================================================

alter type public.rol add value if not exists 'administrativo';

-- Recreamos la función is_guarderia_admin para incluir 'administrativo'.
create or replace function public.is_guarderia_admin(p_guarderia_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or (
    select coalesce(rol in ('administrador_general', 'administrativo') and status = 'active', false)
    from public.memberships
    where user_id = auth.uid() and guarderia_id = p_guarderia_id
    limit 1
  );
$$;

-- Política profiles_select_guarderia_members: administrativo también puede
-- leer perfiles de miembros de su guardería (mismo trato que admin general).
drop policy if exists "profiles_select_guarderia_members" on public.profiles;
create policy "profiles_select_guarderia_members"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.memberships m1
      join public.memberships m2 on m2.guarderia_id = m1.guarderia_id
      where m1.user_id = auth.uid()
        and m1.rol in ('administrador_general', 'administrativo', 'operario')
        and m1.status = 'active'
        and m2.user_id = profiles.id
        and m2.status = 'active'
    )
  );
