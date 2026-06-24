-- Facturación: el tilde "Usar datos personales para facturación" pasa a elegir
-- el dataset con el que se factura, en vez de gatear la aparición en el módulo.
--
--   memberships.factura_fiscal = true  → facturar con datos PERSONALES (Generales)
--   memberships.factura_fiscal = false → facturar con DATOS IMPOSITIVOS
--
-- (El nombre de la columna quedó histórico; ya no significa "factura fiscal sí/no".)
--
-- 1. Default pasa a false (= Datos Impositivos) y se migran todos los socios
--    existentes a false, que es el comportamiento por defecto definido.
ALTER TABLE memberships ALTER COLUMN factura_fiscal SET DEFAULT false;
UPDATE memberships SET factura_fiscal = false;

-- 2. Condición frente al IVA de la identidad personal (pestaña Generales). Se usa
--    al facturar con datos personales; condicion_iva sigue siendo la fiscal.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS condicion_iva_personal condicion_frente_iva;
