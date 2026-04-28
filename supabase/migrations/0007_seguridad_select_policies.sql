-- =============================================================================
-- Policies SELECT adicionales para el rol `seguridad`.
--
-- La migración 0006 dio acceso a `porteria_invitados` (SELECT/UPDATE) y a
-- `tareas` (INSERT) para rol seguridad. Pero la app mobile también consulta
-- `porteria` directamente (lista de salidas activas) y hace joins anidados
-- a `embarcaciones`, `invitados` y `profiles` (nombre del socio). Sin policies
-- explícitas de SELECT en esas tablas, el rol seguridad solo veía las suyas
-- (policies "_own"), lo que rompía:
--
--   1. La pantalla de salidas activas en mobile (RLS bloqueaba el SELECT
--      directo a porteria).
--   2. El escaneo del QR de invitados — la policy
--      `porteria_invitados_select_seguridad` (mig 0006) hace internamente
--      `exists (select 1 from public.porteria ...)`. Ese subquery también
--      pasa por la RLS del rol invocador, así que sin acceso a porteria
--      tampoco se podía leer porteria_invitados.
--   3. Los nombres de embarcación, invitado y socio en cualquier pantalla
--      de seguridad (joins anidados de PostgREST devuelven `null` cuando
--      RLS bloquea, sin error visible).
--
-- Esta migración agrega:
--   1. Helper `shares_guarderia_with_seguridad(p_user_id)` con
--      `security definer` para chequear si un user tiene membership activa
--      en una guardería del seguridad. Es `security definer` porque la RLS
--      de `memberships` solo permite a cada user ver su propia membership,
--      lo que rompería un subquery normal contra esa tabla.
--   2. Policy SELECT en `porteria` (filtra por guardería del seguridad).
--   3. Policy SELECT en `embarcaciones` (filtra por guardería del seguridad).
--   4. Policy SELECT en `invitados` (filtra por guardería del seguridad).
--   5. Policy SELECT en `profiles` usando el helper, para ver perfiles de
--      personas con membership activa en una guardería del seguridad.
--
-- Las policies existentes (admin, dueño) no se tocan; RLS evalúa por OR.
-- Idempotente: usa `drop policy if exists` y `create or replace function`.
-- Aplicada en la base productiva el 2026-04-28 directo por dashboard;
-- esta migración solo deja el cambio versionado en el repo.
-- =============================================================================

-- 1) Helper shares_guarderia_with_seguridad ------------------------------------

create or replace function public.shares_guarderia_with_seguridad(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = p_user_id
      and m.status = 'active'
      and public.is_guarderia_seguridad(m.guarderia_id)
  );
$$;

-- 2) Policy SELECT en porteria -------------------------------------------------

drop policy if exists "porteria_select_seguridad" on public.porteria;
create policy "porteria_select_seguridad"
  on public.porteria
  for select
  to authenticated
  using (public.is_guarderia_seguridad(guarderia_id));

-- 3) Policy SELECT en embarcaciones --------------------------------------------

drop policy if exists "embarcaciones_select_seguridad" on public.embarcaciones;
create policy "embarcaciones_select_seguridad"
  on public.embarcaciones
  for select
  to authenticated
  using (public.is_guarderia_seguridad(guarderia_id));

-- 4) Policy SELECT en invitados ------------------------------------------------

drop policy if exists "invitados_select_seguridad" on public.invitados;
create policy "invitados_select_seguridad"
  on public.invitados
  for select
  to authenticated
  using (public.is_guarderia_seguridad(guarderia_id));

-- 5) Policy SELECT en profiles -------------------------------------------------

drop policy if exists "profiles_select_seguridad" on public.profiles;
create policy "profiles_select_seguridad"
  on public.profiles
  for select
  to authenticated
  using (public.shares_guarderia_with_seguridad(profiles.id));
