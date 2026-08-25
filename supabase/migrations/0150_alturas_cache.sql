-- =============================================================================
-- 0150 — Cache de altura de rios de Prefectura Naval Argentina.
--
-- Motivo: la pantalla Clima de la app mobile suma una tercera solapa "Alturas"
-- con el nivel de los rios medido por Prefectura. La fuente es la capa
-- "DSIG_Altura_Rios" (item af05ec8b076e4fb09eb988c34a055eb5) publicada como
-- ArcGIS Feature Service en prefectura.maps.arcgis.com.
--
-- El servicio NO es publico: pide token de ArcGIS y el item esta compartido
-- solo con el grupo "NAUTICAPP". Por eso la mobile no le pega directo — el
-- endpoint /api/alturas guarda las credenciales server-side, consulta ArcGIS
-- y cachea la respuesta normalizada aca.
--
-- La capa devuelve las ~90 estaciones del pais en una sola query, asi que el
-- cache es una unica fila. `clave` existe solo para darle un PK estable al
-- upsert (y por si mas adelante cacheamos otra capa de Prefectura).
--
-- TTL logico: 30 min (Prefectura publica una medicion por hora). El endpoint
-- re-fetchea si fetched_at quedo viejo; si ArcGIS falla, devuelve esta fila
-- marcada como stale antes que romper la pantalla.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.alturas_cache (
  clave       text        not null primary key,
  payload     jsonb       not null,
  fetched_at  timestamptz not null default now()
);

comment on table public.alturas_cache is
  'Cache de la capa DSIG_Altura_Rios de Prefectura Naval. payload jsonb tiene { estaciones: [...], actualizado }. TTL logico 30 min: /api/alturas re-fetchea si fetched_at quedo viejo.';

comment on column public.alturas_cache.clave is
  'Identificador de la capa cacheada. Hoy solo "dsig_altura_rios".';

-- RLS: la consume el endpoint /api/alturas con service role; ningun cliente la
-- lee directo. La habilitamos y no creamos policies (mismo criterio que
-- mareas_cache en 0051).
alter table public.alturas_cache enable row level security;
