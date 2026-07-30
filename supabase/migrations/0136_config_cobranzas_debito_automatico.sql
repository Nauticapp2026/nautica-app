-- 0136 — Configuración de cobranzas (comprobantes internos) + débito automático Payway
--
-- Nivel 1: el club define qué medios de pago admite para comprobantes internos.
-- Vacío = la pata de comprobantes internos queda deshabilitada (tilde del socio,
-- Cargar Servicio, Ventas y Cobranzas). Default 'efectivo' (el ideal según el
-- cliente) tanto para clubes nuevos como backfill de los existentes, para no
-- interrumpir el flujo actual.
ALTER TABLE guarderias
  ADD COLUMN IF NOT EXISTS medios_cobro_internos text[] NOT NULL DEFAULT '{efectivo}';

UPDATE guarderias SET medios_cobro_internos = '{efectivo}';

-- Nivel 3: adhesión general del socio al débito automático Payway (per guardería).
-- cobro_automatico_baja guarda la fecha del último destilde; se blanquea al re-tildar.
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS cobro_automatico_payway boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cobro_automatico_baja date;

-- Los socios que hoy ya se debitan (token Payway activo) arrancan adheridos,
-- para que el cambio de modelo no les frene el débito.
UPDATE memberships m
SET cobro_automatico_payway = true
FROM payway_tokens t
WHERE t.guarderia_id = m.guarderia_id
  AND t.socio_id = m.user_id
  AND t.activo = true;

-- Nivel 4: inclusión de cada servicio contratado en el débito automático.
ALTER TABLE socio_servicios
  ADD COLUMN IF NOT EXISTS debito_automatico boolean NOT NULL DEFAULT false;

-- Los contratos vigentes de socios adheridos arrancan incluidos (quien hoy se
-- debita se sigue debitando). Los internos quedan igualmente inertes salvo que
-- el club habilite 'debito_automatico' en medios_cobro_internos.
UPDATE socio_servicios ss
SET debito_automatico = true
FROM memberships m
WHERE m.guarderia_id = ss.guarderia_id
  AND m.user_id = ss.socio_id
  AND m.cobro_automatico_payway = true
  AND (ss.fecha_baja IS NULL OR ss.fecha_baja >= CURRENT_DATE);
