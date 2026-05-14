-- =============================================================================
-- 0040 — Permitir SELECT a `anon` en la vista `guarderias_publicas`.
--
-- Motivo: el step 3 del signup multi-step de la app mobile (elegir club)
-- consulta `guarderias_publicas` ANTES de que el user haga signUp. En ese
-- momento el rol del cliente Supabase es `anon`. La mig 0039 dio SELECT
-- solo a `authenticated`, así que la lista quedaba vacía.
--
-- La vista no expone cuit/email/telefono ni datos operativos — solo nombre,
-- ciudad, provincia, logo, etc. Es info que un usuario podría ver en cualquier
-- landing pública del club. Seguro a nivel anon.
--
-- Idempotente.
-- =============================================================================

grant select on public.guarderias_publicas to anon;
