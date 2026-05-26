-- Marcar nautishop_publicaciones como bold en premium y elite.
UPDATE pricing_plan_features
SET bold = true
WHERE feature_id = 'nautishop_publicaciones'
  AND plan_slug IN ('premium', 'elite');
