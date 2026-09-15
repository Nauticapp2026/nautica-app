-- Motivo y fecha de la baja (Inactivo) de un socio.
--
-- Pedido del cliente (2026-09-15): "si ponemos a un socio como Inactivo poder
-- poner el motivo".
--
-- El estado Inactivo ya existía (memberships.status); lo que faltaba era el
-- POR QUÉ y el DESDE CUÁNDO. `updated_at` no sirve como fecha de baja: se pisa
-- con cualquier otra edición de la membresía (número de socio, tildes de
-- facturación) y a los pocos días ya no dice nada.
--
-- Las dos columnas describen la inactivación VIGENTE: se blanquean al volver a
-- Activo. No es un historial — si el club necesita el registro de todas las
-- bajas y altas de un socio, eso es otra tabla.
--
-- Sin backfill: los socios que ya están Inactivo no dejaron rastro de motivo ni
-- fecha. Quedan en NULL y la ficha muestra "Inactivo" a secas en vez de inventar
-- una fecha.

alter table public.memberships
  add column if not exists motivo_inactivo text,
  add column if not exists inactivo_desde timestamptz;

comment on column public.memberships.motivo_inactivo is
  'Motivo cargado por el club al pasar al socio a Inactivo. NULL si está activo o si no se cargó.';

comment on column public.memberships.inactivo_desde is
  'Cuándo pasó a Inactivo. NULL si está activo, o si la baja es anterior a esta columna.';
