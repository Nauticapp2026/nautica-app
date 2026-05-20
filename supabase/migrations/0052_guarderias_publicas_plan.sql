-- =============================================================================
-- 0052 — Sumar `plan` a guarderias_publicas.
--
-- Motivo: la pantalla "Espacios" del mobile va a empezar a filtrar publicaciones
-- por el plan del club: `esencial` no aparece, `premium` muestra max 2 espacios,
-- `elite` max 5. Como la pantalla es cross-tenant (lee clubes de los que el user
-- no es miembro), pega contra la vista `guarderias_publicas` y no contra la
-- tabla `guarderias` (esta solo deja leer al miembro del club por RLS). Para
-- que el cap funcione, la vista tiene que exponer `plan`.
--
-- No es info sensible: el plan ya se ve publicamente desde el comportamiento
-- (cuantos espacios publica) y es una decision comercial visible.
--
-- Idempotente: `create or replace view` no rompe nada si ya existe.
-- =============================================================================

-- IMPORTANTE: `create or replace view` no permite reordenar ni quitar columnas
-- existentes (Postgres lo interpreta como rename). La columna nueva (`plan`)
-- va AL FINAL, despues de `activa` (que era la ultima en mig 0050).
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
  from public.guarderias;

comment on view public.guarderias_publicas is
  'Proyeccion de guarderias activas con columnas seguras para descubrimiento. Ahora con `plan` para que el mobile pueda aplicar el cap de espacios visibles (esencial=0, premium=2, elite=5). SELECT abierto a authenticated y anon.';

grant select on public.guarderias_publicas to authenticated;
grant select on public.guarderias_publicas to anon;
