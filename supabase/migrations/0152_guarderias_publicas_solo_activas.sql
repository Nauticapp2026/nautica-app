-- =============================================================================
-- 0152 — La vista pública de guarderías muestra solo los clubes ACTIVOS.
--
-- La vista no filtraba nada (`select ... from guarderias`, sin WHERE), así que
-- un club todavía pendiente de activación aparecía en el directorio público:
-- alguien que se registra en la app mobile lo veía como opción válida y podía
-- mandarle una solicitud de ingreso. Caso real (2026-09-02): el club "Camba"
-- (activa = false) salía en las listas junto a los tres activos.
--
-- Se ve en las dos pantallas mobile que listan TODOS los clubes:
--   - app/(auth)/login.tsx  → elegir club al registrarse
--   - app/(tabs)/mi-club.tsx → buscar club y pedir ingreso
-- Las otras dos que usan la vista (espacios, espacio/[id]) piden por id, así que
-- no las afecta.
--
-- `activa is true` y no `= true` a propósito: también excluye NULL, por si
-- alguna fila futura queda sin el flag. Hoy no hay ninguna (0 nulos, 3 activos,
-- 1 inactivo).
--
-- NO se cambian las columnas: `activa` y `plan` siguen expuestas porque la app
-- mobile las usa (el tope de publicaciones por plan — ver 0052). Ninguna
-- pantalla filtra por `activa`, así que agregar el filtro acá no rompe nada.
--
-- Se preserva lo que hace que esta vista funcione, y que si se pierde ROMPE el
-- alta de socios nuevos:
--   - `security_invoker = false`: la vista tiene que IGNORAR la RLS de
--     `guarderias` (que exige ser miembro). Es lo que el linter de Supabase
--     marca como "Security Definer View" y es deliberado — ver 0039.
--   - dueño `postgres` y SELECT para anon/authenticated: `create or replace
--     view` los conserva, pero los grants se reafirman por si acaso.
--
-- Idempotente.
-- =============================================================================

create or replace view public.guarderias_publicas
with (security_invoker = false) as
select
  id,
  nombre,
  slug,
  descripcion,
  direccion,
  ciudad,
  provincia,
  codigo_postal,
  latitud,
  longitud,
  tipo,
  logo_url,
  imagenes,
  facebook,
  instagram,
  created_at,
  telefono,
  email,
  activa,
  plan
from public.guarderias
where activa is true;

alter view public.guarderias_publicas owner to postgres;

grant select on public.guarderias_publicas to anon, authenticated;
