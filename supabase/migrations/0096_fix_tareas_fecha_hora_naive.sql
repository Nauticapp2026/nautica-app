-- =============================================================================
-- Migration 0096: Corregir fecha_hora en trigger salida_programada
--
-- Bug: el trigger crear_tarea_para_salida_programada copiaba porteria.desde
-- directamente a tareas.fecha_hora. porteria.desde es un timestamp naive
-- (mobile envía hora AR local con suffix Z, sin corrección de TZ). Al
-- mostrarlo en la web con timeZone:'America/Argentina/Buenos_Aires' se restaban
-- 3 horas, produciendo una hora 3h antes de la real.
--
-- Fix: sumar 3h al naive para obtener UTC real, igual que naiveIsoToArgentinaUtc
-- en el mobile (Argentina es UTC-3 fijo, sin DST).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crear_tarea_para_salida_programada()
RETURNS TRIGGER AS $$
DECLARE
  v_descripcion text;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'salida' THEN
    RETURN NEW;
  END IF;
  IF NEW.desde IS NULL THEN
    RETURN NEW;
  END IF;

  v_descripcion := COALESCE(NULLIF(trim(NEW.motivo), ''), 'Salida programada');

  INSERT INTO public.tareas (
    guarderia_id,
    embarcacion_id,
    porteria_id,
    descripcion,
    estado,
    fecha_hora
  ) VALUES (
    NEW.guarderia_id,
    NEW.embarcacion_id,
    NEW.id,
    v_descripcion,
    'salida_programada'::estado_tarea,
    NEW.desde + INTERVAL '3 hours'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Corregir tareas existentes creadas por el trigger (tienen porteria_id).
-- Su fecha_hora fue copiada del naive porteria.desde; sumarle 3h.
UPDATE public.tareas t
SET    fecha_hora = p.desde + INTERVAL '3 hours'
FROM   public.porteria p
WHERE  t.porteria_id = p.id
  AND  t.fecha_hora  IS NOT NULL;
