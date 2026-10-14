-- =============================================================================
-- 0164 — Tesorería: motivo de anulación de movimientos manuales.
--
-- Pedido del cliente (2026-10-14): al anular un movimiento del Registro hay
-- que poder explicar el motivo, y el registro tiene que mostrar la fecha de
-- anulación y ese motivo.
--
-- Columna nullable y sin default: compatible con el código anterior (que no la
-- conoce) y con los movimientos ya anulados (quedan sin motivo).
--
-- Idempotente.
-- =============================================================================

alter table public.tesoreria_movimientos
  add column if not exists motivo_anulacion text;

comment on column public.tesoreria_movimientos.motivo_anulacion is
  'Motivo que escribió el admin al anular el movimiento. NULL en los anulados antes de la mig 0164.';
