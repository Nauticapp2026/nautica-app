-- Registra la cancelación de un servicio contratado por un socio.
-- La cancelación no borra el historial de movimientos.
CREATE TABLE IF NOT EXISTS socio_servicios_cancelados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  guarderia_id uuid NOT NULL REFERENCES guarderias(id) ON DELETE CASCADE,
  fecha_cancelacion date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (socio_id, servicio_id, guarderia_id)
);

ALTER TABLE socio_servicios_cancelados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can manage cancelaciones" ON socio_servicios_cancelados
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );
