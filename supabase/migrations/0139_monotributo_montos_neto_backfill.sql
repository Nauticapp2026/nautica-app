-- Backfill: comprobantes de clubes Monotributo mal clasificados en Exento.
--
-- `desglosarMontos` (facturacion.ts) clasificaba toda alícuota 0% como
-- "Exento" — pero para un club Monotributo la alícuota 0 no es la categoría
-- fiscal Exento, es simplemente "no discrimina IVA" (el Tarifario le fuerza
-- 0 a todos sus servicios). Fix hacia adelante en el código (pedido del
-- cliente 2026-08-06): ahora ese monto va a Neto. Este backfill corrige los
-- comprobantes de clubes Monotributo ya emitidos antes del fix, moviendo su
-- monto_exento a monto_neto. No toca monto_iva — los comprobantes que ya
-- tenían IVA discriminado no son el caso reportado.
--
-- Correr desde el SQL Editor de Supabase (o scripts/apply-monotributo-montos-neto.mjs).

UPDATE public.facturacion f
SET monto_neto = COALESCE(f.monto_neto, 0) + COALESCE(f.monto_exento, 0),
    monto_exento = 0
FROM public.guarderias g
WHERE f.guarderia_id = g.id
  AND g.condicion_iva = 'monotributo'
  AND COALESCE(f.monto_exento, 0) > 0;
