-- Email de facturación del socio (pestaña Datos Impositivos): dirección a la que
-- TusFacturas envía el comprobante. Si está vacío, se usa el email de la cuenta
-- (profiles.email). Separado del email de login para poder facturar a otra
-- dirección (ej. contaduría).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_facturacion text;
