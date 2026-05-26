-- Corrige los efectos de la migracion 0058:
-- 1) Restaura el label de base_gestion_espacios a 'Venta / Alquiler de camas y amarras online'
-- 2) Setea los valores correctos en nautishop_publicaciones

UPDATE pricing_features
SET label = 'Venta / Alquiler de camas y amarras online'
WHERE id = 'base_gestion_espacios';

UPDATE pricing_plan_features
SET value = '2 / mes'
WHERE feature_id = 'nautishop_publicaciones' AND plan_slug = 'premium';

UPDATE pricing_plan_features
SET value = '6 / mes'
WHERE feature_id = 'nautishop_publicaciones' AND plan_slug = 'elite';

-- Esencial: sin publicaciones (value vacío)
INSERT INTO pricing_plan_features (plan_slug, feature_id, value)
VALUES ('esencial', 'nautishop_publicaciones', '')
ON CONFLICT (plan_slug, feature_id) DO UPDATE SET value = '';
