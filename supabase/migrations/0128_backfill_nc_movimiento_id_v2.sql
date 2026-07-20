-- La migración 0127 no encontró candidatos: exigía movimientos_cuenta_corriente.tipo
-- = 'nota_credito', pero ese tipo recién se empezó a grabar con el fix de esta
-- sesión — los créditos de NC emitidos ANTES (ej. el de Romina, tipo='otro')
-- quedaron sin vincular. Repetimos el backfill sin exigir el tipo (alcanza con
-- "es un crédito puro": debe=0 y haber=importe de la NC), y de paso corregimos
-- el tipo de esos movimientos a 'nota_credito' para que quede consistente con
-- lo que graba el código actual.

UPDATE movimientos_cuenta_corriente mv
SET tipo = 'nota_credito'
FROM (
  SELECT DISTINCT ON (fc.id) mv2.id AS movimiento_id
  FROM facturacion fc
  JOIN movimientos_cuenta_corriente mv2
    ON mv2.socio_id = fc.socio_id
   AND mv2.debe = '0'
   AND mv2.haber = fc.importe
  WHERE fc.tipo_factura IN ('nota_credito_a', 'nota_credito_b', 'nota_credito_c', 'nota_credito_interna')
    AND fc.movimiento_id IS NULL
    AND mv2.id NOT IN (
      SELECT movimiento_id FROM facturacion WHERE movimiento_id IS NOT NULL
    )
  ORDER BY fc.id, abs(extract(epoch FROM (mv2.fecha - fc.emision)))
) match
WHERE mv.id = match.movimiento_id;

UPDATE facturacion f
SET movimiento_id = match.movimiento_id
FROM (
  SELECT DISTINCT ON (fc.id) fc.id AS facturacion_id, mv.id AS movimiento_id
  FROM facturacion fc
  JOIN movimientos_cuenta_corriente mv
    ON mv.socio_id = fc.socio_id
   AND mv.debe = '0'
   AND mv.haber = fc.importe
  WHERE fc.tipo_factura IN ('nota_credito_a', 'nota_credito_b', 'nota_credito_c', 'nota_credito_interna')
    AND fc.movimiento_id IS NULL
    AND mv.id NOT IN (
      SELECT movimiento_id FROM facturacion WHERE movimiento_id IS NOT NULL
    )
  ORDER BY fc.id, abs(extract(epoch FROM (mv.fecha - fc.emision)))
) match
WHERE f.id = match.facturacion_id;
