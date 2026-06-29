-- =============================================================================
-- Ajustes de precio programados a futuro (tarifario → Ajuste masivo).
--
-- Cuando un admin hace un "Ajuste masivo" con `vigencia desde` en el futuro,
-- el precio NO se cambia en el momento: se agenda en esta tabla y el cron
-- diario (`/api/cron/mensuales` → runAjustesProgramados) lo aplica el día
-- indicado. Hasta entonces, la UI muestra el precio actual + el cambio
-- programado.
--
-- Regla de producto: un solo ajuste PENDIENTE por servicio (último gana). La
-- app borra el pendiente previo antes de insertar el nuevo.
--
-- El precio nuevo se "congela" al momento de programar (snapshot): para
-- porcentajes se calcula sobre el precio vigente en ese instante.
--
-- Idempotente. Correr desde el SQL Editor de Supabase.
-- =============================================================================

create table if not exists public.servicios_ajustes_programados (
  id               uuid primary key default gen_random_uuid(),
  servicio_id      uuid not null references public.servicios(id) on delete cascade,
  guarderia_id     uuid not null references public.guarderias(id) on delete cascade,
  precio_nuevo     numeric(12, 2) not null,
  -- 'masivo_porcentaje' | 'masivo_monto' — se usa como origen al escribir el
  -- historial cuando el cron aplica el cambio.
  origen           text not null default 'masivo_porcentaje',
  fecha_aplicacion date not null,
  aplicado         boolean not null default false,
  aplicado_at      timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

comment on table public.servicios_ajustes_programados is
  'Ajustes de precio del tarifario agendados a futuro. Aplicados por el cron diario en su fecha_aplicacion.';

-- Un único ajuste pendiente por servicio (último gana: la app borra el previo).
create unique index if not exists servicios_ajustes_prog_un_pendiente_idx
  on public.servicios_ajustes_programados (servicio_id)
  where aplicado = false;

-- El cron busca pendientes vencidos por fecha.
create index if not exists servicios_ajustes_prog_pendientes_idx
  on public.servicios_ajustes_programados (fecha_aplicacion)
  where aplicado = false;

create index if not exists servicios_ajustes_prog_guarderia_idx
  on public.servicios_ajustes_programados (guarderia_id);

-- RLS -----------------------------------------------------------------------
-- SELECT: super admin o admin de la guardería dueña del registro (la app lee
-- vía Drizzle/pooler, que bypassa RLS; esto es defensa en profundidad).
-- INSERT/UPDATE/DELETE: sin policies. La app escribe vía Drizzle (rol postgres,
-- bypassa RLS); ningún cliente authenticated escribe directo.

alter table public.servicios_ajustes_programados enable row level security;

drop policy if exists "servicios_ajustes_prog_select_admin" on public.servicios_ajustes_programados;
create policy "servicios_ajustes_prog_select_admin"
  on public.servicios_ajustes_programados
  for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_guarderia_admin(guarderia_id)
  );
