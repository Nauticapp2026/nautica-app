-- =============================================================================
-- Phase 1 — Auth, roles, multi-tenancy
-- Ejecutar DESPUÉS de `pnpm db:migrate` (que crea tablas y enums desde Drizzle).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FK de profiles.id -> auth.users.id
-- -----------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

-- -----------------------------------------------------------------------------
-- 2. Trigger: crear profile automáticamente al registrarse un usuario
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3. Helpers de autorización (SECURITY DEFINER para evitar recursión en RLS)
-- -----------------------------------------------------------------------------

-- ¿Es super admin?
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ¿El usuario actual pertenece a esta guardería con algún rol activo?
create or replace function public.is_guarderia_member(p_guarderia_id uuid)
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
  );
$$;

-- Rol del usuario actual en una guardería (null si no pertenece).
create or replace function public.guarderia_rol(p_guarderia_id uuid)
returns "rol"
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.memberships
  where user_id = auth.uid()
    and guarderia_id = p_guarderia_id
    and status = 'active'
  limit 1;
$$;

-- ¿Es admin (administrador_general o super_admin) de esta guardería?
create or replace function public.is_guarderia_admin(p_guarderia_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or (
    select coalesce(rol = 'administrador_general' and status = 'active', false)
    from public.memberships
    where user_id = auth.uid() and guarderia_id = p_guarderia_id
    limit 1
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. Habilitar RLS en todas las tablas
-- -----------------------------------------------------------------------------
alter table public.guarderias enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;

-- -----------------------------------------------------------------------------
-- 5. Políticas: profiles
-- -----------------------------------------------------------------------------
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid() or public.is_super_admin());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_super_admin = (select is_super_admin from public.profiles where id = auth.uid())
  );

-- Admins de una guardería pueden ver perfiles de sus miembros.
create policy "profiles_select_guarderia_members"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.memberships m1
      join public.memberships m2 on m2.guarderia_id = m1.guarderia_id
      where m1.user_id = auth.uid()
        and m1.rol in ('administrador_general', 'operario')
        and m1.status = 'active'
        and m2.user_id = profiles.id
        and m2.status = 'active'
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Políticas: guarderias
-- -----------------------------------------------------------------------------
create policy "guarderias_select"
  on public.guarderias for select
  using (public.is_super_admin() or public.is_guarderia_member(id));

create policy "guarderias_insert"
  on public.guarderias for insert
  with check (public.is_super_admin());

create policy "guarderias_update"
  on public.guarderias for update
  using (public.is_super_admin() or public.is_guarderia_admin(id));

create policy "guarderias_delete"
  on public.guarderias for delete
  using (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 7. Políticas: memberships
-- -----------------------------------------------------------------------------
create policy "memberships_select_own"
  on public.memberships for select
  using (user_id = auth.uid());

create policy "memberships_select_guarderia_admin"
  on public.memberships for select
  using (public.is_super_admin() or public.is_guarderia_admin(guarderia_id));

create policy "memberships_insert"
  on public.memberships for insert
  with check (public.is_super_admin() or public.is_guarderia_admin(guarderia_id));

create policy "memberships_update"
  on public.memberships for update
  using (public.is_super_admin() or public.is_guarderia_admin(guarderia_id));

create policy "memberships_delete"
  on public.memberships for delete
  using (public.is_super_admin() or public.is_guarderia_admin(guarderia_id));

-- -----------------------------------------------------------------------------
-- 8. Políticas: invitations
-- -----------------------------------------------------------------------------
create policy "invitations_select"
  on public.invitations for select
  using (public.is_super_admin() or public.is_guarderia_admin(guarderia_id));

create policy "invitations_insert"
  on public.invitations for insert
  with check (public.is_super_admin() or public.is_guarderia_admin(guarderia_id));

create policy "invitations_update"
  on public.invitations for update
  using (public.is_super_admin() or public.is_guarderia_admin(guarderia_id));

create policy "invitations_delete"
  on public.invitations for delete
  using (public.is_super_admin() or public.is_guarderia_admin(guarderia_id));

-- -----------------------------------------------------------------------------
-- 9. Función para aceptar invitación (transaccional, via service role)
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(
  p_token text,
  p_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.invitations%rowtype;
  v_membership_id uuid;
begin
  select * into v_invitation
  from public.invitations
  where token = p_token
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invitation not found, expired or already used';
  end if;

  insert into public.memberships (user_id, guarderia_id, rol)
  values (p_user_id, v_invitation.guarderia_id, v_invitation.rol)
  on conflict (user_id, guarderia_id) do update
    set rol = excluded.rol,
        status = 'active',
        updated_at = now()
  returning id into v_membership_id;

  update public.invitations
  set status = 'accepted',
      accepted_at = now()
  where id = v_invitation.id;

  return v_membership_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Triggers para updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger guarderias_touch_updated_at
  before update on public.guarderias
  for each row execute function public.touch_updated_at();

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger memberships_touch_updated_at
  before update on public.memberships
  for each row execute function public.touch_updated_at();
