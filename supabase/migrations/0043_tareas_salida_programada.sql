-- =============================================================================
-- 0043 — Tareas: nuevo estado 'salida_programada' + trigger porteria → tareas
-- =============================================================================
--
-- Contexto: queremos una solapa "Salidas programadas" en /tareas que muestre
-- automáticamente las salidas que los socios programan desde la app mobile
-- (porteria.tipo = 'salida'). Para que esa salida quede como una tarea más
-- (y se pueda mover a "Preparar" → "Navegando" → "Guardada" sin doble carga),
-- autocreamos una `tarea` con estado 'salida_programada' cada vez que se
-- inserta una porteria de tipo 'salida' con `desde` conocido.
--
-- Si más adelante el socio cancela la salida (DELETE de porteria, ON DELETE
-- SET NULL en tareas.porteria_id), la tarea queda huérfana y el admin la
-- gestiona desde /tareas (no la borramos automáticamente — la operativa
-- puede haber arrancado y queremos que quede el rastro).
-- =============================================================================

-- 1. Agregar el nuevo valor al enum. Tiene que ir antes de cualquier sentencia
--    que use el valor, por eso queda en su propia statement (Postgres permite
--    ADD VALUE dentro de transacción pero no usar el valor agregado en la
--    misma transacción).
ALTER TYPE estado_tarea ADD VALUE IF NOT EXISTS 'salida_programada' BEFORE 'preparar';

-- =============================================================================
-- Trigger: porteria (tipo='salida') → tareas
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crear_tarea_para_salida_programada()
RETURNS TRIGGER AS $$
DECLARE
  v_descripcion text;
BEGIN
  -- Solo procesamos altas de tipo 'salida' que tengan fecha de inicio.
  -- (Las salidas "instantáneas" sin `desde` no tienen sentido para
  --  programar; las dejamos pasar sin crear tarea.)
  IF NEW.tipo IS DISTINCT FROM 'salida' THEN
    RETURN NEW;
  END IF;
  IF NEW.desde IS NULL THEN
    RETURN NEW;
  END IF;

  -- Descripción default. Si el socio cargó un motivo, lo usamos.
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
    NEW.desde
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS porteria_crear_tarea_salida ON public.porteria;

CREATE TRIGGER porteria_crear_tarea_salida
  AFTER INSERT ON public.porteria
  FOR EACH ROW
  EXECUTE FUNCTION public.crear_tarea_para_salida_programada();

COMMENT ON FUNCTION public.crear_tarea_para_salida_programada() IS
  'Cuando un socio programa una salida desde mobile (porteria.tipo=salida + desde IS NOT NULL), '
  'inserta automáticamente una tarea con estado=salida_programada para que el admin la vea en /tareas.';
