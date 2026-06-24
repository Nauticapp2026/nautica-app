-- Auditoría de cuenta corriente: registrar QUIÉN crea cada movimiento
-- (cargo o pago). Antes no había ninguna traza del autor — imposible saber
-- quién cargó un pago. Se completa desde los server actions (que conocen el
-- usuario actual). NULL = creado por el sistema (cron mensual / cobro Payway).
ALTER TABLE movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS movimientos_created_by_idx
  ON movimientos_cuenta_corriente (created_by);
