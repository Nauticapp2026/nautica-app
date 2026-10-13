-- =============================================================================
-- 0163 — Tesorería: anular y modificar movimientos manuales, con límite por club.
--
-- Pedido del cliente (2026-10-13): en el Registro de Movimientos tiene que
-- existir Anular y Modificar, como en Cobranzas, y en Mi perfil un límite de
-- tiempo para hacerlo (misma lógica que el período de anulación de recibos:
-- misma_semana / mismo_mes / mes_anterior / sin_limite, mig 0155).
--
-- Solo aplica a los movimientos manuales (tesoreria_movimientos). Los
-- ingresos por recibos se anulan desde Cobranzas, como siempre.
--
-- Un movimiento anulado NO se borra: queda con anulado=true (columna de 0159)
-- y deja de sumar en los saldos; en el registro se ve tachado.
--
-- Idempotente.
-- =============================================================================

alter table public.guarderias
  add column if not exists periodo_edicion_tesoreria text not null default 'sin_limite';

alter table public.guarderias
  drop constraint if exists guarderias_periodo_edicion_tesoreria_check;

alter table public.guarderias
  add constraint guarderias_periodo_edicion_tesoreria_check
  check (periodo_edicion_tesoreria in ('misma_semana', 'mismo_mes', 'mes_anterior', 'sin_limite'));

comment on column public.guarderias.periodo_edicion_tesoreria is
  'Hasta cuándo se puede anular o modificar un movimiento manual de Tesorería. Ver src/lib/tesoreria/periodo-edicion.ts.';

alter table public.tesoreria_movimientos
  add column if not exists anulado_por uuid references public.profiles(id) on delete set null;
