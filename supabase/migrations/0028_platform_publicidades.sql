-- =============================================================================
-- Super admin: publicidades de plataforma
--
-- Tabla cross-tenant para banners publicitarios que el super_admin sube a nivel
-- NauticApp y consume la app mobile en sus bloques "PUBLICIDAD".
--
-- Hay dos formatos soportados (definidos por el diseño de la app mobile):
--   - 350x300  (banner cuadrado)
--   - 353x119  (banner horizontal)
-- El super admin elige el formato al cargar y la mobile filtra por `tamano`
-- para llenar el slot correspondiente.
--
-- RLS:
--   - SELECT: cualquier authenticated (la mobile las lee).
--   - INSERT/UPDATE/DELETE: solo super_admin (vía profiles.is_super_admin).
--
-- Idempotente.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tamano_publicidad') then
    create type public.tamano_publicidad as enum ('350x300', '353x119');
  end if;
end$$;

create table if not exists public.platform_publicidades (
  id          uuid primary key default gen_random_uuid(),
  autor_id    uuid references public.profiles(id) on delete set null,
  titulo      text not null,
  texto       text,
  tamano      public.tamano_publicidad not null,
  link_url    text,
  imagen_urls text[],
  publicar    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.platform_publicidades is
  'Publicidades a nivel plataforma NauticApp consumidas por la app mobile. Cada publicidad tiene un tamaño fijo (350x300 o 353x119) que define en qué slot puede mostrarse.';

create index if not exists platform_publicidades_publicar_tamano_idx
  on public.platform_publicidades (publicar, tamano, created_at desc);

-- RLS ------------------------------------------------------------------------

alter table public.platform_publicidades enable row level security;

drop policy if exists "platform_publicidades_select_authenticated"
  on public.platform_publicidades;
create policy "platform_publicidades_select_authenticated"
  on public.platform_publicidades
  for select
  to authenticated
  using (true);

drop policy if exists "platform_publicidades_write_super_admin"
  on public.platform_publicidades;
create policy "platform_publicidades_write_super_admin"
  on public.platform_publicidades
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
