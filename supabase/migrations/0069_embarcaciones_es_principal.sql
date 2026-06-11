-- Agrega columna es_principal a embarcaciones.
-- Indica cuál es la embarcación predeterminada del socio cuando tiene más de una.
ALTER TABLE embarcaciones
  ADD COLUMN es_principal boolean NOT NULL DEFAULT false;

-- Retroactivamente marca como principal la primera embarcación por socio (por fecha de creación).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY profile_id, guarderia_id
      ORDER BY created_at
    ) AS rn
  FROM embarcaciones
  WHERE profile_id IS NOT NULL
)
UPDATE embarcaciones
SET es_principal = true
FROM ranked
WHERE embarcaciones.id = ranked.id
  AND ranked.rn = 1;
