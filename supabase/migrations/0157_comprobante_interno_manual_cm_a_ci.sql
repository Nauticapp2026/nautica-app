-- Comprobante interno manual: la sigla pasa de CM- a CI-.
--
-- Pedido del cliente (2026-09-16): "Cambiar nomenclatura de Comprobante
-- Interno, hoy es CM, cambiar por CI". Solo el manual: el por lote sigue CL-
-- y el automático CA-. Los tres comparten la misma secuencia de números, así
-- que renombrar el prefijo no altera la numeración ni puede colisionar.
--
-- CI- era la sigla VIEJA del recibo interno (renombrada a RI- en la mig 0153).
-- Antes de esta migración se verificó en prod que no queda ningún codigo
-- 'CI-%' (los tres clubes solo tienen RC-/RI-/CM-/CA-), y el código deja de
-- tratar 'CI' como prefijo de recibo de cobranza en lib/recibo-codigos.ts.
--
-- Se renombran los CM- existentes conservando el número (CM-000004 ->
-- CI-000004), igual que hizo la 0153. Son datos de prueba (pre-lanzamiento).
--
-- El filtro es `like 'CM-%'` anclado al principio: ningún otro código contiene
-- "CM-", pero se mantiene el mismo criterio defensivo que en la 0153.

update public.facturacion
   set codigo = 'CI-' || substring(codigo from 4)
 where codigo like 'CM-%';
