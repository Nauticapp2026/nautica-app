-- =============================================================================
-- 0026 — Agrega foto_url y eslora_m a embarcaciones
-- =============================================================================
-- foto_url: URL pública de una imagen del barco. El cliente sube al bucket
-- Storage 'embarcaciones' (creado manualmente desde Dashboard, público)
-- en path '<profile_id>/<timestamp>.<ext>' y guarda acá la URL resultante.
--
-- eslora_m: largo de la embarcación en metros. Editable desde mobile y admin.
-- =============================================================================

alter table public.embarcaciones
  add column if not exists foto_url text;

alter table public.embarcaciones
  add column if not exists eslora_m numeric(6, 2);
