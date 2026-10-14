-- =============================================================================
-- 0165 — Tesorería: fecha de la última modificación de un movimiento manual.
--
-- Pedido del cliente (2026-10-14): cuando se edita un movimiento del Registro,
-- la fecha de la edición tiene que quedar grabada (y verse).
--
-- Se guarda la ÚLTIMA modificación (cuándo y quién). `updated_at` no sirve para
-- esto: también se toca al anular. Columnas nullable y sin default: compatibles
-- con el código anterior y con los movimientos nunca editados (quedan en NULL).
--
-- Idempotente.
-- =============================================================================

alter table public.tesoreria_movimientos
  add column if not exists editado_at timestamptz,
  add column if not exists editado_por uuid references public.profiles(id) on delete set null;

comment on column public.tesoreria_movimientos.editado_at is
  'Fecha y hora de la última modificación hecha desde el Registro de Movimientos. NULL si nunca se editó.';
comment on column public.tesoreria_movimientos.editado_por is
  'Usuario que hizo la última modificación.';
