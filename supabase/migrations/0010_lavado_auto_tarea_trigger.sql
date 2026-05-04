-- Cuando un socio crea una solicitud de lavado (típicamente desde la app
-- mobile), automáticamente generamos una tarea con estado='lavado' y
-- asociamos solicitudes_lavado.tarea_id, para que aparezca en el panel
-- de tareas del web sin requerir intervención manual.
--
-- Función helper que materializa la tarea desde una solicitud puntual.
-- Idempotente: si la solicitud ya tiene tarea_id, devuelve ese id sin
-- crear nada nuevo. Devuelve el tarea_id resultante.

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

  -- Auto-asignar embarcación solo si el socio tiene exactamente una en
  -- esta guardería (caso ambiguo se deja en null para que el admin elija).
  SELECT COUNT(*)
  INTO v_count_embarcaciones
  FROM embarcaciones
  WHERE profile_id = v_solicitud.socio_id
    AND guarderia_id = v_solicitud.guarderia_id;

  IF v_count_embarcaciones = 1 THEN
    SELECT id INTO v_embarcacion_id
    FROM embarcaciones
    WHERE profile_id = v_solicitud.socio_id
      AND guarderia_id = v_solicitud.guarderia_id
    LIMIT 1;
  ELSE
    v_embarcacion_id := NULL;
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

-- Trigger AFTER INSERT en solicitudes_lavado: dispara la creación
-- automática de tarea solo si la solicitud llegó sin tarea_id.

CREATE OR REPLACE FUNCTION public._on_solicitud_lavado_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._create_tarea_for_solicitud_lavado(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_solicitud_lavado_insert ON solicitudes_lavado;
CREATE TRIGGER trg_on_solicitud_lavado_insert
AFTER INSERT ON solicitudes_lavado
FOR EACH ROW
WHEN (NEW.tarea_id IS NULL)
EXECUTE FUNCTION public._on_solicitud_lavado_insert();

-- Backfill: para todas las solicitudes activas que están sin tarea
-- asociada, crear la tarea correspondiente. Solo agarra estados activos
-- (pendiente, en_proceso) — las canceladas no necesitan tarea.

SELECT public._create_tarea_for_solicitud_lavado(s.id)
FROM solicitudes_lavado s
WHERE s.tarea_id IS NULL
  AND s.estado IN ('pendiente', 'en_proceso');
