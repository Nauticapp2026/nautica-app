-- Integración Payway — débito automático por tarjeta tokenizada.
--
-- Cada guardería tiene su propia cuenta Payway (igual que TusFacturas).
-- El admin carga los datos de tarjeta del socio desde el panel web;
-- el browser tokeniza con la public key (PCI compliance) y el backend
-- ejecuta el cobro recurrente mensual con la private key.
--
-- 1. Credenciales Payway en guarderias.
-- 2. payway_tokens — un token de tarjeta por socio por guardería.
-- 3. payway_cobros — historial de intentos de cobro del cron mensual.

-- 1. Credenciales Payway por guardería
ALTER TABLE guarderias
  ADD COLUMN IF NOT EXISTS payway_public_key  text,
  ADD COLUMN IF NOT EXISTS payway_private_key text;

-- 2. Token de tarjeta por socio
CREATE TABLE IF NOT EXISTS payway_tokens (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guarderia_id      uuid        NOT NULL REFERENCES guarderias(id) ON DELETE CASCADE,
  socio_id          uuid        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  customer_token    text        NOT NULL,
  payment_method_id integer     NOT NULL,  -- 1=Visa, 2=Mastercard, 65=Amex
  last_four         char(4)     NOT NULL,
  activo            boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guarderia_id, socio_id)  -- un socio tiene una sola tarjeta activa por club
);

-- 3. Historial de cobros del cron
CREATE TYPE payway_cobro_estado AS ENUM ('aprobado', 'rechazado', 'pendiente', 'error');

CREATE TABLE IF NOT EXISTS payway_cobros (
  id                    uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  guarderia_id          uuid                  NOT NULL REFERENCES guarderias(id) ON DELETE CASCADE,
  socio_id              uuid                  NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  monto                 integer               NOT NULL,  -- en centavos, ej. $3.000 = 300000
  site_transaction_id   uuid                  NOT NULL UNIQUE,  -- idempotencia
  payway_payment_id     text,
  estado                payway_cobro_estado   NOT NULL DEFAULT 'pendiente',
  error_mensaje         text,
  movimientos_ids       uuid[]                NOT NULL DEFAULT '{}',
  created_at            timestamptz           NOT NULL DEFAULT now()
);

-- Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS payway_tokens_guarderia_idx  ON payway_tokens (guarderia_id);
CREATE INDEX IF NOT EXISTS payway_tokens_socio_idx      ON payway_tokens (socio_id);
CREATE INDEX IF NOT EXISTS payway_cobros_guarderia_idx  ON payway_cobros (guarderia_id);
CREATE INDEX IF NOT EXISTS payway_cobros_socio_idx      ON payway_cobros (socio_id);
CREATE INDEX IF NOT EXISTS payway_cobros_created_idx    ON payway_cobros (created_at DESC);

-- RLS
ALTER TABLE payway_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE payway_cobros ENABLE ROW LEVEL SECURITY;

-- payway_tokens: solo admins de la guardería
CREATE POLICY "payway_tokens_admin_select" ON payway_tokens
  FOR SELECT USING (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT m.guarderia_id FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.rol IN ('administrador_general', 'administrativo', 'contable')
        AND m.status = 'active'
    )
  );

CREATE POLICY "payway_tokens_admin_insert" ON payway_tokens
  FOR INSERT WITH CHECK (
    guarderia_id IN (
      SELECT m.guarderia_id FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.rol IN ('administrador_general', 'administrativo', 'contable')
        AND m.status = 'active'
    )
  );

CREATE POLICY "payway_tokens_admin_update" ON payway_tokens
  FOR UPDATE USING (
    guarderia_id IN (
      SELECT m.guarderia_id FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.rol IN ('administrador_general', 'administrativo', 'contable')
        AND m.status = 'active'
    )
  );

-- payway_cobros: solo admins de la guardería (el cron usa service role, bypasea RLS)
CREATE POLICY "payway_cobros_admin_select" ON payway_cobros
  FOR SELECT USING (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT m.guarderia_id FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.rol IN ('administrador_general', 'administrativo', 'contable')
        AND m.status = 'active'
    )
  );
