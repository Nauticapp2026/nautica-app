-- Distinguir, en la cuenta corriente, un cargo cubierto por una Nota de
-- Crédito de uno efectivamente cobrado. Hoy `registrarMovimientoNota` graba
-- el asiento de la NC con tipo 'otro', igual que un pago real (cobranza,
-- Payway) — la Cuenta Corriente no tiene forma de diferenciarlos y termina
-- mostrando "Cobrado" para un cargo que en realidad se anuló con una NC, no
-- se cobró. Sumamos 'nota_credito' al enum para poder tagear ese asiento.

ALTER TYPE tipo_cta_cte ADD VALUE 'nota_credito';
