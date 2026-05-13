-- =============================================================================
-- Notificaciones push: ampliar audiencias y sacar "una guardería específica".
--
-- Antes:
--   notificacion_audiencia = ('todas', 'guarderia')
--   platform_notificaciones.guarderia_id (required si audiencia='guarderia')
--
-- Después:
--   notificacion_audiencia = (
--     'todos', 'con_club', 'sin_club',
--     'plan_esencial', 'plan_club', 'plan_elite'
--   )
--   platform_notificaciones.guarderia_id dropeado.
--
-- Mapeo de valores existentes:
--   'todas'     → 'todos'
--   'guarderia' → se elimina la fila (no hay equivalente en el nuevo set)
--
-- Postgres no permite DROP VALUE en un enum, así que la estrategia es:
--   1. Crear un enum nuevo con los valores finales.
--   2. ALTER TABLE para que la columna use el enum nuevo (mapeo con CASE).
--   3. DROP del enum viejo, RENAME del nuevo al nombre original.
-- =============================================================================

-- 1. Crear enum v2.
create type public.notificacion_audiencia_v2 as enum (
  'todos',
  'con_club',
  'sin_club',
  'plan_esencial',
  'plan_club',
  'plan_elite'
);

-- 2. Borrar las notifs con audiencia 'guarderia' (no hay equivalente).
delete from public.platform_notificaciones where audiencia = 'guarderia';

-- 3. Dropear el check constraint que ligaba audiencia con guarderia_id.
alter table public.platform_notificaciones
  drop constraint if exists platform_notificaciones_guarderia_consistente;

-- 4. Cambiar el type de la columna mapeando 'todas' → 'todos'. El cast
--    explícito vía CASE evita errores si quedó algún valor inesperado.
alter table public.platform_notificaciones
  alter column audiencia type public.notificacion_audiencia_v2
  using (
    case audiencia::text
      when 'todas' then 'todos'
      else audiencia::text
    end
  )::public.notificacion_audiencia_v2;

-- 5. Dropear el enum viejo y renombrar el nuevo al nombre original.
drop type public.notificacion_audiencia;
alter type public.notificacion_audiencia_v2 rename to notificacion_audiencia;

-- 6. Dropear la columna guarderia_id (ya no se usa).
alter table public.platform_notificaciones
  drop column if exists guarderia_id;
