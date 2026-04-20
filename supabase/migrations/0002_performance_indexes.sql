-- =============================================================================
-- Performance indexes — columnas usadas en WHERE y JOIN sin índice previo
-- =============================================================================

CREATE INDEX IF NOT EXISTS embarcaciones_profile_idx
  ON embarcaciones (profile_id);

CREATE INDEX IF NOT EXISTS movimientos_servicio_idx
  ON movimientos_cuenta_corriente (servicio_id);

CREATE INDEX IF NOT EXISTS facturacion_emision_idx
  ON facturacion (emision);
