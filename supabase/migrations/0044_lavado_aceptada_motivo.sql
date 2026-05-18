-- =============================================================================
-- 0044 — Lavado: enum 'aceptada' + columna motivo_cancelacion
-- =============================================================================
--
-- Contexto: el estado del flujo de lavado pasa a tener nombres más amigables
-- para el socio (Pendiente / Aceptada / Lista / Cancelada). El valor viejo
-- 'en_proceso' se renombra a 'aceptada'.
--
-- Para no romper la app mobile (mismo Supabase, mismo enum) hacemos el
-- cambio en dos pasos: esta migración agrega 'aceptada' y backfillea las
-- rows existentes, pero deja 'en_proceso' vivo en el enum como alias
-- temporal. Una vez que mobile esté deployada leyendo/escribiendo
-- 'aceptada', podemos borrar 'en_proceso' en una migración posterior.
--
-- También agregamos `motivo_cancelacion` para que el admin pueda
-- explicarle al socio por qué se canceló una solicitud (se le manda en
-- la push notification).
-- =============================================================================

-- 1. Sumar el nuevo valor al enum. Va antes de 'lista' para que la lista
--    quede en orden lógico (pendiente → aceptada → lista → cancelada).
ALTER TYPE estado_solicitud_lavado ADD VALUE IF NOT EXISTS 'aceptada' AFTER 'pendiente';

-- ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción que el
-- valor agregado. Cerramos esta transacción y arrancamos otra para el resto.
COMMIT;
BEGIN;

-- 2. Backfill: cualquier row con estado='en_proceso' pasa a 'aceptada'.
UPDATE public.solicitudes_lavado
SET estado = 'aceptada'::estado_solicitud_lavado,
    updated_at = now()
WHERE estado = 'en_proceso';

-- 3. Recrear el unique index parcial para que la "solicitud activa por socio"
--    contemple el nombre nuevo. (El viejo seguía referenciando 'en_proceso'.)
DROP INDEX IF EXISTS solicitudes_lavado_socio_activa_unique;

CREATE UNIQUE INDEX solicitudes_lavado_socio_activa_unique
  ON public.solicitudes_lavado (socio_id)
  WHERE estado IN ('pendiente', 'aceptada', 'en_proceso');

-- 4. Motivo de cancelación. Se completa cuando el admin marca 'cancelada'
--    para que el socio sepa por qué (se le manda en el push notification).
ALTER TABLE public.solicitudes_lavado
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text;

-- =============================================================================
-- 5. Trigger: notificar al socio cuando cambia el estado
--
--    Inserta una row en public.notificaciones (la tabla que mobile lee como
--    feed in-app del usuario). El push Expo lo manda la server action del
--    lado web — esto es solo el espejo in-app.
--
--    Mismo patrón que public.notificar_resenia_servicio: SECURITY DEFINER,
--    payload con ids/strings que mobile usa para renderizar el copy.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notificar_solicitud_lavado_estado()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo text;
  v_club_nombre text;
BEGIN
  -- Solo procesamos cuando el estado realmente cambió.
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  -- Mapeamos los estados que ameritan notificación al socio.
  IF NEW.estado = 'aceptada' THEN
    v_tipo := 'lavado_aceptada';
  ELSIF NEW.estado = 'lista' THEN
    v_tipo := 'lavado_lista';
  ELSIF NEW.estado = 'cancelada' THEN
    v_tipo := 'lavado_cancelada';
  ELSE
    -- 'pendiente' o 'en_proceso' (legacy) no generan notif.
    RETURN NEW;
  END IF;

  SELECT g.nombre INTO v_club_nombre
    FROM public.guarderias g
   WHERE g.id = NEW.guarderia_id;

  INSERT INTO public.notificaciones (user_id, tipo, payload)
  VALUES (
    NEW.socio_id,
    v_tipo,
    jsonb_build_object(
      'solicitud_id', NEW.id,
      'guarderia_id', NEW.guarderia_id,
      'guarderia_nombre', v_club_nombre,
      'dia_uso', NEW.dia_uso,
      'motivo_cancelacion', NEW.motivo_cancelacion
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

DROP TRIGGER IF EXISTS trg_notificar_solicitud_lavado ON public.solicitudes_lavado;

CREATE TRIGGER trg_notificar_solicitud_lavado
  AFTER UPDATE OF estado ON public.solicitudes_lavado
  FOR EACH ROW
  EXECUTE FUNCTION public.notificar_solicitud_lavado_estado();

COMMENT ON FUNCTION public.notificar_solicitud_lavado_estado() IS
  'Inserta una notificación in-app (tabla notificaciones) para el socio cuando '
  'una solicitud_lavado cambia a aceptada / lista / cancelada. El push Expo '
  'lo dispara la server action del web por separado.';
