-- Bridge table: una porteria (salida) tiene muchos invitados
CREATE TABLE "porteria_invitados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"porteria_id" uuid NOT NULL,
	"invitado_id" uuid NOT NULL,
	"cantidad_acompanantes" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "porteria_invitados" ADD CONSTRAINT "porteria_invitados_porteria_id_porteria_id_fk" FOREIGN KEY ("porteria_id") REFERENCES "public"."porteria"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "porteria_invitados" ADD CONSTRAINT "porteria_invitados_invitado_id_invitados_id_fk" FOREIGN KEY ("invitado_id") REFERENCES "public"."invitados"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "porteria_invitados_porteria_idx" ON "porteria_invitados" USING btree ("porteria_id");
--> statement-breakpoint
CREATE INDEX "porteria_invitados_invitado_idx" ON "porteria_invitados" USING btree ("invitado_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "porteria_invitados_unique" ON "porteria_invitados" USING btree ("porteria_id","invitado_id");
--> statement-breakpoint

-- Backfill: cada porteria existente con invitado_id se convierte en una fila del bridge.
-- Nota: no consolida porterias duplicadas (si una salida creaba N porterias con los mismos datos,
-- siguen siendo N porterias). Para mobile nuevo se usa 1 porteria por salida.
INSERT INTO "porteria_invitados" ("porteria_id", "invitado_id", "cantidad_acompanantes")
SELECT p."id", p."invitado_id", COALESCE(i."cantidad_acompanantes", 0)
FROM "porteria" p
LEFT JOIN "invitados" i ON i."id" = p."invitado_id"
WHERE p."invitado_id" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "porteria" DROP COLUMN "invitado_id";
--> statement-breakpoint
ALTER TABLE "invitados" DROP COLUMN "cantidad_acompanantes";
