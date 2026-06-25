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
-- IMPORTANTE: se usa CREATE INDEX CONCURRENTLY para NO bloquear la tabla en
-- producción. CONCURRENTLY no puede correr dentro de una transacción — ejecutar
-- cada statement por separado en el SQL Editor de Supabase (o con un script que
-- no envuelva todo en una transacción). IF NOT EXISTS lo hace idempotente.
-- =============================================================================

-- movimientos_cuenta_corriente
CREATE INDEX CONCURRENTLY IF NOT EXISTS movimientos_socio_estado_idx
  ON movimientos_cuenta_corriente (socio_id, estado);

CREATE INDEX CONCURRENTLY IF NOT EXISTS movimientos_socio_fecha_idx
  ON movimientos_cuenta_corriente (socio_id, fecha);

-- facturacion
CREATE INDEX CONCURRENTLY IF NOT EXISTS facturacion_guarderia_estado_idx
  ON facturacion (guarderia_id, estado);

CREATE INDEX CONCURRENTLY IF NOT EXISTS facturacion_guarderia_emision_idx
  ON facturacion (guarderia_id, emision);
