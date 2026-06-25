-- =============================================================================
-- 0104 — Performance: índices compuestos en movimientos_cuenta_corriente y
--        facturacion para los filtros más frecuentes.
-- =============================================================================
--
-- Contexto: los listados filtran seguido por (socio, estado), (socio, fecha) y
-- (guardería, estado / emisión). Con índices solo de una columna, esos filtros
-- terminan en seq scan a medida que crecen las tablas. Estos compuestos cubren
-- los patrones reales de query del detalle de socio, el dashboard (morosos) y
-- el listado de comprobantes.
--
-- NOTA: CREATE INDEX (sin CONCURRENTLY) toma un lock breve en la tabla, pero
-- con el volumen actual es instantáneo, así que corre sin problema en el SQL
-- Editor de Supabase. IF NOT EXISTS lo hace idempotente. Si en el futuro estas
-- tablas crecen mucho y hay que recrear un índice sin bloquear, usar
-- CONCURRENTLY desde una conexión directa (puerto 5432, fuera de transacción),
-- NO desde el SQL Editor (que envuelve todo en una transacción).
-- =============================================================================

-- movimientos_cuenta_corriente
CREATE INDEX IF NOT EXISTS movimientos_socio_estado_idx
  ON movimientos_cuenta_corriente (socio_id, estado);

CREATE INDEX IF NOT EXISTS movimientos_socio_fecha_idx
  ON movimientos_cuenta_corriente (socio_id, fecha);

-- facturacion
CREATE INDEX IF NOT EXISTS facturacion_guarderia_estado_idx
  ON facturacion (guarderia_id, estado);

CREATE INDEX IF NOT EXISTS facturacion_guarderia_emision_idx
  ON facturacion (guarderia_id, emision);
