-- =============================================================================
-- Asignación de operarios por ÁREA.
--
-- Cada área puede tener uno o más operarios. Una tarea (lavado, salida, manual,
-- etc.) lleva el área derivada de la embarcación → espacio. La tarea la ven
-- todos los operarios asignados a esa área y el que está disponible la "toma".
-- tareas.area_id NULL = sin área: la ven todos los operarios de la guardería.
-- =============================================================================

-- 1. Columna area_id en tareas.
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tareas_area_idx ON public.tareas (area_id);

-- 2. Tabla de relación área ↔ operario (M:N).
CREATE TABLE IF NOT EXISTS public.area_operarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guarderia_id uuid NOT NULL REFERENCES public.guarderias(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  operario_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS area_operarios_area_operario_idx
  ON public.area_operarios (area_id, operario_id);
CREATE INDEX IF NOT EXISTS area_operarios_operario_idx ON public.area_operarios (operario_id);
CREATE INDEX IF NOT EXISTS area_operarios_guarderia_idx ON public.area_operarios (guarderia_id);

-- 3. RLS: miembros de la guardería leen; admins gestionan.
ALTER TABLE public.area_operarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "area_operarios_member_select" ON public.area_operarios
  FOR SELECT USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "area_operarios_admin_write" ON public.area_operarios
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

-- 4. Trigger de LAVADO: estampar area_id desde la embarcación → espacio.
CREATE OR REPLACE FUNCTION public._create_tarea_for_solicitud_lavado(p_solicitud_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solicitud RECORD;
  v_nombre_socio text;
  v_embarcacion_id uuid;
  v_count_embarcaciones int;
  v_tarea_id uuid;
  v_descripcion text;
  v_nota text;
  v_fecha_hora timestamptz;
  v_area_id uuid;
BEGIN
  SELECT id, guarderia_id, socio_id, dia_uso, tarea_id
  INTO v_solicitud
  FROM solicitudes_lavado
  WHERE id = p_solicitud_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Idempotencia.
  IF v_solicitud.tarea_id IS NOT NULL THEN
    RETURN v_solicitud.tarea_id;
  END IF;

  -- Nombre del socio. Si no hay nombre/apellido, fallback a email.
  SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.nombre, p.apellido)), ''), p.email)
  INTO v_nombre_socio
  FROM profiles p
  WHERE p.id = v_solicitud.socio_id;

  -- Intentar usar la embarcación principal del socio en esta guardería.
  SELECT id INTO v_embarcacion_id
  FROM embarcaciones
  WHERE profile_id = v_solicitud.socio_id
    AND guarderia_id = v_solicitud.guarderia_id
    AND es_principal = true
  LIMIT 1;

  -- Si no hay ninguna marcada como principal (edge case), usar la única que tenga.
  IF v_embarcacion_id IS NULL THEN
    SELECT COUNT(*) INTO v_count_embarcaciones
    FROM embarcaciones
    WHERE profile_id = v_solicitud.socio_id
      AND guarderia_id = v_solicitud.guarderia_id;

    IF v_count_embarcaciones = 1 THEN
      SELECT id INTO v_embarcacion_id
      FROM embarcaciones
      WHERE profile_id = v_solicitud.socio_id
        AND guarderia_id = v_solicitud.guarderia_id
      LIMIT 1;
    END IF;
  END IF;

  -- Área de la tarea = área del espacio de la embarcación (si tiene).
  IF v_embarcacion_id IS NOT NULL THEN
    SELECT esp.area_id INTO v_area_id
    FROM embarcaciones emb
    JOIN espacios esp ON esp.id = emb.espacio_id
    WHERE emb.id = v_embarcacion_id;
  END IF;

  v_descripcion := 'Lavado — ' || COALESCE(v_nombre_socio, 'sin socio');
  v_nota := 'Día de uso: ' || TO_CHAR(v_solicitud.dia_uso, 'YYYY-MM-DD');
  v_fecha_hora := (v_solicitud.dia_uso::text)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires';

  INSERT INTO tareas (
    guarderia_id,
    embarcacion_id,
    area_id,
    descripcion,
    nota,
    estado,
    fecha_hora
  ) VALUES (
    v_solicitud.guarderia_id,
    v_embarcacion_id,
    v_area_id,
    v_descripcion,
    v_nota,
    'lavado',
    v_fecha_hora
  )
  RETURNING id INTO v_tarea_id;

  UPDATE solicitudes_lavado
  SET tarea_id = v_tarea_id,
      updated_at = now()
  WHERE id = p_solicitud_id;

  RETURN v_tarea_id;
END;
$$;

-- 5. Trigger de SALIDA PROGRAMADA: estampar area_id desde la embarcación → espacio.
CREATE OR REPLACE FUNCTION public.crear_tarea_para_salida_programada()
RETURNS TRIGGER AS $$
DECLARE
  v_descripcion text;
  v_area_id uuid;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'salida' THEN
    RETURN NEW;
  END IF;
  IF NEW.desde IS NULL THEN
    RETURN NEW;
  END IF;

  v_descripcion := COALESCE(NULLIF(trim(NEW.motivo), ''), 'Salida programada');

  IF NEW.embarcacion_id IS NOT NULL THEN
    SELECT esp.area_id INTO v_area_id
    FROM embarcaciones emb
    JOIN espacios esp ON esp.id = emb.espacio_id
    WHERE emb.id = NEW.embarcacion_id;
  END IF;

  INSERT INTO public.tareas (
    guarderia_id,
    embarcacion_id,
    porteria_id,
    area_id,
    descripcion,
    estado,
    fecha_hora
  ) VALUES (
    NEW.guarderia_id,
    NEW.embarcacion_id,
    NEW.id,
    v_area_id,
    v_descripcion,
    'salida_programada'::estado_tarea,
    NEW.desde + INTERVAL '3 hours'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Backfill: estampar area_id en tareas existentes que tengan embarcación.
UPDATE public.tareas t
SET    area_id = esp.area_id
FROM   public.embarcaciones emb
JOIN   public.espacios esp ON esp.id = emb.espacio_id
WHERE  t.embarcacion_id = emb.id
  AND  t.area_id IS NULL
  AND  esp.area_id IS NOT NULL;
