-- La migración 0054 renombró erróneamente base_gestion_espacios (que contiene
-- "amarras" en su label original) junto con nautishop_publicaciones.
-- Este script restaura el label de base_gestion_espacios y mueve los valores
-- correctos a nautishop_publicaciones.

-- 1) Restaurar label original de base_gestion_espacios
UPDATE pricing_features
SET label = 'Gestión de espacios (peines, amarras, áreas)'
WHERE id = 'base_gestion_espacios';

-- 2) Restaurar valores de base_gestion_espacios a ✓ en los 3 planes
--    (es una feature base incluida en todos)
UPDATE pricing_plan_features
SET value = '✓', bold = false
WHERE feature_id = 'base_gestion_espacios';

-- 3) Actualizar nautishop_publicaciones con los límites reales por plan
UPDATE pricing_plan_features
SET value = '3 publ.'
WHERE feature_id = 'nautishop_publicaciones' AND plan_slug = 'premium';

UPDATE pricing_plan_features
SET value = '6 publ.'
WHERE feature_id = 'nautishop_publicaciones' AND plan_slug = 'elite';

-- Esencial no incluye publicaciones (sin fila → fallback 0)
DELETE FROM pricing_plan_features
WHERE feature_id = 'nautishop_publicaciones' AND plan_slug = 'esencial';
