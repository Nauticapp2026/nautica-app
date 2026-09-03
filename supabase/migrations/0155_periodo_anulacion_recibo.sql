-- Período de anulación de recibo, por club.
--
-- Pedido del cliente (2026-09-02): "para que el club no genere anulaciones de
-- recibos de manera indiscriminada, por lo general las empresas ponen un límite
-- de tiempo".
--
-- Semántica (la explicó el cliente con un ejemplo):
--   misma_semana → solo recibos de la semana en curso (lunes a domingo).
--   mismo_mes    → solo del mes en curso. Un recibo de julio, estando en
--                  agosto, ya no se puede anular.
--   mes_anterior → el mes en curso y el inmediato anterior. En agosto se puede
--                  anular julio, pero no junio.
--   sin_limite   → cualquier recibo.
--
-- Default `sin_limite`: es el comportamiento que había hasta ahora, así que
-- ningún club cambia de conducta hasta que lo configure. Poner un límite por
-- defecto trabaría anulaciones que hoy se pueden hacer, sin que nadie lo pida.
--
-- Se compara el día calendario ARGENTINO de la emisión (ver
-- lib/periodo-anulacion.ts): un recibo emitido el 1° a las 00:30 de Argentina se
-- guarda como 03:30 UTC del 1, pero uno del 31 a las 21:30 AR se guarda como
-- 00:30 UTC del 1 — comparar en UTC correría el límite un día en los bordes.

alter table public.guarderias
  add column if not exists periodo_anulacion_recibo text not null default 'sin_limite';

alter table public.guarderias
  drop constraint if exists guarderias_periodo_anulacion_recibo_check;

alter table public.guarderias
  add constraint guarderias_periodo_anulacion_recibo_check
  check (periodo_anulacion_recibo in ('misma_semana', 'mismo_mes', 'mes_anterior', 'sin_limite'));

comment on column public.guarderias.periodo_anulacion_recibo is
  'Hasta cuándo se puede anular un recibo de cobranza. Ver lib/periodo-anulacion.ts.';
