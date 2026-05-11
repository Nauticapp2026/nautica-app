-- =============================================================================
-- Asegura que la columna espacios.offset exista. La columna estaba declarada
-- en el schema de Drizzle desde el inicio, pero nunca llegó a la DB de
-- producción (drizzle/0000_same_blockbuster.sql no se aplicó tal cual).
--
-- Se usa para mantener el orden de los espacios dentro de un piso (nave) o
-- peine (marina). El drag-and-drop de reordenamiento setea offset al índice
-- del array luego del move. Default 0 para los espacios existentes.
--
-- Idempotente.
-- =============================================================================

alter table public.espacios
  add column if not exists "offset" integer not null default 0;
