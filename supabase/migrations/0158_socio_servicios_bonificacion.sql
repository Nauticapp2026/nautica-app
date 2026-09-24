-- Bonificación por contrato (Servicios Contratados).
--
-- Pedido del cliente (2026-09-24): al cargar un servicio a un socio, poder
-- tildar "Bonificación" e ingresar un porcentaje de descuento. Se guarda en el
-- CONTRATO (socio_servicios), no en la tarifa: la tarifa sigue valiendo lo
-- mismo para todos, el descuento es de ese socio para ese servicio.
--
-- Cómo impacta: los cargos nacen al emitir (lib/pendientes-facturar.ts); ahí
-- el importe del ítem se calcula como precio × (1 − pct/100), redondeado a 2
-- decimales, y el concepto lleva el sufijo "(bonif. X%)" para que se vea en
-- el comprobante. Vale para manual, lote, comprobantes internos y el cron.
--
-- NULL o 0 = sin bonificación. Tope 100 (servicio bonificado por completo).
-- La columna es nueva y nullable: no hay backfill ni impacto en filas viejas,
-- y la app mobile no lee esta tabla.

alter table public.socio_servicios
  add column if not exists bonificacion_pct numeric(5, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'socio_servicios_bonificacion_pct_rango'
  ) then
    alter table public.socio_servicios
      add constraint socio_servicios_bonificacion_pct_rango
      check (bonificacion_pct is null or (bonificacion_pct > 0 and bonificacion_pct <= 100));
  end if;
end $$;

comment on column public.socio_servicios.bonificacion_pct is
  'Descuento (%) de este contrato sobre el precio del tarifario. NULL = sin bonificación. Se aplica al emitir.';
