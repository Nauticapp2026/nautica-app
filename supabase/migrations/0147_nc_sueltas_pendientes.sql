-- Notas de crédito sueltas: pasan a 'pendiente' para poder juntarse.
--
-- Una NC suelta (sin `factura_original_id`) nacía 'pagada': su crédito caía en
-- la bolsa del saldo a favor del socio y saldaba cargos por antigüedad, sin que
-- el club pudiera decir a qué factura iba. El cliente pidió (2026-08-19) que
-- queden esperando y que al armar una cobranza el club elija con qué factura las
-- junta — igual que un adelanto, pero siendo un comprobante fiscal.
--
-- Desde ahora nacen 'pendiente' (ver actions/facturacion.ts) y su movimiento
-- queda excluido del pool genérico mientras esté suelta (ver lib/nc-cobertura.ts).
-- Esta migración alinea las que ya estaban emitidas.
--
-- NO toca las NC ASOCIADAS (con `factura_original_id`): esas siguen
-- descontándose solas de su factura, que es la decisión correcta — el club ya
-- eligió la factura al emitirlas, y desacoplarlas fue un bug real (una NC
-- terminaba cubriendo cargos viejos sin relación).
--
-- Tampoco toca las rechazadas: nunca se emitieron, no tienen movimiento.

update public.facturacion
   set estado = 'pendiente'
 where tipo_factura in (
         'nota_credito_a',
         'nota_credito_b',
         'nota_credito_c',
         'nota_credito_interna'
       )
   and factura_original_id is null
   and estado = 'pagada'
   and anulada = false
   and rechazada = false
   and movimiento_id is not null;
