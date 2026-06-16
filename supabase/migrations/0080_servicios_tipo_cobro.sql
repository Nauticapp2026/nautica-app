-- Agrega el campo tipo_cobro a servicios para distinguir entre
-- Servicio fijo (se cobra todos los meses) y Servicio variable.
-- Es solo informativo, no afecta la lógica de cobro.

CREATE TYPE tipo_cobro_servicio AS ENUM ('fijo', 'variable');

ALTER TABLE servicios
  ADD COLUMN tipo_cobro tipo_cobro_servicio NOT NULL DEFAULT 'fijo';
