-- "Tipo de Recibo" (Fiscal/Interno) para recibos de cobranza (RC-). Se
-- calcula sobre TODOS los comprobantes elegidos al registrar la cobranza
-- (no solo los cubiertos por el FIFO, que puede quedar vacío en un pago
-- parcial chico) -- por eso es una columna propia, no se deriva de
-- cobranza_comprobante_ids. Un mismo recibo no puede mezclar fiscal e
-- interno, se valida en registrarCobranzaAction.

DO $$ BEGIN
  CREATE TYPE public.tipo_recibo AS ENUM ('fiscal', 'interno');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.facturacion
  ADD COLUMN IF NOT EXISTS tipo_recibo public.tipo_recibo;
