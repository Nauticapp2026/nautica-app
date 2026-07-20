-- Backfill: vincula cada Nota de Crédito (fiscal o interna) ya emitida a su
-- propio movimiento en cuenta corriente (facturacion.movimiento_id), mismo
-- patrón que ya usan los recibos internos CM-/CL- y RC-. Antes de este fix
-- ese link no se guardaba, así que el crédito de una NC se trataba como
-- bolsa común de pagos genéricos en vez de aplicarse a su factura
-- específica (ver src/lib/nc-cobertura.ts para el detalle del bug).
--
-- Matchea por socio + tipo de movimiento 'nota_credito' + mismo importe,
-- tomando el candidato más cercano en el tiempo a la emisión de la NC (un
-- socio con varias NC del mismo importe podría tener ambigüedad — se
-- resuelve por cercanía temporal, igual criterio que otros backfills de
-- este repo, ej. 0124).

-- (LATERAL no puede correlacionar con la tabla destino de un UPDATE — eso
-- solo funciona en el WHERE de nivel superior — así que el "candidato más
-- cercano por factura" se resuelve antes, con un JOIN + DISTINCT ON, en vez
-- de una subquery lateral. Mismo ajuste que ya hizo falta en 0124.)
UPDATE facturacion f
SET movimiento_id = match.movimiento_id
FROM (
  SELECT DISTINCT ON (fc.id) fc.id AS facturacion_id, mv.id AS movimiento_id
  FROM facturacion fc
  JOIN movimientos_cuenta_corriente mv
    ON mv.socio_id = fc.socio_id
   AND mv.tipo = 'nota_credito'
   AND mv.haber = fc.importe
  WHERE fc.tipo_factura IN ('nota_credito_a', 'nota_credito_b', 'nota_credito_c', 'nota_credito_interna')
    AND fc.movimiento_id IS NULL
    AND mv.id NOT IN (
      SELECT movimiento_id FROM facturacion WHERE movimiento_id IS NOT NULL
    )
  ORDER BY fc.id, abs(extract(epoch FROM (mv.fecha - fc.emision)))
) match
WHERE f.id = match.facturacion_id;
