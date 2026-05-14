-- =============================================================================
-- Super admin: editor de features por plan
--
-- Pasa el listado de features de los planes de "hardcoded en dos lugares"
-- (landing/pricing-client.tsx + configuracion-client.tsx) a DB, para que el
-- super admin lo edite desde /super-admin/pricing.
--
--   pricing_features        — el listado canónico. Cada row = una feature, con
--                             su grupo (solo para agrupar en el editor del
--                             super admin) y su label visible. display_order
--                             define el orden vertical en el grid.
--
--   pricing_plan_features   — el valor de cada (plan, feature). String libre,
--                             nullable.
--                               · NULL/'' = no incluido (no se muestra en
--                                 landing/onboarding/tab Plan; '—' en grid).
--                               · '✓'     = incluido (se muestra el label
--                                 de la feature tal cual en cards).
--                               · otro    = incluido con detalle (ej '2 / mes',
--                                 '30 días gratis'); se muestra '{label}: {value}'
--                                 en cards y `value` literal en el grid.
--
-- RLS: SELECT público (lectura desde landing anónima), INSERT/UPDATE/DELETE
-- solo super_admin (vía public.is_super_admin()).
--
-- Idempotente.
-- =============================================================================

-- 1) pricing_features ----------------------------------------------------------

create table if not exists public.pricing_features (
  id            text primary key,
  group_label   text not null,
  label         text not null,
  display_order integer not null default 0,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null
);

comment on table public.pricing_features is
  'Listado canónico de features de los planes. group_label se usa solo en el grid del super admin; landing/onboarding/admin lo ignoran y muestran lista plana.';

-- 2) pricing_plan_features -----------------------------------------------------

create table if not exists public.pricing_plan_features (
  plan_slug   public.plan not null,
  feature_id  text not null references public.pricing_features(id) on delete cascade,
  value       text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null,
  primary key (plan_slug, feature_id)
);

