-- Tabla de publicaciones de amarras y camas.
-- Limites por plan: premium = 2, elite = 5, esencial = 0 (bloqueado en app).

CREATE TYPE tipo_publicacion AS ENUM ('amarra', 'cama');

CREATE TYPE estado_publicacion AS ENUM ('borrador', 'publicada');

CREATE TYPE servicio_publicacion AS ENUM (
  'agua_potable',
  'conexion_220v',
  'abierto_24hs',
  'combustible',
  'seguridad_24hs',
  'vestuarios',
  'confiteria',
  'lavadero',
  'aire_libre',
  'bajo_techo',
  'sin_arco'
);

CREATE TABLE publicaciones (
  id             uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  guarderia_id   uuid             NOT NULL REFERENCES guarderias(id) ON DELETE CASCADE,
  autor_id       uuid             REFERENCES profiles(id) ON DELETE SET NULL,
  tipo           tipo_publicacion NOT NULL,
  ubicacion      text,
  eslora         numeric(8,2),
  manga          numeric(8,2),
  puntual        numeric(12,2),
  expensas       numeric(12,2),
  precio         numeric(12,2),
  servicios      servicio_publicacion[] NOT NULL DEFAULT '{}',
  imagen_urls    text[]           NOT NULL DEFAULT '{}',
  estado         estado_publicacion NOT NULL DEFAULT 'borrador',
  created_at     timestamptz      NOT NULL DEFAULT now(),
  updated_at     timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX publicaciones_guarderia_idx ON publicaciones(guarderia_id);

ALTER TABLE publicaciones ENABLE ROW LEVEL SECURITY;

-- Admin/administrativo: acceso total a las publicaciones de su guarderia
CREATE POLICY "publicaciones_admin_all" ON publicaciones
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id      = auth.uid()
        AND m.guarderia_id = publicaciones.guarderia_id
        AND m.rol IN ('administrador_general', 'administrativo')
        AND m.status = 'active'
    )
    OR public.is_super_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id      = auth.uid()
        AND m.guarderia_id = publicaciones.guarderia_id
        AND m.rol IN ('administrador_general', 'administrativo')
        AND m.status = 'active'
    )
    OR public.is_super_admin()
  );

-- Cualquier usuario autenticado puede leer las publicadas (app mobile)
CREATE POLICY "publicaciones_read_publicadas" ON publicaciones
  FOR SELECT
  USING (estado = 'publicada');
