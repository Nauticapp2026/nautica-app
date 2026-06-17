-- Campos de dirección separados y contacto de emergencia para socios.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ciudad text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS provincia text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS codigo_postal text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contacto_emergencia text;
