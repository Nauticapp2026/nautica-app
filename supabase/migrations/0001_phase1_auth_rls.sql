-- =============================================================================
-- Phase 1 — Auth, roles, multi-tenancy
-- Ejecutar DESPUÉS de `pnpm db:push` (que crea tablas y enums desde Drizzle).
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
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
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
create or replace function public.is_marina_member(p_marina_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and marina_id = p_marina_id
      and status = 'active'
  );
$$;

-- Rol del usuario actual en una guardería (null si no pertenece).
create or replace function public.marina_role(p_marina_id uuid)
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.memberships
  where user_id = auth.uid()
    and marina_id = p_marina_id
    and status = 'active'
  limit 1;
$$;

-- ¿Es admin (marina_admin o super_admin) de esta guardería?
create or replace function public.is_marina_admin(p_marina_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or (
    select coalesce(role = 'marina_admin' and status = 'active', false)
    from public.memberships
    where user_id = auth.uid() and marina_id = p_marina_id
    limit 1
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. Habilitar RLS en todas las tablas
-- -----------------------------------------------------------------------------
alter table public.marinas enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;

-- -----------------------------------------------------------------------------
-- 5. Políticas: profiles
-- -----------------------------------------------------------------------------
-- Un usuario puede ver y editar su propio perfil.
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid() or public.is_super_admin());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and is_super_admin = (select is_super_admin from public.profiles where id = auth.uid()));
-- ^ evita que un usuario se auto-promueva a super_admin.

-- Los admins de una guardería pueden ver perfiles de sus miembros.
create policy "profiles_select_marina_members"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.memberships m1
      join public.memberships m2 on m2.marina_id = m1.marina_id
      where m1.user_id = auth.uid()
        and m1.role in ('marina_admin', 'operator')
        and m1.status = 'active'
        and m2.user_id = profiles.id
        and m2.status = 'active'
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Políticas: marinas
-- -----------------------------------------------------------------------------
-- Ver: super_admin ve todo; miembros activos ven su guardería.
create policy "marinas_select"
  on public.marinas for select
  using (public.is_super_admin() or public.is_marina_member(id));

-- Crear: solo super_admin (onboarding manual en Fase 1).
create policy "marinas_insert"
  on public.marinas for insert
  with check (public.is_super_admin());

-- Editar: super_admin o marina_admin.
create policy "marinas_update"
  on public.marinas for update
  using (public.is_super_admin() or public.is_marina_admin(id));

-- Borrar: solo super_admin.
create policy "marinas_delete"
  on public.marinas for delete
  using (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 7. Políticas: memberships
-- -----------------------------------------------------------------------------
-- Ver: el propio usuario ve sus memberships; admins ven las de su guardería.
create policy "memberships_select_own"
  on public.memberships for select
  using (user_id = auth.uid());

create policy "memberships_select_marina_admin"
  on public.memberships for select
  using (public.is_super_admin() or public.is_marina_admin(marina_id));

-- Crear: solo admins (invitar alta manual).
create policy "memberships_insert"
  on public.memberships for insert
  with check (public.is_super_admin() or public.is_marina_admin(marina_id));

-- Editar: admins (cambiar rol, suspender).
create policy "memberships_update"
  on public.memberships for update
  using (public.is_super_admin() or public.is_marina_admin(marina_id));

-- Borrar: admins.
create policy "memberships_delete"
  on public.memberships for delete
  using (public.is_super_admin() or public.is_marina_admin(marina_id));

-- -----------------------------------------------------------------------------
-- 8. Políticas: invitations
-- -----------------------------------------------------------------------------
-- Ver: admins de la guardería.
create policy "invitations_select"
  on public.invitations for select
  using (public.is_super_admin() or public.is_marina_admin(marina_id));

-- Crear/editar/borrar: admins.
create policy "invitations_insert"
  on public.invitations for insert
  with check (public.is_super_admin() or public.is_marina_admin(marina_id));

create policy "invitations_update"
  on public.invitations for update
  using (public.is_super_admin() or public.is_marina_admin(marina_id));

create policy "invitations_delete"
  on public.invitations for delete
  using (public.is_super_admin() or public.is_marina_admin(marina_id));

-- -----------------------------------------------------------------------------
-- 9. Función para aceptar invitación (transaccional, via service role)
-- -----------------------------------------------------------------------------
-- Se llama desde la Server Action con el service_role después de validar el token.
-- Crea la membership y marca la invitación como aceptada.
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

  insert into public.memberships (user_id, marina_id, role)
  values (p_user_id, v_invitation.marina_id, v_invitation.role)
  on conflict (user_id, marina_id) do update
    set role = excluded.role,
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
-- 10. Trigger para updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger marinas_touch_updated_at
  before update on public.marinas
  for each row execute function public.touch_updated_at();

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger memberships_touch_updated_at
  before update on public.memberships
  for each row execute function public.touch_updated_at();
