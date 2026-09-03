-- Recibo Interno: la sigla pasa de CI- a RI-.
--
-- Pedido del cliente (2026-09-02): "cambiar sigla de Recibo Interno de CI a RI
-- (Recibo Interno)". CI venía de "Comprobante Interno", que se presta a
-- confusión — el comprobante interno son los CM-/CL-/CA-, mientras que esto es
-- el RECIBO de una cobranza interna, el par del RC- fiscal.
--
-- Se renombran los que ya existen en vez de arrancar una serie nueva: quedaría
-- un CI-000001 y un RI-000001 conviviendo para el mismo tipo de documento. El
-- número se conserva (CI-000007 -> RI-000007), así que la numeración por club
-- sigue siendo contigua y el próximo código no colisiona.
--
-- Son datos de prueba (pre-lanzamiento, importes de $1 a $1000) en 3 clubes.
--
-- OJO: `NCI-` (nota de crédito interna) CONTIENE la cadena "CI-". Un replace
-- ciego lo convertiría en "NRI-" y rompería su numeración. Por eso el filtro es
-- `like 'CI-%'` (anclado al principio) y no un replace sobre todo el código.

update public.facturacion
   set codigo = 'RI-' || substring(codigo from 4)
 where codigo like 'CI-%';
