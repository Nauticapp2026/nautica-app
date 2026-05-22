-- Si la migracion 0054 renombro mas de una feature a 'Venta / Alquiler de camas
-- y amarras online', quedaron duplicados visibles en los planes.
-- Este script blankea el value de todos los duplicados (los de mayor displayOrder),
-- dejando activa solo la primera feature con ese label.

UPDATE pricing_plan_features
SET value = '', bold = false
WHERE feature_id IN (
  SELECT id FROM pricing_features
  WHERE label = 'Venta / Alquiler de camas y amarras online'
  ORDER BY display_order
  OFFSET 1
);
