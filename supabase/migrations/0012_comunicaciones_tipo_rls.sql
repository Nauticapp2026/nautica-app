-- =============================================================================
-- RLS por `tipo` para `comunicaciones` (por guardería) y `platform_comunicaciones`
-- (cross-tenant). Implementa la regla de visibilidad:
--
--   tipo='publica' → cualquier miembro de la guardería (o cualquier
--                    authenticated en platform_comunicaciones).
--   tipo='socios'  → solo si el user tiene rol 'socio' en esa guardería
--                    (o en cualquier guardería en platform_comunicaciones).
--
-- Super admin tiene bypass via `is_super_admin()`.
--
-- Nota: `comunicaciones` no tenía RLS antes (faltaba migración). Esta también
-- la habilita y agrega INSERT/UPDATE/DELETE policies (admin de la guardería).
-- El admin web sigue viendo todas las comunicaciones porque usa la conexión
-- Drizzle (postgres user), que bypasea RLS. La filtración aplica al cliente
-- Supabase (mobile, eventualmente landing).
--
-- Idempotente.
-- =============================================================================

-- 1) comunicaciones (por guardería) -------------------------------------------

alter table public.comunicaciones enable row level security;

drop policy if exists "comunicaciones_select_member" on public.comunicaciones;
create policy "comunicaciones_select_member"
  on public.comunicaciones
  for select
  to authenticated
  using (
    public.is_super_admin()
    or (
      public.is_guarderia_member(guarderia_id)
      and (
        tipo = 'publica'
        or (
          tipo = 'socios'
          and public.guarderia_rol(guarderia_id) = 'socio'
        )
      )
    )
  );

drop policy if exists "comunicaciones_insert_admin" on public.comunicaciones;
create policy "comunicaciones_insert_admin"
  on public.comunicaciones
  for insert
  to authenticated
  with check (
    public.is_super_admin()
    or public.is_guarderia_admin(guarderia_id)
  );

drop policy if exists "comunicaciones_update_admin" on public.comunicaciones;
create policy "comunicaciones_update_admin"
  on public.comunicaciones
  for update
  to authenticated
  using (
    public.is_super_admin()
    or public.is_guarderia_admin(guarderia_id)
  )
  with check (
    public.is_super_admin()
    or public.is_guarderia_admin(guarderia_id)
  );

drop policy if exists "comunicaciones_delete_admin" on public.comunicaciones;
create policy "comunicaciones_delete_admin"
  on public.comunicaciones
  for delete
  to authenticated
  using (
    public.is_super_admin()
    or public.is_guarderia_admin(guarderia_id)
  );

-- 2) platform_comunicaciones (cross-tenant) -----------------------------------

-- Reemplaza la policy "ven todas si están authenticated" de la migración 0011
-- por una que filtra por tipo.
drop policy if exists "platform_comunicaciones_select_authenticated"
  on public.platform_comunicaciones;

create policy "platform_comunicaciones_select_authenticated"
  on public.platform_comunicaciones
  for select
  to authenticated
  using (
    public.is_super_admin()
    or tipo = 'publica'
    or (
      tipo = 'socios'
      and exists (
        select 1
        from public.memberships
        where user_id = auth.uid()
          and rol = 'socio'
          and status = 'active'
      )
    )
  );
