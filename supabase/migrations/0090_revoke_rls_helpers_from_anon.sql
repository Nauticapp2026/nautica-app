-- =============================================================================
-- Migration 0090: Revocar EXECUTE en helpers de RLS del rol anon
-- La 0089 revocó de PUBLIC pero Supabase tenía grants explícitos a anon.
-- Ninguna policy accesible por anon llama estas funciones (verificado).
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.guarderia_rol(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_elite_socio() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_guarderia_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_guarderia_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_guarderia_seguridad(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.shares_guarderia_with_seguridad(uuid) FROM anon;

-- accept_invitation: se mantiene accesible para anon (flujo de invitaciones).
