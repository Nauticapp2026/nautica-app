-- =============================================================================
-- Super admin: pricing dinámico
--
-- Tablas globales (no scopeadas por guarderia) para que el super_admin
-- pueda editar la grilla de precios de la landing sin tocar código.
--
--   pricing_plans       — un row por plan (classic, plus, platinum). Guarda
--                         el `name` visible y el `rate` (precio por lugar de
--                         guarda). El precio que ve el usuario se calcula
--                         como `rate * capacidad` en el cliente.
--
--   platform_settings   — key/value JSON para settings globales. Hoy solo
--                         guarda `pricing_capacities` con la lista de
--                         capacidades del slider de la landing.
--
-- RLS:
--   - SELECT público (la landing es anónima).
--   - INSERT/UPDATE/DELETE solo super_admin (vía profiles.is_super_admin).
--
-- Idempotente.
-- =============================================================================

-- 1) pricing_plans -------------------------------------------------------------

create table if not exists public.pricing_plans (
  slug          public.plan primary key,
  name          text not null,
  rate          integer not null,
  display_order integer not null default 0,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null
);

comment on table public.pricing_plans is
  'Planes públicos de la landing. La presentación (colores, features) sigue en código; acá solo viven name y rate, que son lo que cambia seguido.';
comment on column public.pricing_plans.rate is
  'Precio por lugar de guarda (ARS). El total mostrado en la landing es rate * capacidad seleccionada.';

-- Seed: matchea los valores hardcodeados que tenía la landing antes.
insert into public.pricing_plans (slug, name, rate, display_order)
values
  ('classic',  'CLASSIC',    900, 1),
  ('plus',     'PLUS',      1200, 2),
  ('platinum', 'PLATINIUM', 1500, 3)
on conflict (slug) do nothing;

-- 2) platform_settings ---------------------------------------------------------

create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

comment on table public.platform_settings is
  'Settings globales de plataforma (no scopeados por guarderia). Genérico key/value JSON.';

-- Seed: capacidades del slider de la landing.
insert into public.platform_settings (key, value)
values
  ('pricing_capacities', '[200, 500, 700, 1000, 1500, 2000, 3000, 4000]'::jsonb)
on conflict (key) do nothing;

-- 3) RLS — lectura pública, escritura solo super_admin ------------------------

alter table public.pricing_plans     enable row level security;
alter table public.platform_settings enable row level security;

-- Lectura pública (incluye anon, la landing no requiere auth).
drop policy if exists "pricing_plans_select_public" on public.pricing_plans;
create policy "pricing_plans_select_public"
  on public.pricing_plans
  for select
  to anon, authenticated
  using (true);

drop policy if exists "platform_settings_select_public" on public.platform_settings;
create policy "platform_settings_select_public"
  on public.platform_settings
  for select
  to anon, authenticated
  using (true);

-- Escritura solo super_admin.
drop policy if exists "pricing_plans_write_super_admin" on public.pricing_plans;
create policy "pricing_plans_write_super_admin"
  on public.pricing_plans
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "platform_settings_write_super_admin" on public.platform_settings;
create policy "platform_settings_write_super_admin"
  on public.platform_settings
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
