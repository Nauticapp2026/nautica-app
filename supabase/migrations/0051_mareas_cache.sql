-- =============================================================================
-- 0051 — Cache de tablas de mareas del SHN (Servicio de Hidrografia Naval).
--
-- Motivo: la pantalla Clima > Mareas de la app mobile reemplaza el embed de
-- tablademareas.com por una UI propia. La fuente es el SHN argentino, que
-- expone un form POST a `RE_TablasDeMarea.asp` y devuelve HTML. Como el
-- contenido es estatico por (puerto, anio, mes) y predicho para todo el ano
-- en curso, podemos cachear localmente sin volver a pegarle al SHN.
--
-- Una sola fila por (puerto, anio, mes). El payload trae la lista de eventos
-- ya parseados, con tipo pleamar/bajamar inferido y altura en metros.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.mareas_cache (
  puerto      text        not null,
  anio        integer     not null,
  mes         integer     not null,
  payload     jsonb       not null,
  fetched_at  timestamptz not null default now(),
  primary key (puerto, anio, mes),
  constraint mareas_cache_mes_chk check (mes between 1 and 12),
  constraint mareas_cache_anio_chk check (anio between 2020 and 2099)
);

comment on table public.mareas_cache is
  'Cache de tablas mensuales de mareas del SHN. payload jsonb tiene la lista de eventos (dia, hora, altura, tipo). TTL logico 24h: el endpoint mobile re-fetchea si fetched_at quedo viejo.';

-- RLS: la consume el endpoint /api/mareas con service role; ningun cliente
-- la lee directo. La habilitamos por las dudas y no creamos policies.
alter table public.mareas_cache enable row level security;
