-- _create_tarea_for_solicitud_lavado creaba SIEMPRE la tarea de lavado con
-- area_id NULL y es_marina false (default de columna) — nunca derivaba esos
-- valores de la embarcación del socio. Resultado: una solicitud de lavado de
-- un barco guardado en una Marina terminaba visible solo para Operario
-- (nave), nunca para el Marinero correspondiente. Se corrige derivando
-- area_id/es_marina del espacio de la embarcación, igual que ya hace
-- notificar_marineros_salida_programada (mobile mig 0026) para las salidas.
--
-- Además, se agrega la notificación (campanita in-app + cola de push, mismo
-- patrón que mobile mig 0026 con `notificaciones`/push_sent_at) al staff
-- correspondiente apenas se crea la tarea de lavado — hoy solo quedaba
-- visible si el operario/marinero entraba a mirar la pestaña Lavado.

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
  v_embarcacion_nombre text;
  v_count_embarcaciones int;
  v_tarea_id uuid;
  v_descripcion text;
  v_nota text;
  v_fecha_hora timestamptz;
  v_area_id uuid;
  v_es_marina boolean := false;
  v_titulo text;
  v_cuerpo text;
  r RECORD;
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
    SELECT id, nombre
    INTO v_embarcacion_id, v_embarcacion_nombre
    FROM embarcaciones
    WHERE profile_id = v_solicitud.socio_id
      AND guarderia_id = v_solicitud.guarderia_id
    LIMIT 1;
  ELSE
    v_embarcacion_id := NULL;
  END IF;

  -- Área + nave/marina, derivado del espacio de la embarcación. Ambigua o
  -- sin espacio asignado → area_id NULL (la ve todo el staff de la
  -- guardería) + es_marina false (default a Operario, como antes).
  IF v_embarcacion_id IS NOT NULL THEN
    SELECT esp.area_id, (esp.marina_id IS NOT NULL)
    INTO v_area_id, v_es_marina
    FROM embarcaciones emb
    JOIN espacios esp ON esp.id = emb.espacio_id
    WHERE emb.id = v_embarcacion_id;
    v_es_marina := COALESCE(v_es_marina, false);
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
    fecha_hora,
    area_id,
    es_marina
  ) VALUES (
    v_solicitud.guarderia_id,
    v_embarcacion_id,
    v_descripcion,
    v_nota,
    'lavado',
    v_fecha_hora,
    v_area_id,
    v_es_marina
  )
  RETURNING id INTO v_tarea_id;

  UPDATE solicitudes_lavado
  SET tarea_id = v_tarea_id,
      updated_at = now()
  WHERE id = p_solicitud_id;

  -- Notificación al staff correspondiente (Operario o Marinero). El título y
  -- cuerpo viajan en el payload (mismo patrón que marina_* en mobile mig
  -- 0026) porque el push lo despacha un endpoint aparte, no este trigger.
  v_titulo := 'Nueva solicitud de lavado';
  v_cuerpo := COALESCE(v_nombre_socio, 'Un socio') || ' pidió lavado para el ' ||
    TO_CHAR(v_solicitud.dia_uso, 'DD/MM') ||
    CASE WHEN v_embarcacion_nombre IS NOT NULL THEN ' — ' || v_embarcacion_nombre ELSE '' END;

  IF v_area_id IS NOT NULL AND v_es_marina THEN
    FOR r IN SELECT marinero_id AS staff_id FROM area_marineros WHERE area_id = v_area_id LOOP
      INSERT INTO notificaciones (user_id, tipo, payload)
      VALUES (
        r.staff_id, 'lavado_solicitado',
        jsonb_build_object('solicitud_id', p_solicitud_id, 'tarea_id', v_tarea_id, 'titulo', v_titulo, 'cuerpo', v_cuerpo)
      );
    END LOOP;
  ELSIF v_area_id IS NOT NULL THEN
    FOR r IN SELECT operario_id AS staff_id FROM area_operarios WHERE area_id = v_area_id LOOP
      INSERT INTO notificaciones (user_id, tipo, payload)
      VALUES (
        r.staff_id, 'lavado_solicitado',
        jsonb_build_object('solicitud_id', p_solicitud_id, 'tarea_id', v_tarea_id, 'titulo', v_titulo, 'cuerpo', v_cuerpo)
      );
    END LOOP;
  ELSE
    FOR r IN
      SELECT user_id AS staff_id
      FROM memberships
      WHERE guarderia_id = v_solicitud.guarderia_id
        AND status = 'active'
        AND rol = (CASE WHEN v_es_marina THEN 'marinero' ELSE 'operario' END)::rol
    LOOP
      INSERT INTO notificaciones (user_id, tipo, payload)
      VALUES (
        r.staff_id, 'lavado_solicitado',
        jsonb_build_object('solicitud_id', p_solicitud_id, 'tarea_id', v_tarea_id, 'titulo', v_titulo, 'cuerpo', v_cuerpo)
      );
    END LOOP;
  END IF;

  RETURN v_tarea_id;
END;
$$;
