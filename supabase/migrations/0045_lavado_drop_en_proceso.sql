-- =============================================================================
-- 0045 — Lavado: borrar valor 'en_proceso' del enum (alias legacy)
-- =============================================================================
--
-- Contexto: la migración 0044 renombró el valor 'en_proceso' a 'aceptada'
-- y lo dejó vivo como alias temporal hasta que la app mobile estuviera
-- deployada usando 'aceptada'. Ya está deployada (web y mobile escriben
-- 'aceptada', no hay rows con 'en_proceso'), así que sacamos el valor.
--
-- Postgres no soporta `ALTER TYPE ... DROP VALUE`. La forma idiomática es:
--   1. Crear un enum nuevo sin el valor.
--   2. Cambiar la(s) columna(s) al tipo nuevo.
--   3. Recrear los índices parciales que referenciaban el valor viejo.
--   4. Dropear el tipo viejo y renombrar el nuevo.
--
-- Si quedó alguna row con `estado='en_proceso'` (no debería) la mandamos a
-- 'aceptada' antes del cambio de tipo, sino el cast falla.
-- =============================================================================

-- 1. Backfill defensivo (debería ser 0 filas).
UPDATE public.solicitudes_lavado
SET estado = 'aceptada'::estado_solicitud_lavado,
    updated_at = now()
WHERE estado = 'en_proceso';

-- 2. El unique index parcial mencionaba 'en_proceso'. Lo borramos antes
--    del cambio de tipo: el `USING estado::text::nuevo` falla si hay
--    expressions que referencien el valor viejo.
DROP INDEX IF EXISTS solicitudes_lavado_socio_activa_unique;

-- 2b. Lo mismo con el trigger que referencia la columna explícitamente
--     vía `AFTER UPDATE OF estado`: Postgres no deja cambiar el tipo
--     mientras un trigger lo referencia. Lo recreamos al final.
DROP TRIGGER IF EXISTS trg_notificar_solicitud_lavado ON public.solicitudes_lavado;

-- 3. Crear el enum nuevo.
CREATE TYPE estado_solicitud_lavado_new AS ENUM (
  'pendiente',
  'aceptada',
  'lista',
  'cancelada'
);

-- 4. Cambiar la columna al enum nuevo. Quitamos el default antes del cast
--    porque el default referencia el tipo viejo; lo volvemos a poner
--    después contra el tipo nuevo.
ALTER TABLE public.solicitudes_lavado
  ALTER COLUMN estado DROP DEFAULT,
  ALTER COLUMN estado TYPE estado_solicitud_lavado_new
    USING (estado::text::estado_solicitud_lavado_new),
  ALTER COLUMN estado SET DEFAULT 'pendiente'::estado_solicitud_lavado_new,
  ALTER COLUMN estado SET NOT NULL;

-- 5. Dropear el tipo viejo y renombrar el nuevo para que el código que ya
--    referencia `estado_solicitud_lavado` siga funcionando.
DROP TYPE estado_solicitud_lavado;
ALTER TYPE estado_solicitud_lavado_new RENAME TO estado_solicitud_lavado;

-- 6. Recrear el unique index parcial sin la referencia a 'en_proceso'.
CREATE UNIQUE INDEX solicitudes_lavado_socio_activa_unique
  ON public.solicitudes_lavado (socio_id)
  WHERE estado IN ('pendiente', 'aceptada');

-- 7. Recrear el trigger de notificación (mismo body que mig 0044).
CREATE TRIGGER trg_notificar_solicitud_lavado
  AFTER UPDATE OF estado ON public.solicitudes_lavado
  FOR EACH ROW
  EXECUTE FUNCTION public.notificar_solicitud_lavado_estado();
