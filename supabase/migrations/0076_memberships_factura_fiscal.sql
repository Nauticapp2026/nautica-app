-- Indica si el socio emite comprobante fiscal (AFIP) o comprobante interno.
-- Default true: todos los socios existentes quedan como fiscal.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS factura_fiscal boolean NOT NULL DEFAULT true;
