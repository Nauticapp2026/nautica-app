-- Agrega columna bold a pricing_plan_features
ALTER TABLE pricing_plan_features ADD COLUMN IF NOT EXISTS bold boolean NOT NULL DEFAULT false;

-- Renombrar 'App del socio completa' → 'App del socio Premium bonificada'
UPDATE pricing_features
SET label = 'App del socio Premium bonificada'
WHERE label ILIKE 'App del socio completa%';

-- Renombrar la feature de amarras/camas y limpiar el valor (ambos planes usan el mismo feature_id)
UPDATE pricing_features
SET label = 'Venta / Alquiler de camas y amarras online'
WHERE label ILIKE '%amarras%' OR label ILIKE '%Amarras%';

UPDATE pricing_plan_features
SET value = '✓'
WHERE feature_id IN (
  SELECT id FROM pricing_features WHERE label = 'Venta / Alquiler de camas y amarras online'
);

-- Quitar TusFacturas y Paywey de todos los planes
UPDATE pricing_plan_features
SET value = ''
WHERE feature_id IN (
  SELECT id FROM pricing_features
  WHERE label ILIKE '%TusFacturas%'
     OR label ILIKE '%Paywey%'
     OR label ILIKE '%Payway%'
);

-- Bold: features destacadas del plan premium
UPDATE pricing_plan_features
SET bold = true
WHERE plan_slug = 'premium'
  AND feature_id IN (
    SELECT id FROM pricing_features
    WHERE label ILIKE 'Comunicación abierta%'
       OR label ILIKE 'Comunicacion abierta%'
       OR label ILIKE 'Shop%Nautishop%'
       OR label = 'Venta / Alquiler de camas y amarras online'
  );

-- Bold: features destacadas del plan elite
UPDATE pricing_plan_features
SET bold = true
WHERE plan_slug = 'elite'
  AND feature_id IN (
    SELECT id FROM pricing_features
    WHERE label ILIKE 'Comunicación cerrada%'
       OR label ILIKE 'Comunicacion cerrada%'
       OR label ILIKE 'Comunicación abierta%'
       OR label ILIKE 'Comunicacion abierta%'
       OR label ILIKE 'Notificaciones push%'
       OR label = 'Venta / Alquiler de camas y amarras online'
       OR label ILIKE 'Shop%Nautishop%'
       OR label ILIKE 'Blindaje competitivo%'
       OR label ILIKE 'Primeros en búsqueda%'
       OR label ILIKE 'Primeros en busqueda%'
  );
