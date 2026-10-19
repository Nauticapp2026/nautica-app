-- =============================================================================
-- 0168 — Período de anulación: nueva opción "Mismo día".
--
-- Pedido del cliente (2026-10-19): poder anular un recibo solo el mismo día en
-- que se emitió. Se suma 'mismo_dia' a las opciones de
-- guarderias.periodo_anulacion_recibo (mig 0155).
--
-- El período de modificación de movimientos de Tesorería
-- (guarderias.periodo_edicion_tesoreria, mig 0163) usa las mismas opciones, así
-- que también lo admite (misma lógica, contado desde la fecha del movimiento).
--
-- Solo se ensancha el CHECK: ningún club cambia de conducta (el default sigue
-- siendo 'sin_limite'). Compatible con el código anterior: si algún valor nuevo
-- llegara a guardarse antes del deploy, el código viejo lo ignora y cae en el
-- default 'sin_limite'.
--
-- Idempotente.
-- =============================================================================

alter table public.guarderias
  drop constraint if exists guarderias_periodo_anulacion_recibo_check;

alter table public.guarderias
  add constraint guarderias_periodo_anulacion_recibo_check
  check (periodo_anulacion_recibo in ('mismo_dia', 'misma_semana', 'mismo_mes', 'mes_anterior', 'sin_limite'));

alter table public.guarderias
  drop constraint if exists guarderias_periodo_edicion_tesoreria_check;

alter table public.guarderias
  add constraint guarderias_periodo_edicion_tesoreria_check
  check (periodo_edicion_tesoreria in ('mismo_dia', 'misma_semana', 'mismo_mes', 'mes_anterior', 'sin_limite'));
