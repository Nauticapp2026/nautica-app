-- =============================================================================
-- Rol MARINERO.
--
-- El marinero es el equivalente del operario pero para MARINAS (amarras en el
-- agua) en vez de NAVES (depósito en seco). Mismos accesos que el operario. Se
-- asigna por ÁREA igual que el operario (tabla area_marineros, espejo de
-- area_operarios). El ruteo de tareas se hace por dónde está el barco: si el
-- espacio del barco está en una marina → tarea de marinero; si está en nave →
-- tarea de operario (como hoy). Se estampa `tareas.es_marina` para filtrar.
-- =============================================================================

-- 1. Nuevo valor del enum rol. (ADD VALUE va solo, no se puede usar el valor
--    nuevo en la misma transacción — acá no se usa como literal igual.)
ALTER TYPE rol ADD VALUE IF NOT EXISTS 'marinero' AFTER 'operario';

-- 2. Marca marina/nave en la tarea (derivada del espacio del barco).
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS es_marina boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tareas_es_marina_idx ON public.tareas (es_marina);

-- 3. Tabla de relación área ↔ marinero (M:N), espejo de area_operarios.
CREATE TABLE IF NOT EXISTS public.area_marineros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guarderia_id uuid NOT NULL REFERENCES public.guarderias(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  marinero_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS area_marineros_area_marinero_idx
  ON public.area_marineros (area_id, marinero_id);
CREATE INDEX IF NOT EXISTS area_marineros_marinero_idx ON public.area_marineros (marinero_id);
CREATE INDEX IF NOT EXISTS area_marineros_guarderia_idx ON public.area_marineros (guarderia_id);

-- 4. RLS: miembros de la guardería leen; admins gestionan. (Idéntico a area_operarios.)
ALTER TABLE public.area_marineros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "area_marineros_member_select" ON public.area_marineros
  FOR SELECT USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "area_marineros_admin_write" ON public.area_marineros
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

-- 5. Trigger de LAVADO: estampar también es_marina (espacio.marina_id IS NOT NULL).
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
  v_es_marina boolean := false;
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

  -- Área de la tarea = área del espacio de la embarcación (si tiene). Y si ese
  -- espacio está en una marina, la tarea es de marinero.
  IF v_embarcacion_id IS NOT NULL THEN
    SELECT esp.area_id, (esp.marina_id IS NOT NULL)
    INTO v_area_id, v_es_marina
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
    es_marina,
    descripcion,
    nota,
    estado,
    fecha_hora
  ) VALUES (
    v_solicitud.guarderia_id,
    v_embarcacion_id,
    v_area_id,
    COALESCE(v_es_marina, false),
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

-- 6. Trigger de SALIDA PROGRAMADA: estampar también es_marina.
CREATE OR REPLACE FUNCTION public.crear_tarea_para_salida_programada()
RETURNS TRIGGER AS $$
DECLARE
  v_descripcion text;
  v_area_id uuid;
  v_es_marina boolean := false;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'salida' THEN
    RETURN NEW;
  END IF;
  IF NEW.desde IS NULL THEN
    RETURN NEW;
  END IF;

  v_descripcion := COALESCE(NULLIF(trim(NEW.motivo), ''), 'Salida programada');

  IF NEW.embarcacion_id IS NOT NULL THEN
    SELECT esp.area_id, (esp.marina_id IS NOT NULL)
    INTO v_area_id, v_es_marina
    FROM embarcaciones emb
    JOIN espacios esp ON esp.id = emb.espacio_id
    WHERE emb.id = NEW.embarcacion_id;
  END IF;

  INSERT INTO public.tareas (
    guarderia_id,
    embarcacion_id,
    porteria_id,
    area_id,
    es_marina,
    descripcion,
    estado,
    fecha_hora
  ) VALUES (
    NEW.guarderia_id,
    NEW.embarcacion_id,
    NEW.id,
    v_area_id,
    COALESCE(v_es_marina, false),
    v_descripcion,
    'salida_programada'::estado_tarea,
    NEW.desde + INTERVAL '3 hours'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Backfill es_marina en tareas existentes con embarcación en una marina.
UPDATE public.tareas t
SET    es_marina = true
FROM   public.embarcaciones emb
JOIN   public.espacios esp ON esp.id = emb.espacio_id
WHERE  t.embarcacion_id = emb.id
  AND  esp.marina_id IS NOT NULL
  AND  t.es_marina = false;
