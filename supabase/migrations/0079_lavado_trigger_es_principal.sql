-- Fix: cuando el socio tiene múltiples embarcaciones, usar la marcada como
-- es_principal en lugar de dejar embarcacion_id = NULL.
-- Si por algún motivo ninguna está marcada como principal (edge case), se
-- mantiene el comportamiento anterior: exactamente 1 embarcación → asignar,
-- 0 o ambiguo sin principal → dejar NULL.

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

  -- Si no hay ninguna marcada como principal (edge case: socio con una sola
  -- embarcación creada antes de que existiera el flag), usar la única que
  -- tenga.
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

  v_descripcion := 'Lavado — ' || COALESCE(v_nombre_socio, 'sin socio');
  v_nota := 'Día de uso: ' || TO_CHAR(v_solicitud.dia_uso, 'YYYY-MM-DD');
  v_fecha_hora := (v_solicitud.dia_uso::text)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires';

  INSERT INTO tareas (
    guarderia_id,
    embarcacion_id,
    descripcion,
    nota,
    estado,
    fecha_hora
  ) VALUES (
    v_solicitud.guarderia_id,
    v_embarcacion_id,
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
