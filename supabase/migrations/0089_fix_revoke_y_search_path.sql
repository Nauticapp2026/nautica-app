-- =============================================================================
-- Migration 0089: Corregir REVOKE (desde PUBLIC) y fijar search_path
-- La migración 0088 revocó desde anon/authenticated pero el grant estaba
-- en PUBLIC. Hay que revocar desde PUBLIC y re-otorgar donde corresponde.
-- =============================================================================


-- ============================================================
-- PARTE 1: Funciones trigger / internas
-- Solo las llama el motor de DB (triggers) o crons con service role.
-- Nadie necesita llamarlas vía /rpc/.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.monitor_arribos() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crear_tarea_para_salida_programada() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._create_tarea_for_solicitud_lavado(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._on_membership_socio_downgrade() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._on_servicio_precio_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._on_solicitud_lavado_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._on_solicitud_membership_resolved() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notificar_embarcacion_guardada() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notificar_ingreso_porteria_invitado() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notificar_resenia_servicio() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notificar_sin_respuesta() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notificar_solicitud_lavado_estado() FROM PUBLIC;


-- ============================================================
-- PARTE 2: Funciones auxiliares de RLS
-- Solo necesitan ser llamadas por usuarios autenticados
-- (las usan las policies de RLS al evaluar permisos).
-- Se revoca de PUBLIC y se re-otorga solo a authenticated.
-- anon no las necesita: auth.uid() es null → siempre retornan false.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.guarderia_rol(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guarderia_rol(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_elite_socio() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_elite_socio() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_guarderia_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_guarderia_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_guarderia_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_guarderia_member(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_guarderia_seguridad(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_guarderia_seguridad(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.shares_guarderia_with_seguridad(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shares_guarderia_with_seguridad(uuid) TO authenticated;

-- accept_invitation: se llama directamente desde web/mobile durante el onboarding.
-- Se mantiene accesible para anon y authenticated (no se toca).


-- ============================================================
-- PARTE 3: Fijar search_path en todas las funciones con warning
-- Previene ataques de schema injection via search_path mutable.
-- ============================================================

ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.app_now_naive() SET search_path = public;
ALTER FUNCTION public.monitor_arribos() SET search_path = public;
ALTER FUNCTION public.auto_resolver_alertas_por_arribo() SET search_path = public;
ALTER FUNCTION public.solicitudes_lavado_touch_updated_at() SET search_path = public;
ALTER FUNCTION public.marketplace_servicios_set_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_marketplace_propiedades_set_updated() SET search_path = public;
ALTER FUNCTION public.tg_marketplace_embarcaciones_set_updated() SET search_path = public;
ALTER FUNCTION public.marketplace_resenias_set_updated_at() SET search_path = public;
ALTER FUNCTION public.crear_tarea_para_salida_programada() SET search_path = public;


-- ============================================================
-- ADVERTENCIAS QUE QUEDAN (son falsos positivos o intencionales):
--
-- • authenticated_security_definer_function_executable en is_guarderia_admin,
--   is_super_admin, etc. → INTENCIONAL: los usuarios autenticados necesitan
--   ejecutarlas para que las policies de RLS funcionen.
--
-- • anon_security_definer_function_executable en accept_invitation →
--   INTENCIONAL: el flujo de invitaciones puede requerirlo antes del login.
--
-- • security_definer_view en guarderias_publicas → INTENCIONAL: necesaria
--   para novedades cross-club de socios Elite.
--
-- • public_bucket_allows_listing en avatars/embarcaciones/marketplace-imagenes →
--   INTENCIONAL: buckets públicos por diseño.
--
-- • auth_leaked_password_protection → habilitar desde Supabase Dashboard →
--   Authentication → Password strength → "Leaked password protection".
-- ============================================================
