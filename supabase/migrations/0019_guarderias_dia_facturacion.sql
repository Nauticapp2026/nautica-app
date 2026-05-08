-- =============================================================================
-- Día de facturación por guardería (reemplaza modelo aniversario per-espacio).
--
-- Cada guardería elige un día del mes (1-28) en el que se generan los
-- movimientos mensuales y se emiten las facturas automáticamente para
-- todos sus espacios asignados.
--
-- Limitamos a 1-28 para evitar el caso borde "día 31, febrero" (que el
-- modelo aniversario manejaba con Math.min, pero acá preferimos forzar
-- al admin a elegir un día seguro y simplificar la lógica).
--
-- Default 1 replica el comportamiento previo de los espacios "modelo viejo"
-- (sin fechaAsignacion), que se cobraban el día 1.
--
-- La columna espacios.fecha_asignacion queda en la DB pero deja de usarse
-- para decidir cuándo cobrar — la dejamos como historial del alta.
--
-- Idempotente.
-- =============================================================================

alter table public.guarderias
  add column if not exists dia_facturacion integer default 1;

alter table public.guarderias
  drop constraint if exists guarderias_dia_facturacion_check;

alter table public.guarderias
  add constraint guarderias_dia_facturacion_check
  check (dia_facturacion between 1 and 28);

comment on column public.guarderias.dia_facturacion is
  'Día del mes (1-28) en que se generan movimientos mensuales y se emiten facturas automáticas para los socios de esta guardería.';
