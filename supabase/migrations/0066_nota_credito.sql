-- Soporte para Notas de Crédito emitidas vía TusFacturas.
--
-- 1. Nuevos valores en tipo_factura para NC (A/B/C).
-- 2. Columna cae en facturacion — se guarda al emitir facturas AFIP para poder
--    referenciarlas al emitir una NC posterior.
-- 3. Columna factura_original_id — vincula la NC a la factura que corrige.

ALTER TYPE tipo_factura ADD VALUE IF NOT EXISTS 'nota_credito_a';
ALTER TYPE tipo_factura ADD VALUE IF NOT EXISTS 'nota_credito_b';
ALTER TYPE tipo_factura ADD VALUE IF NOT EXISTS 'nota_credito_c';

ALTER TABLE facturacion
  ADD COLUMN IF NOT EXISTS cae text,
  ADD COLUMN IF NOT EXISTS factura_original_id uuid
    REFERENCES facturacion(id) ON DELETE SET NULL;
