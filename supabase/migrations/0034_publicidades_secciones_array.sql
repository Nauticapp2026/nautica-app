-- =============================================================================
-- Publicidades: pasar de una única sección (seccion) a múltiples secciones
-- (secciones text[] del enum publicidad_seccion).
--
-- - Si una publi tenía seccion=null, su secciones queda null (= todas las
--   secciones de su tamaño, comportamiento de antes).
-- - Si tenía seccion='home', su secciones queda {home}.
--
-- Mobile coordinará el filtro: la query pasa de `eq('seccion', x)` a algo
-- como `or('secciones.is.null,secciones.cs.{x}')` (PostgREST "contains").
-- =============================================================================

-- 1. Nueva columna como array.
alter table public.platform_publicidades
  add column if not exists secciones public.publicidad_seccion[];

-- 2. Backfill: convertir los valores singulares existentes a arrays de 1
--    elemento. Idempotente (solo afecta filas que tienen seccion pero
--    todavía no tienen secciones).
update public.platform_publicidades
set secciones = array[seccion]
where seccion is not null and secciones is null;

-- 3. Borrar la columna vieja.
alter table public.platform_publicidades
  drop column if exists seccion;
