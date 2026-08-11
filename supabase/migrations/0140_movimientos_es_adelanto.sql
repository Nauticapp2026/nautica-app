-- Marca explícita en el movimiento de pago: es un adelanto sin comprobante
-- (Cobranzas -> "Continuar sin comprobantes"), no un cobro real aplicado a
-- algo. El pool de saldo a favor (reconciliar-cuenta.ts) la necesita para
-- distinguir esa plata de un excedente real y no usarla para saldar solo
-- cargos viejos sin que el club lo decida (pedido cliente 2026-08-11): un
-- adelanto suma como crédito disponible, pero no salda nada por sí mismo —
-- solo se aplica cuando el club lo usa a mano (Cobranzas, tildando un
-- comprobante) o cuando el débito automático de Payway lo consume al cobrar
-- (esos dos caminos no cambian: siguen viendo toda la plata como siempre).

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN es_adelanto boolean NOT NULL DEFAULT false;

-- Backfill: pagos ya existentes cuyo recibo (RC-/CI-) nunca tuvo comprobantes
-- seleccionados (cobranza_comprobante_ids vacío) son adelantos históricos.
UPDATE public.movimientos_cuenta_corriente m
SET es_adelanto = true
FROM public.facturacion f
WHERE f.movimiento_id = m.id
  AND f.tipo_factura = 'recibo'
  AND (f.codigo LIKE 'RC-%' OR f.codigo LIKE 'CI-%')
  AND (f.cobranza_comprobante_ids IS NULL OR cardinality(f.cobranza_comprobante_ids) = 0);
