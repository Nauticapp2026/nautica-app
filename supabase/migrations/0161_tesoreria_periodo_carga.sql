-- =============================================================================
-- 0161 — Período de carga de movimientos de Tesorería, por club.
--
-- Pedido del cliente (2026-10-13): al dar de alta un movimiento manual, la
-- fecha no puede ser posterior a hoy y hacia atrás tiene que haber un límite
-- configurable por la compañía.
--
-- Mismas opciones que periodo_anulacion_recibo (mig 0155) más 'solo_hoy':
--   solo_hoy     → solo la fecha del día.
--   misma_semana → desde el lunes de la semana en curso.
--   mismo_mes    → desde el 1° del mes en curso.
--   mes_anterior → desde el 1° del mes anterior.
--   sin_limite   → cualquier fecha pasada (nunca futura).
--
-- Default 'sin_limite': no cambia la conducta de ningún club hasta que lo
-- configure. El criterio vive en src/lib/tesoreria/periodo-carga.ts.
--
-- Idempotente.
-- =============================================================================

alter table public.guarderias
  add column if not exists periodo_carga_tesoreria text not null default 'sin_limite';

alter table public.guarderias
  drop constraint if exists guarderias_periodo_carga_tesoreria_check;

alter table public.guarderias
  add constraint guarderias_periodo_carga_tesoreria_check
  check (periodo_carga_tesoreria in ('solo_hoy', 'misma_semana', 'mismo_mes', 'mes_anterior', 'sin_limite'));

comment on column public.guarderias.periodo_carga_tesoreria is
  'Hasta qué fecha hacia atrás se puede cargar un movimiento manual de Tesorería. Ver src/lib/tesoreria/periodo-carga.ts.';
