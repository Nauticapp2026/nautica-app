-- Registro de Cobranza: cada cobranza genera un recibo (facturacion tipo 'recibo',
-- codigo RC-). El recibo puede anularse (reversa total de la cuenta corriente).
--
-- - anulada / anulada_at: estado del recibo de cobranza (Vigente / Anulado + fecha).
-- - cobranza_comprobante_ids: comprobantes que cobró ese recibo, para poder
--   revertirlos a 'pendiente' al anular.
-- Columnas aditivas, no afectan datos existentes.

ALTER TABLE public.facturacion
  ADD COLUMN IF NOT EXISTS anulada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anulada_at timestamptz,
  ADD COLUMN IF NOT EXISTS cobranza_comprobante_ids uuid[];
