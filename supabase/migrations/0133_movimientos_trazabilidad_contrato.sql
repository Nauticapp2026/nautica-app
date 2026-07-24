-- Refactor "los cargos nacen al emitir": trazabilidad contrato→cargo e
-- idempotencia por período facturado.
--
-- Contexto: en el modelo nuevo los movimientos de cargo se crean DENTRO de la
-- transacción de emisión del comprobante (factura fiscal o comprobante
-- interno), leyendo los servicios vigentes del socio. Estas columnas permiten:
--   * saber qué contrato (socio_servicios) originó cada cargo, y de qué
--     período es (primer día del mes facturado; NULL en cargos one-shot:
--     variables, baja anticipada, notas, cobranzas);
--   * reemplazar la idempotencia por "ventana de 27 días" por una garantía
--     física: los índices únicos parciales impiden facturar dos veces el
--     mismo contrato/espacio en el mismo período, incluso ante carreras.
--
-- Los movimientos históricos quedan con ambas columnas NULL (los uniques
-- parciales no los afectan) y se drenan por el camino legacy.

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN socio_servicio_id uuid REFERENCES public.socio_servicios(id) ON DELETE SET NULL,
  ADD COLUMN periodo date;

CREATE INDEX movimientos_cc_socio_servicio_idx
  ON public.movimientos_cuenta_corriente (socio_servicio_id);

-- Garantía #1: un contrato mensual no se factura dos veces el mismo período.
CREATE UNIQUE INDEX movimientos_cc_contrato_periodo_uniq
  ON public.movimientos_cuenta_corriente (socio_servicio_id, periodo)
  WHERE socio_servicio_id IS NOT NULL AND periodo IS NOT NULL;

-- Garantía #2: un contrato one-shot (tarifa Variable) se cobra una sola vez.
CREATE UNIQUE INDEX movimientos_cc_contrato_oneshot_uniq
  ON public.movimientos_cuenta_corriente (socio_servicio_id)
  WHERE socio_servicio_id IS NOT NULL AND periodo IS NULL;

-- Garantía #3: un espacio asignado no se factura dos veces el mismo período
-- (cubre espacios legacy que no tienen fila espejo en socio_servicios).
CREATE UNIQUE INDEX movimientos_cc_espacio_periodo_uniq
  ON public.movimientos_cuenta_corriente (espacio_id, socio_id, periodo)
  WHERE espacio_id IS NOT NULL AND periodo IS NOT NULL;

-- facturacion_item_movimientos no tenía índices y el modelo nuevo lo consulta
-- en cada emisión/reenvío/cobranza.
CREATE INDEX facturacion_item_movimientos_item_idx
  ON public.facturacion_item_movimientos (facturacion_item_id);

CREATE INDEX facturacion_item_movimientos_movimiento_idx
  ON public.facturacion_item_movimientos (movimiento_id);
