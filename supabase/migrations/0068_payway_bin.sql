-- Agrega columna bin a payway_tokens.
-- El bin (primeros 6 dígitos de la tarjeta) es requerido por el SDK Node.js
-- en cada llamada a sdk.payment(), incluyendo cobros recurrentes MIT.
ALTER TABLE payway_tokens
  ADD COLUMN IF NOT EXISTS bin char(6) NOT NULL DEFAULT '';
