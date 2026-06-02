-- Añade tipo 'recibo' al enum tipo_factura para comprobantes internos (sin valor fiscal).
-- Añade columna movimiento_id en facturacion para vincular el recibo al movimiento de pago.

ALTER TYPE tipo_factura ADD VALUE IF NOT EXISTS 'recibo';

ALTER TABLE facturacion
  ADD COLUMN IF NOT EXISTS movimiento_id uuid
    REFERENCES movimientos_cuenta_corriente(id) ON DELETE SET NULL;
