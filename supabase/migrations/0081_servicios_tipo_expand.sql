-- Expande las categorías del tarifario:
--   espacios       → espacio_guarda
--   cuota_mensual  → cuota_social (sin medida en UI)
--   servicios      → servicio_extra
--   + nuevos: membresia, expensas_ordinarias, expensas_extraordinarias

CREATE TYPE tipo_servicio_new AS ENUM (
  'espacio_guarda',
  'cuota_social',
  'membresia',
  'expensas_ordinarias',
  'expensas_extraordinarias',
  'servicio_extra'
);

ALTER TABLE servicios
  ALTER COLUMN tipo TYPE tipo_servicio_new
  USING (
    CASE tipo::text
      WHEN 'espacios'      THEN 'espacio_guarda'::tipo_servicio_new
      WHEN 'cuota_mensual' THEN 'cuota_social'::tipo_servicio_new
      WHEN 'servicios'     THEN 'servicio_extra'::tipo_servicio_new
      ELSE                      'servicio_extra'::tipo_servicio_new
    END
  );

DROP TYPE tipo_servicio;
ALTER TYPE tipo_servicio_new RENAME TO tipo_servicio;
