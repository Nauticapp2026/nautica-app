-- Renombrar el valor 'club' del enum plan a 'premium'.
-- Postgres propaga el rename a todas las columnas que usan el tipo plan
-- (guarderias.plan, pricing_plans.slug, pricing_plan_features.plan_slug,
-- guarderia_plan_historial.plan_slug) automáticamente.

ALTER TYPE plan RENAME VALUE 'club' TO 'premium';

-- Renombrar la audiencia de notificación que refería al plan club.
ALTER TYPE notificacion_audiencia RENAME VALUE 'plan_club' TO 'plan_premium';

-- Actualizar el display name en la tabla de planes.
UPDATE pricing_plans SET name = 'PREMIUM' WHERE slug = 'premium';
