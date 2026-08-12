-- Version simplificada para lanzamiento (pedido cliente 2026-08-12): mismo
-- cupo mensual para los 3 planes en Comunicaciones y Publicaciones.
-- com_cerrada 6/mes, com_abierta 3/mes, nautishop_publicaciones 6/mes.

UPDATE pricing_plan_features
SET value = '6 / mes'
WHERE feature_id = 'com_cerrada' AND plan_slug IN ('esencial', 'premium', 'elite');

UPDATE pricing_plan_features
SET value = '3 / mes'
WHERE feature_id = 'com_abierta' AND plan_slug IN ('esencial', 'premium', 'elite');

UPDATE pricing_plan_features
SET value = '6 / mes'
WHERE feature_id = 'nautishop_publicaciones' AND plan_slug IN ('esencial', 'premium', 'elite');

-- Esencial nunca tuvo fila de com_abierta (quedaba en 0 por el fallback de
-- limits.ts, no por un valor explicito en DB) — asegurar que exista.
INSERT INTO pricing_plan_features (plan_slug, feature_id, value)
VALUES ('esencial', 'com_abierta', '3 / mes')
ON CONFLICT (plan_slug, feature_id) DO UPDATE SET value = '3 / mes';
