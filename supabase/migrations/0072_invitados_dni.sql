-- Refleja columna dni ya existente en la DB (agregada desde Supabase Dashboard)
ALTER TABLE invitados
  ADD COLUMN IF NOT EXISTS dni text;
