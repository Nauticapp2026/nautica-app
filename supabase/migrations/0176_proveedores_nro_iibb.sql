-- 0176 · Proveedores: número de Ingresos Brutos
--
-- Además de la condición frente a Ingresos Brutos (ya existente), se guarda el número de
-- inscripción. Aditivo: columna nueva y opcional.

alter table public.proveedores
  add column if not exists nro_iibb text;
