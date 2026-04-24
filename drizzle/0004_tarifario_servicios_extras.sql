-- Nuevos campos en servicios (tarifario) que aplican cuando el tipo es "espacios":
-- locacion (camas / amarra), unidad_metraje (metros / pies) y clases (texto libre).
CREATE TYPE "locacion_servicio" AS ENUM ('camas', 'amarra');
--> statement-breakpoint
CREATE TYPE "unidad_metraje" AS ENUM ('metros', 'pies');
--> statement-breakpoint
ALTER TABLE "servicios" ADD COLUMN "locacion" "locacion_servicio";
--> statement-breakpoint
ALTER TABLE "servicios" ADD COLUMN "unidad_metraje" "unidad_metraje";
--> statement-breakpoint
ALTER TABLE "servicios" ADD COLUMN "clases" text;
