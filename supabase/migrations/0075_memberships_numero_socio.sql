-- Add numero_socio to memberships, correlative per guarderia
ALTER TABLE memberships ADD COLUMN numero_socio integer;

-- Partial unique index: only enforce uniqueness when the value is present.
-- Multiple NULLs are allowed (socios migrados sin número asignado aún).
CREATE UNIQUE INDEX memberships_guarderia_numero_socio_idx
  ON memberships (guarderia_id, numero_socio)
  WHERE numero_socio IS NOT NULL;
