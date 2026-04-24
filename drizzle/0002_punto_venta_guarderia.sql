-- Columnas de punto de venta / facturación electrónica en guarderías.
-- Se usan desde /configuracion para sincronizar el POS con tusfacturas.app.
ALTER TABLE "guarderias" ADD COLUMN "punto_de_venta" integer;
--> statement-breakpoint
ALTER TABLE "guarderias" ADD COLUMN "razon_social" text;
--> statement-breakpoint
ALTER TABLE "guarderias" ADD COLUMN "condicion_iva" "condicion_frente_iva";
--> statement-breakpoint
ALTER TABLE "guarderias" ADD COLUMN "rubro" text;
--> statement-breakpoint
ALTER TABLE "guarderias" ADD COLUMN "iibb" text;
--> statement-breakpoint
ALTER TABLE "guarderias" ADD COLUMN "fecha_inicio" timestamp with time zone;
