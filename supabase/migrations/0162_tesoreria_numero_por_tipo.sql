-- =============================================================================
-- 0162 — Tesorería: numeración correlativa por tipo de movimiento.
--
-- Pedido del cliente (2026-10-13): los movimientos manuales se identifican
-- como MIC-0002 (Movimiento de Ingreso de Caja) o MEC-0002 (Movimiento de
-- Egreso de Caja), cada prefijo con su propio "next number". Hasta ahora el
-- correlativo era uno solo por club; pasa a ser por club + tipo.
--
-- Los movimientos ya cargados (datos de prueba) se renumeran dentro de su
-- tipo respetando el orden que tenían, para que la serie de cada prefijo
-- arranque en 1 sin huecos.
--
-- Idempotente.
-- =============================================================================

alter table public.tesoreria_movimientos
  drop constraint if exists tesoreria_movimientos_numero_unico;

with n as (
  select id,
         row_number() over (partition by guarderia_id, tipo order by numero, created_at) as rn
  from public.tesoreria_movimientos
)
update public.tesoreria_movimientos t
   set numero = n.rn
  from n
 where n.id = t.id
   and t.numero <> n.rn;

alter table public.tesoreria_movimientos
  add constraint tesoreria_movimientos_numero_unico unique (guarderia_id, tipo, numero);

comment on column public.tesoreria_movimientos.numero is
  'Correlativo por club y tipo. Se muestra como MIC-0001 (ingreso) / MEC-0001 (egreso). Ver src/lib/tesoreria/codigos.ts.';
