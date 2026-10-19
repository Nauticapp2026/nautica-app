-- =============================================================================
-- 0170 — Reglamento del club: versiones y aceptaciones.
--
-- Pedido del cliente (2026-10-19): el club tiene que poder cargar desde "Mi
-- perfil" su reglamento con todos los términos y condiciones de contratación, y
-- el socio lo tiene que poder leer y aceptar desde la app. Contemplar que el club
-- pueda subir actualizaciones.
--
-- Modelo (parecido a los Términos y Condiciones de la plataforma, mig 0042, pero
-- POR CLUB):
--
--   1) reglamentos_club
--        Una fila por versión publicada. La vigente es la de mayor `version` de
--        ese club. El reglamento es un PDF en el bucket privado `documentos`
--        (path reglamentos/<guarderia_id>/...). Publicar una versión nueva NO
--        borra las anteriores: quedan como historial y conservan sus aceptaciones.
--        - Lo publica el admin del club desde el web (server action con Drizzle,
--          que no pasa por RLS): por eso no hay policies de escritura.
--        - SELECT para los miembros activos del club (la app mobile lo lee directo).
--
--   2) reglamento_aceptaciones
--        Una fila por socio y por versión aceptada. Inmutable: no hay policies de
--        update ni de delete.
--        - El socio inserta y ve solo las suyas; el admin del club ve todas las
--          de su club (para saber quién falta aceptar).
--
-- El PDF NO se lee con una policy de storage (las policies del bucket viven en el
-- dashboard, no en git): la app pide un link firmado a /api/reglamento/url, que
-- valida que el usuario sea miembro del club.
--
-- Tablas nuevas: no cambia nada para el código anterior. Idempotente.
-- =============================================================================

-- 1) reglamentos_club ---------------------------------------------------------

create table if not exists public.reglamentos_club (
  id             uuid primary key default gen_random_uuid(),
  guarderia_id   uuid not null references public.guarderias(id) on delete cascade,
  version        integer not null,
  titulo         text not null,
  novedades      text,
  archivo_path   text not null,
  archivo_nombre text not null,
  publicado_en   timestamptz not null default now(),
  publicado_por  uuid references public.profiles(id) on delete set null,
  constraint reglamentos_club_version_positiva check (version >= 1),
  constraint reglamentos_club_version_unica unique (guarderia_id, version)
);

create index if not exists reglamentos_club_guarderia_version_idx
  on public.reglamentos_club (guarderia_id, version desc);

comment on table public.reglamentos_club is
  'Versiones del reglamento de cada club (PDF). La vigente es la de mayor version de la guardería.';
comment on column public.reglamentos_club.novedades is
  'Qué cambió respecto de la versión anterior (opcional). Se le muestra al socio que tiene que volver a aceptar.';

alter table public.reglamentos_club enable row level security;

drop policy if exists "reglamentos_club_select" on public.reglamentos_club;
create policy "reglamentos_club_select"
  on public.reglamentos_club
  for select
  to authenticated
  using (public.is_guarderia_member(guarderia_id) or public.is_super_admin());

-- 2) reglamento_aceptaciones --------------------------------------------------

create table if not exists public.reglamento_aceptaciones (
  id            uuid primary key default gen_random_uuid(),
  reglamento_id uuid not null references public.reglamentos_club(id) on delete cascade,
  guarderia_id  uuid not null references public.guarderias(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  aceptado_en   timestamptz not null default now(),
  constraint reglamento_aceptaciones_unica unique (reglamento_id, user_id)
);

create index if not exists reglamento_aceptaciones_guarderia_idx
  on public.reglamento_aceptaciones (guarderia_id, reglamento_id);

create index if not exists reglamento_aceptaciones_user_idx
  on public.reglamento_aceptaciones (user_id);

comment on table public.reglamento_aceptaciones is
  'Aceptación de una versión del reglamento por un socio. Inmutable.';

alter table public.reglamento_aceptaciones enable row level security;

drop policy if exists "reglamento_aceptaciones_select" on public.reglamento_aceptaciones;
create policy "reglamento_aceptaciones_select"
  on public.reglamento_aceptaciones
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_guarderia_admin(guarderia_id)
    or public.is_super_admin()
  );

-- Solo se puede aceptar a nombre propio, siendo miembro del club, y el reglamento
-- tiene que ser de ESE club (no se acepta un reglamento ajeno).
drop policy if exists "reglamento_aceptaciones_insert" on public.reglamento_aceptaciones;
create policy "reglamento_aceptaciones_insert"
  on public.reglamento_aceptaciones
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_guarderia_member(guarderia_id)
    and exists (
      select 1 from public.reglamentos_club r
      where r.id = reglamento_aceptaciones.reglamento_id
        and r.guarderia_id = reglamento_aceptaciones.guarderia_id
    )
  );
