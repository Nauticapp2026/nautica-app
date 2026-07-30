-- 0138 — Anulación de recibos con contraasiento en cuenta corriente.
--
-- Al anular un recibo de cobranza (RC-) ya no se borra el haber del pago:
-- queda la fila original y se agrega un contraasiento (debe) con este tipo
-- nuevo, para que la cuenta corriente conserve el rastro completo. El par
-- pago+contraasiento se excluye del pool FIFO de cobertura (ver
-- reconciliar-cuenta.ts), igual que los asientos de NC.
ALTER TYPE tipo_cta_cte ADD VALUE IF NOT EXISTS 'anulacion_recibo';
