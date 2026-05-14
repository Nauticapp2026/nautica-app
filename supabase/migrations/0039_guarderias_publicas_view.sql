-- =============================================================================
-- 0039 — Vista pública de guarderías para descubrimiento desde mobile.
--
-- Motivo: la policy RLS de `guarderias.SELECT` exige ser miembro del club
-- (`public.is_guarderia_member(id)`). Eso significa que un usuario `sin_rol`
-- (registrado pero sin membership) no puede listar guarderías para elegir
-- a cuál solicitar ingreso desde la pantalla mobile "Mi club" / "Buscar club".
--
-- En vez de abrir SELECT en `guarderias` (lo que expondría cuit, email,
-- teléfono a cualquier authenticated), exponemos una **vista** que solo
-- proyecta columnas seguras para descubrimiento, con SELECT abierto a
-- authenticated. cuit / email / telefono no se filtran a la vista.
--
-- La vista se crea con `security_invoker=true` (Postgres 15+), pero ese
-- modo respeta la RLS de la tabla base — y nuestra RLS bloquea a los
-- sin_rol. Por eso la creamos con el dueño postgres y `security_invoker=off`
-- (default) — la vista ignora la RLS de `guarderias` y solo aplica la
-- policy de la vista.
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
    created_at
  from public.guarderias;

comment on view public.guarderias_publicas is
  'Proyección de guarderias con solo columnas seguras para descubrimiento (sin cuit/email/telefono ni datos operativos). SELECT abierto a authenticated. La usa la mobile en la pantalla "Mi club" cuando el user todavía no tiene membership.';

-- Permiso de SELECT a cualquier user autenticado (la mobile lo necesita para
-- listar guarderías a las que un sin_rol puede solicitar ingreso).
grant select on public.guarderias_publicas to authenticated;
revoke all on public.guarderias_publicas from anon;
