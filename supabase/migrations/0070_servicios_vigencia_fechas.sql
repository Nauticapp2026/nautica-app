-- Agrega vigencia (desde/hasta) a la tabla servicios.
-- Los registros existentes reciben un rango "siempre vigente" para no romper el flujo actual.

ALTER TABLE servicios
  ADD COLUMN vigencia_desde date,
  ADD COLUMN vigencia_hasta date;

UPDATE servicios
SET vigencia_desde = '2020-01-01',
    vigencia_hasta = '2099-12-31';

ALTER TABLE servicios
  ALTER COLUMN vigencia_desde SET NOT NULL,
  ALTER COLUMN vigencia_hasta SET NOT NULL;
