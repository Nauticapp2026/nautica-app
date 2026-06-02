-- Añade campo datos_pago (jsonb) a movimientos para almacenar detalles de
-- cualquier medio de pago de forma flexible, reemplazando las columnas
-- individuales de cheque/transferencia para los métodos nuevos.
-- También añade 'mercado_pago' al enum medio_pago.
--
-- ALTER TYPE ... ADD VALUE no puede correr dentro de una transacción BEGIN/COMMIT
-- en PG < 12. Supabase usa PG ≥ 15, por lo que IF NOT EXISTS es compatible.

ALTER TYPE medio_pago ADD VALUE IF NOT EXISTS 'mercado_pago';

ALTER TABLE movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS datos_pago jsonb;
