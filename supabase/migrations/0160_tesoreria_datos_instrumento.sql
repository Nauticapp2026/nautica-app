-- =============================================================================
-- 0160 — Tesorería: datos adicionales según el instrumento.
--
-- Pedido del cliente (2026-10-13): al cargar un movimiento manual, si el
-- instrumento es transferencia, tarjeta, cheque, Mercado Pago, débito
-- automático o dólares, se piden los mismos datos que Cobranzas pide por
-- forma de pago (banco, nº de operación, últimos 4 dígitos, nº de cheque,
-- monto en USD y tipo de cambio, etc.). Se guardan como jsonb de pares
-- clave/valor, igual que movimientos_cuenta_corriente.datos_pago.
--
-- Idempotente.
-- =============================================================================

alter table public.tesoreria_movimientos
  add column if not exists datos_instrumento jsonb;

comment on column public.tesoreria_movimientos.datos_instrumento is
  'Datos adicionales del instrumento (banco, nroOperacion, ultimos4, numeroCheque, usd, tc, ...). Mismas claves que datos_pago.formas[].datos de Cobranzas.';
