-- Datos impositivos del socio: CUIT, dirección fiscal y condición IIBB.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cuit text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS direccion_fiscal text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS condicion_iibb condicion_iibb;
