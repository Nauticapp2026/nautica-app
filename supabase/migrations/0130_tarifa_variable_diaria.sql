-- Tarifas Variables con precio por día o por mes.
--
-- `servicios.tarifa_variable` ('diaria' | 'mensual') solo aplica a servicios
-- con tipo_cobro = 'variable' (NULL en los Fijo). Con 'diaria', "Cargar
-- Servicio" pide una cantidad de días (socio_servicios.cantidad_dias) y el
-- cargo único que genera el cron pasa a ser precio diario × cantidad de días.

CREATE TYPE "public"."periodo_tarifa_variable" AS ENUM ('diaria', 'mensual');

ALTER TABLE "servicios" ADD COLUMN "tarifa_variable" "public"."periodo_tarifa_variable";

-- Las Variables existentes ya se cobraban con el precio tal cual (una sola
-- vez): equivalen a "precio por mes".
UPDATE "servicios" SET "tarifa_variable" = 'mensual' WHERE "tipo_cobro" = 'variable';

ALTER TABLE "socio_servicios" ADD COLUMN "cantidad_dias" integer;
