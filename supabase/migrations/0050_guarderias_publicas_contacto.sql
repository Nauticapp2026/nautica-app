-- =============================================================================
-- 0050 — Sumar telefono y email a guarderias_publicas.
--
-- Motivo: la pantalla "Espacios" del mobile (Etapa 1 del plan de lanzamiento)
-- muestra amarras/camas libres de los clubes adheridos cross-tenant. Para
-- habilitar los CTA de contacto (Llamar / WhatsApp / Email) hay que exponer
-- esos campos en la vista publica.
--
-- Es info de contacto comercial de un club nautico — equivalente a lo que
-- aparece en cualquier landing publica o guia nautica. No expone cuit ni
-- datos operativos (siguen fuera de la vista).
--
-- Idempotente: `create or replace view` no rompe nada si ya existe.
-- =============================================================================

-- IMPORTANTE: `create or replace view` no permite reordenar ni quitar columnas
-- existentes (Postgres lo interpreta como rename). Por eso las columnas nuevas
-- (`telefono`, `email`, `activa`) van AL FINAL, despues de `created_at`.
--
-- Mantenemos la vista SIN filtro WHERE para no cambiar el comportamiento de
-- mig 0039 (la usa el signup mobile para listar clubes). Mobile filtra por
-- `activa = true` en client (pantalla Espacios) usando la columna nueva.
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
    activa
  from public.guarderias;

comment on view public.guarderias_publicas is
  'Proyeccion de guarderias activas con columnas seguras para descubrimiento (sin cuit ni datos operativos), ahora con telefono y email para CTAs de contacto en pantalla Espacios. SELECT abierto a authenticated y anon.';

grant select on public.guarderias_publicas to authenticated;
grant select on public.guarderias_publicas to anon;
