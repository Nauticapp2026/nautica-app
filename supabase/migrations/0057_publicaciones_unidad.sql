-- Agrega unidad de medida (metros/pies) a publicaciones.
-- Reutiliza el enum unidad_metraje ya existente en la DB.

ALTER TABLE publicaciones
  ADD COLUMN unidad_metraje unidad_metraje NOT NULL DEFAULT 'metros';
