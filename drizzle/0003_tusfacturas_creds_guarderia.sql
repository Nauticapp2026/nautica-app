-- Credenciales por guardería devueltas por tusfacturas al crear el POS.
-- Se usan al emitir facturas para que cada tenant facture con su propio POS.
ALTER TABLE "guarderias" ADD COLUMN "tusfacturas_apikey" text;
--> statement-breakpoint
ALTER TABLE "guarderias" ADD COLUMN "tusfacturas_apitoken" text;
--> statement-breakpoint
ALTER TABLE "guarderias" ADD COLUMN "tusfacturas_usertoken" text;
