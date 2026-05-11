-- =============================================================================
-- 0027 — Agrega avatar_url a profiles (sync Drizzle ↔ SQL)
-- =============================================================================
-- La columna `avatar_url` existe hace tiempo en el schema Drizzle del admin
-- (src/lib/db/schema.ts) pero nunca tuvo una migración SQL que la cree en la
-- base. La mobile la usa para guardar la foto de perfil del socio; sin esta
-- columna el UPDATE pasa silenciosamente sin actualizar nada.
--
-- Idempotente: si la columna ya existe (alguien corrió drizzle push), no hace
-- nada.
-- =============================================================================

alter table public.profiles
  add column if not exists avatar_url text;
