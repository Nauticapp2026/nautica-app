-- =============================================================================
-- Super admin: comunicaciones de plataforma
--
-- Tabla cross-tenant para comunicaciones que el super_admin publica a nivel
-- NauticApp (no de una guardería específica). Misma estructura que la tabla
-- `comunicaciones`, sin `guarderia_id`.
--
-- RLS:
--   - SELECT: cualquier authenticated (la mobile y la web las leen).
--   - INSERT/UPDATE/DELETE: solo super_admin (vía profiles.is_super_admin).
--
-- Idempotente.
-- =============================================================================

create table if not exists public.platform_comunicaciones (
  id         uuid primary key default gen_random_uuid(),
  autor_id   uuid references public.profiles(id) on delete set null,
  titulo     text not null,
  texto      text,
  categoria  public.categoria_comunicacion,
  tipo       public.tipo_comunicacion default 'socios',
  publicar   boolean default false,
  fecha      timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_comunicaciones is
  'Comunicaciones a nivel plataforma NauticApp (no scopeadas por guardería). Solo super admin puede crearlas/editarlas.';

create index if not exists platform_comunicaciones_publicar_idx
  on public.platform_comunicaciones (publicar, fecha desc);

-- RLS ------------------------------------------------------------------------

alter table public.platform_comunicaciones enable row level security;

drop policy if exists "platform_comunicaciones_select_authenticated"
  on public.platform_comunicaciones;
create policy "platform_comunicaciones_select_authenticated"
  on public.platform_comunicaciones
  for select
  to authenticated
  using (true);

drop policy if exists "platform_comunicaciones_write_super_admin"
  on public.platform_comunicaciones;
create policy "platform_comunicaciones_write_super_admin"
  on public.platform_comunicaciones
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
