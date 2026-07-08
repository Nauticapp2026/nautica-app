-- Desglose neto/exento/IVA por comprobante (hoy solo existe `importe` =
-- total) y fecha de vencimiento del CAE (TusFacturas ya la devuelve en
-- `vencimiento_cae`, pero se descartaba sin guardarla). Solo se completan
-- desde ahora en adelante — no hay de dónde backfillear los comprobantes
-- ya emitidos.

ALTER TABLE public.facturacion
  ADD COLUMN IF NOT EXISTS monto_neto numeric(12,2),
  ADD COLUMN IF NOT EXISTS monto_exento numeric(12,2),
  ADD COLUMN IF NOT EXISTS monto_iva numeric(12,2),
  ADD COLUMN IF NOT EXISTS cae_vencimiento date;
