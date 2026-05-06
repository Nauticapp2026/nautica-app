-- =============================================================================
-- Cobro mensual por aniversario del espacio.
--
-- Hasta ahora el cron mensual cobraba a todos los espacios el día 1.
-- Ahora cada espacio tiene su propio "día de cobro": el día en que se
-- le asignó un ocupante. Si fue asignado el 15, los próximos cobros
-- mensuales caen el 15 de cada mes.
--
-- Esta migración solo agrega la columna; la lógica del cron y de la
-- server action `updateEspacioAction` viven en el código TS.
--
-- Convivencia con datos viejos:
--   - Espacios actualmente ocupados quedan con fecha_asignacion = NULL.
--     El cron interpreta NULL como "modelo viejo, cobrar día 1".
--   - Las nuevas asignaciones (post-deploy) llenan esta columna y pasan
--     al modelo aniversario automáticamente.
--
-- Idempotente.
-- =============================================================================

alter table public.espacios
  add column if not exists fecha_asignacion timestamptz;

comment on column public.espacios.fecha_asignacion is
  'Fecha en que se asignó el ocupante actual al espacio. Define el día de cobro mensual. NULL = modelo viejo (cobro el día 1).';
