-- Agrega opción "primer día hábil del mes" en la configuración de facturación.
-- Cuando facturacion_primer_habil = true, el cron usa el primer lunes del mes
-- en lugar del dia_facturacion fijo (útil cuando el 1º cae sábado o domingo).
ALTER TABLE guarderias
  ADD COLUMN IF NOT EXISTS facturacion_primer_habil boolean NOT NULL DEFAULT false;
