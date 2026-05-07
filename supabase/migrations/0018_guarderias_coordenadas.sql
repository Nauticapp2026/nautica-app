-- =============================================================================
-- Coordenadas geográficas de cada guardería.
--
-- La app móvil tiene una pantalla de clima (Open-Meteo) y mapa de viento
-- (Windy embed) que necesitan lat/long del club. Para no pedirle al admin
-- que las cargue a mano, las completamos con un geocoding automático
-- (Nominatim/OpenStreetMap) a partir de los campos que ya carga:
-- direccion + ciudad + provincia.
--
-- - `latitud` y `longitud` son nullable: si el geocoding falla queda en NULL
--   y la app móvil cae en un fallback (zona del Tigre por default).
-- - El geocoding lo dispara el código TS (server action de configuración y
--   de onboarding) cuando alguno de esos tres campos cambia.
-- - 6 decimales = ~10cm de precisión, más que suficiente para clima.
--
-- Idempotente.
-- =============================================================================

alter table public.guarderias
  add column if not exists latitud numeric(9,6);

alter table public.guarderias
  add column if not exists longitud numeric(9,6);

comment on column public.guarderias.latitud is
  'Latitud del club (geocodificada desde direccion+ciudad+provincia con Nominatim). NULL si el geocoding falló.';

comment on column public.guarderias.longitud is
  'Longitud del club (geocodificada desde direccion+ciudad+provincia con Nominatim). NULL si el geocoding falló.';
