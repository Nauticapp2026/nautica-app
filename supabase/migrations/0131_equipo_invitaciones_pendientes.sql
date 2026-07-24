-- Invitaciones de equipo encoladas durante el onboarding.
-- Mientras la guardería está pendiente de alta (guarderias.activa = false),
-- las invitaciones a empleados NO se envían por mail: quedan en esta tabla
-- y se despachan cuando el super admin activa la guardería
-- (setGuarderiaActivaAction → despacharInvitacionesPendientes).

CREATE TABLE IF NOT EXISTS equipo_invitaciones_pendientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guarderia_id uuid NOT NULL REFERENCES guarderias(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  apellido text NOT NULL DEFAULT '',
  email text NOT NULL,
  rol rol NOT NULL,
  telefono text,
  sede text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS equipo_inv_pendientes_guarderia_email_idx
  ON equipo_invitaciones_pendientes (guarderia_id, email);

ALTER TABLE equipo_invitaciones_pendientes ENABLE ROW LEVEL SECURITY;

-- La tabla se opera solo desde server actions vía Drizzle (que no pasa por
-- RLS). Esta policy cubre el acceso directo por la API de Supabase: solo
-- super admin.
CREATE POLICY "super admin manages equipo_invitaciones_pendientes"
  ON equipo_invitaciones_pendientes
  FOR ALL USING (public.is_super_admin());