comment on column public.pricing_plan_features.value is
  'NULL/'''' = no incluido; ''✓'' = incluido sin valor extra; otro string = incluido con detalle (ej ''2 / mes'').';

-- 3) RLS — lectura pública, escritura solo super_admin ------------------------

alter table public.pricing_features       enable row level security;
alter table public.pricing_plan_features  enable row level security;

drop policy if exists "pricing_features_select_public" on public.pricing_features;
create policy "pricing_features_select_public"
  on public.pricing_features
  for select
  to anon, authenticated
  using (true);

drop policy if exists "pricing_features_write_super_admin" on public.pricing_features;
create policy "pricing_features_write_super_admin"
  on public.pricing_features
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "pricing_plan_features_select_public" on public.pricing_plan_features;
create policy "pricing_plan_features_select_public"
  on public.pricing_plan_features
  for select
  to anon, authenticated
  using (true);

drop policy if exists "pricing_plan_features_write_super_admin" on public.pricing_plan_features;
create policy "pricing_plan_features_write_super_admin"
  on public.pricing_plan_features
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- 4) Seed inicial con el listado del Excel "NauticApp Planes Clubes 2026" -----

insert into public.pricing_features (id, group_label, label, display_order) values
  -- BASE — INCLUIDO EN TODOS LOS PLANES
  ('base_facturacion_automatica',  'BASE — INCLUIDO EN TODOS LOS PLANES', 'Facturación automática (Tusfacturas + Paywey)',    10),
  ('base_ingresos_qr',             'BASE — INCLUIDO EN TODOS LOS PLANES', 'Ingresos por QR (alerta al operario al instante)', 20),
  ('base_app_socio',               'BASE — INCLUIDO EN TODOS LOS PLANES', 'App del socio completa',                            30),
  ('base_tareas_operarios',        'BASE — INCLUIDO EN TODOS LOS PLANES', 'Gestión de tareas de operarios (Kanban)',           40),
  ('base_gestion_espacios',        'BASE — INCLUIDO EN TODOS LOS PLANES', 'Gestión de espacios (peines, amarras, áreas)',      50),
  ('base_lavados',                 'BASE — INCLUIDO EN TODOS LOS PLANES', 'Lavados',                                           60),
  ('base_documentos_socio',        'BASE — INCLUIDO EN TODOS LOS PLANES', 'Carga de documentos del socio',                     70),

  -- COMUNICACIONES
  ('com_cerrada',                  'COMUNICACIONES',                      'Comunicación cerrada (solo socios del club)',       110),
  ('com_abierta',                  'COMUNICACIONES',                      'Comunicación abierta (toda la comunidad NauticApp)', 120),
  ('com_push',                     'COMUNICACIONES',                      'Notificaciones push',                                130),

  -- NAUTISHOP — VISIBILIDAD DEL CLUB
  ('nautishop_publicaciones',      'NAUTISHOP — VISIBILIDAD DEL CLUB',    'Amarras y camas publicadas en Nautishop',           210),
  ('nautishop_shop_club',          'NAUTISHOP — VISIBILIDAD DEL CLUB',    'Shop del club en Nautishop',                        220),

  -- DIFERENCIADORES ÉLITE
  ('elite_blindaje',               'DIFERENCIADORES ÉLITE',               'Blindaje competitivo (socios no ven otros clubes)', 310),
  ('elite_primero_busqueda',       'DIFERENCIADORES ÉLITE',               'Primeros en búsqueda por zona',                     320),

  -- LANZAMIENTO
  ('lanzamiento_bonificacion',     'LANZAMIENTO',                         'Bonificación de lanzamiento',                       410)
on conflict (id) do nothing;

-- Valores por plan (Excel NauticApp Planes Clubes 2026)
insert into public.pricing_plan_features (plan_slug, feature_id, value) values
  -- BASE — todas ✓ en los 3 planes
  ('esencial', 'base_facturacion_automatica',  '✓'),
  ('club',     'base_facturacion_automatica',  '✓'),
  ('elite',    'base_facturacion_automatica',  '✓'),
  ('esencial', 'base_ingresos_qr',             '✓'),
  ('club',     'base_ingresos_qr',             '✓'),
  ('elite',    'base_ingresos_qr',             '✓'),
  ('esencial', 'base_app_socio',               '✓'),
  ('club',     'base_app_socio',               '✓'),
  ('elite',    'base_app_socio',               '✓'),
  ('esencial', 'base_tareas_operarios',        '✓'),
  ('club',     'base_tareas_operarios',        '✓'),
  ('elite',    'base_tareas_operarios',        '✓'),
  ('esencial', 'base_gestion_espacios',        '✓'),
  ('club',     'base_gestion_espacios',        '✓'),
  ('elite',    'base_gestion_espacios',        '✓'),
  ('esencial', 'base_lavados',                 '✓'),
  ('club',     'base_lavados',                 '✓'),
  ('elite',    'base_lavados',                 '✓'),
  ('esencial', 'base_documentos_socio',        '✓'),
  ('club',     'base_documentos_socio',        '✓'),
  ('elite',    'base_documentos_socio',        '✓'),

  -- COMUNICACIONES
  ('esencial', 'com_cerrada',                  '2 / mes'),
  ('club',     'com_cerrada',                  '2 / mes'),
  ('elite',    'com_cerrada',                  '5 / mes'),
  ('club',     'com_abierta',                  '2 / mes'),
  ('elite',    'com_abierta',                  '2 / mes'),
  ('elite',    'com_push',                     '✓'),

  -- NAUTISHOP
  ('club',     'nautishop_publicaciones',      '2 publ.'),
  ('elite',    'nautishop_publicaciones',      '5 publ.'),
  ('club',     'nautishop_shop_club',          '✓'),
  ('elite',    'nautishop_shop_club',          '✓'),

  -- DIFERENCIADORES ÉLITE
  ('elite',    'elite_blindaje',               '✓'),
  ('elite',    'elite_primero_busqueda',       '✓'),

  -- LANZAMIENTO — los 3 igual
  ('esencial', 'lanzamiento_bonificacion',     '30 días gratis'),
  ('club',     'lanzamiento_bonificacion',     '30 días gratis'),
  ('elite',    'lanzamiento_bonificacion',     '30 días gratis')
on conflict (plan_slug, feature_id) do nothing;
