-- Folio local (identificación interna) para comprobantes emitidos por
-- Facturación manual, Facturación por lote y sus Notas de Crédito.
--
-- Se suma al número que devuelve ARCA (columna `codigo`) — no lo reemplaza.
-- Formato "FL-NNNNNN", correlativo por guardería. No se backfillea: los
-- comprobantes existentes quedan con folio_local NULL.
--
-- Correr desde el SQL Editor de Supabase.

ALTER TABLE public.facturacion
  ADD COLUMN IF NOT EXISTS folio_local text;
