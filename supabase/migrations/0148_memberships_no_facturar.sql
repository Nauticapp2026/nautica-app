-- Socio marcado "No facturar".
--
-- Pedido del cliente (2026-08-19): poder marcar un socio para que no aparezca
-- más a la hora de facturar, sin darlo de baja.
--
-- Es una columna aparte y NO un valor nuevo de `membership_status` a propósito:
-- toda la app filtra por `status = 'active'` (cobranzas, listados, espacios,
-- app mobile), así que un estado nuevo lo dejaría afuera de todo y sería lo
-- mismo que 'inactivo'. Con esta marca el socio sigue activo — usa el club,
-- ocupa su espacio, se le puede cobrar lo que ya debe — solo que no se le emiten
-- comprobantes nuevos.
--
-- Decisión del cliente: la deuda SÍ se sigue generando (los movimientos
-- mensuales no miran esta marca). Lo que se frena es la EMISIÓN. Al desmarcarlo,
-- todo lo acumulado vuelve a aparecer para facturar, así que la ficha del socio
-- muestra cuánto se juntó.

alter table public.memberships
  add column if not exists no_facturar boolean not null default false;

comment on column public.memberships.no_facturar is
  'Si es true, el socio no aparece para emitir comprobantes. La deuda se sigue generando; solo se frena la emisión.';

-- Los listados de pendientes filtran por esta columna junto con status y rol.
create index if not exists memberships_no_facturar_idx
  on public.memberships (guarderia_id, rol, status)
  where no_facturar = true;
