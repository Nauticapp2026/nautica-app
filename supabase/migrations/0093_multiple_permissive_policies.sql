-- =============================================================================
-- Migration 0093: Corregir multiple_permissive_policies
--
-- El problema: cuando una tabla tiene múltiples policies permisivas para la
-- misma acción (ej. dos FOR SELECT), Postgres evalúa AMBAS para cada fila.
-- Hay dos patrones de fix:
--
--   A) Policy FOR ALL que se superpone con una FOR SELECT:
--      → Convertir FOR ALL en INSERT + UPDATE + DELETE (sin SELECT).
--
--   B) Múltiples FOR SELECT sobre la misma tabla:
--      → Fusionar en una sola policy con OR.
--
-- También cierra los 2 auth_rls_initplan restantes:
--   • embarcaciones_select_own  (queda absorbido en la policy fusionada)
--   • comunicaciones_select     (legacy, reemplazada por comunicaciones_select_member)
-- =============================================================================


-- ============================================================
-- PLATAFORMA: pricing_plans, pricing_features, pricing_plan_features,
--             platform_settings, platform_publicidades, platform_comunicaciones
--
-- Patrón: _select_public (FOR SELECT USING true) +
--          _write_super_admin (FOR ALL USING is_super_admin())
-- Fix A: convertir _write_super_admin en INSERT + UPDATE + DELETE.
-- ============================================================

DROP POLICY IF EXISTS "pricing_plans_write_super_admin" ON public.pricing_plans;
CREATE POLICY "pricing_plans_admin_insert" ON public.pricing_plans
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "pricing_plans_admin_update" ON public.pricing_plans
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "pricing_plans_admin_delete" ON public.pricing_plans
  FOR DELETE USING (public.is_super_admin());

DROP POLICY IF EXISTS "pricing_features_write_super_admin" ON public.pricing_features;
CREATE POLICY "pricing_features_admin_insert" ON public.pricing_features
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "pricing_features_admin_update" ON public.pricing_features
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "pricing_features_admin_delete" ON public.pricing_features
  FOR DELETE USING (public.is_super_admin());

DROP POLICY IF EXISTS "pricing_plan_features_write_super_admin" ON public.pricing_plan_features;
CREATE POLICY "pricing_plan_features_admin_insert" ON public.pricing_plan_features
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "pricing_plan_features_admin_update" ON public.pricing_plan_features
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "pricing_plan_features_admin_delete" ON public.pricing_plan_features
  FOR DELETE USING (public.is_super_admin());

DROP POLICY IF EXISTS "platform_settings_write_super_admin" ON public.platform_settings;
CREATE POLICY "platform_settings_admin_insert" ON public.platform_settings
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "platform_settings_admin_update" ON public.platform_settings
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "platform_settings_admin_delete" ON public.platform_settings
  FOR DELETE USING (public.is_super_admin());

DROP POLICY IF EXISTS "platform_publicidades_write_super_admin" ON public.platform_publicidades;
CREATE POLICY "platform_publicidades_admin_insert" ON public.platform_publicidades
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "platform_publicidades_admin_update" ON public.platform_publicidades
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "platform_publicidades_admin_delete" ON public.platform_publicidades
  FOR DELETE USING (public.is_super_admin());

DROP POLICY IF EXISTS "platform_comunicaciones_write_super_admin" ON public.platform_comunicaciones;
CREATE POLICY "platform_comunicaciones_admin_insert" ON public.platform_comunicaciones
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "platform_comunicaciones_admin_update" ON public.platform_comunicaciones
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "platform_comunicaciones_admin_delete" ON public.platform_comunicaciones
  FOR DELETE USING (public.is_super_admin());


-- ============================================================
-- PROFILES — fusionar 4 SELECT en 1
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_own"                     ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_guarderia_members"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_seguridad"               ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_marketplace_resenia_autor" ON public.profiles;

CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  USING (
    id = (SELECT auth.uid())
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.memberships m1
      JOIN public.memberships m2 ON m2.guarderia_id = m1.guarderia_id
      WHERE m1.user_id = (SELECT auth.uid())
        AND m1.rol IN ('administrador_general', 'administrativo', 'operario')
        AND m1.status = 'active'
        AND m2.user_id = profiles.id
        AND m2.status = 'active'
    )
    OR public.shares_guarderia_with_seguridad(id)
    OR EXISTS (
      SELECT 1 FROM public.marketplace_resenias r WHERE r.autor_id = profiles.id
    )
  );


-- ============================================================
-- MEMBERSHIPS — fusionar 3 SELECT en 1
-- (is_guarderia_admin es subconjunto de is_guarderia_member → se omite)
-- ============================================================

DROP POLICY IF EXISTS "memberships_select_own"              ON public.memberships;
DROP POLICY IF EXISTS "memberships_select_guarderia_admin"  ON public.memberships;
DROP POLICY IF EXISTS "memberships_select_guarderia_member" ON public.memberships;

CREATE POLICY "memberships_select"
  ON public.memberships FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_super_admin()
    OR public.is_guarderia_member(guarderia_id)
  );


-- ============================================================
-- EMBARCACIONES — fusionar 3 SELECT en 1
-- (también cierra auth_rls_initplan de embarcaciones_select_own)
-- ============================================================

DROP POLICY IF EXISTS "embarcaciones_select_member"   ON public.embarcaciones;
DROP POLICY IF EXISTS "embarcaciones_select_own"      ON public.embarcaciones;
DROP POLICY IF EXISTS "embarcaciones_select_seguridad" ON public.embarcaciones;

CREATE POLICY "embarcaciones_select"
  ON public.embarcaciones FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_guarderia_member(guarderia_id)
    OR profile_id = (SELECT auth.uid())
    OR public.is_guarderia_seguridad(guarderia_id)
  );


-- ============================================================
-- COMUNICACIONES
-- • Eliminar policy legacy "comunicaciones_select" (reemplazada por
--   comunicaciones_select_member desde mig 0012; también cierra
--   el auth_rls_initplan restante de esta tabla).
-- • Fusionar comunicaciones_select_member + comunicaciones_select_cross_club_abierta
--   en una sola policy SELECT.
-- ============================================================

DROP POLICY IF EXISTS "comunicaciones_select"                  ON public.comunicaciones;
DROP POLICY IF EXISTS "comunicaciones_select_member"           ON public.comunicaciones;
DROP POLICY IF EXISTS "comunicaciones_select_cross_club_abierta" ON public.comunicaciones;

CREATE POLICY "comunicaciones_select"
  ON public.comunicaciones FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.is_guarderia_member(guarderia_id)
      AND (
        tipo = 'publica'
        OR (tipo = 'socios' AND public.guarderia_rol(guarderia_id) = 'socio')
      )
    )
    OR (
      tipo = 'publica'
      AND EXISTS (
        SELECT 1 FROM public.guarderias_publicas g
        WHERE g.id = guarderia_id
          AND g.plan IN ('premium', 'elite')
      )
      AND NOT public.is_elite_socio()
    )
  );


-- ============================================================
-- DEVICE_TOKENS — eliminar SELECT redundante
-- (device_tokens_owner_modify FOR ALL ya cubre SELECT)
-- ============================================================

DROP POLICY IF EXISTS "device_tokens_owner_select" ON public.device_tokens;


-- ============================================================
-- ALERTAS — fusionar SELECT (2→1) y UPDATE (2→1)
-- ============================================================

DROP POLICY IF EXISTS "alertas_socio_select" ON public.alertas;
DROP POLICY IF EXISTS "alertas_staff_select" ON public.alertas;
CREATE POLICY "alertas_select"
  ON public.alertas FOR SELECT
  USING (
    socio_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = alertas.guarderia_id
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "alertas_socio_update" ON public.alertas;
DROP POLICY IF EXISTS "alertas_staff_update" ON public.alertas;
CREATE POLICY "alertas_update"
  ON public.alertas FOR UPDATE
  USING (
    socio_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = alertas.guarderia_id
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    socio_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = alertas.guarderia_id
        AND m.status = 'active'
    )
  );


-- ============================================================
-- SOLICITUDES_LAVADO — fusionar SELECT (2→1) y UPDATE (2→1)
-- ============================================================

DROP POLICY IF EXISTS "solicitudes_lavado_socio_select" ON public.solicitudes_lavado;
DROP POLICY IF EXISTS "solicitudes_lavado_staff_select" ON public.solicitudes_lavado;
CREATE POLICY "solicitudes_lavado_select"
  ON public.solicitudes_lavado FOR SELECT
  USING (
    socio_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = solicitudes_lavado.guarderia_id
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "solicitudes_lavado_socio_update" ON public.solicitudes_lavado;
DROP POLICY IF EXISTS "solicitudes_lavado_staff_update" ON public.solicitudes_lavado;
CREATE POLICY "solicitudes_lavado_update"
  ON public.solicitudes_lavado FOR UPDATE
  USING (
    socio_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = solicitudes_lavado.guarderia_id
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    socio_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = solicitudes_lavado.guarderia_id
        AND m.status = 'active'
    )
  );


-- ============================================================
-- INVITADOS — fusionar SELECT (2→1)
-- ============================================================

DROP POLICY IF EXISTS "invitados_select_own"       ON public.invitados;
DROP POLICY IF EXISTS "invitados_select_seguridad" ON public.invitados;
CREATE POLICY "invitados_select"
  ON public.invitados FOR SELECT
  USING (
    socio_id = (SELECT auth.uid())
    OR public.is_guarderia_seguridad(guarderia_id)
  );


-- ============================================================
-- PORTERIA — fusionar SELECT (3→1) y UPDATE (2→1)
-- ============================================================

DROP POLICY IF EXISTS "porteria_select_own"       ON public.porteria;
DROP POLICY IF EXISTS "porteria_select_member"    ON public.porteria;
DROP POLICY IF EXISTS "porteria_select_seguridad" ON public.porteria;
CREATE POLICY "porteria_select"
  ON public.porteria FOR SELECT
  USING (
    socio_id = (SELECT auth.uid())
    OR public.is_super_admin()
    OR public.is_guarderia_member(guarderia_id)
    OR public.is_guarderia_seguridad(guarderia_id)
  );

DROP POLICY IF EXISTS "porteria_update_own"       ON public.porteria;
DROP POLICY IF EXISTS "porteria_update_seguridad" ON public.porteria;
CREATE POLICY "porteria_update"
  ON public.porteria FOR UPDATE
  USING (
    socio_id = (SELECT auth.uid())
    OR public.is_guarderia_seguridad(guarderia_id)
  )
  WITH CHECK (
    socio_id = (SELECT auth.uid())
    OR public.is_guarderia_seguridad(guarderia_id)
  );


-- ============================================================
-- PORTERIA_INVITADOS — fusionar SELECT (2→1) y UPDATE (2→1)
-- ============================================================

DROP POLICY IF EXISTS "porteria_invitados_select_own"       ON public.porteria_invitados;
DROP POLICY IF EXISTS "porteria_invitados_select_seguridad" ON public.porteria_invitados;
CREATE POLICY "porteria_invitados_select"
  ON public.porteria_invitados FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.porteria p
      WHERE p.id = porteria_invitados.porteria_id
        AND p.socio_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.porteria p
      WHERE p.id = porteria_invitados.porteria_id
        AND public.is_guarderia_seguridad(p.guarderia_id)
    )
  );

DROP POLICY IF EXISTS "porteria_invitados_update_own"       ON public.porteria_invitados;
DROP POLICY IF EXISTS "porteria_invitados_update_seguridad" ON public.porteria_invitados;
CREATE POLICY "porteria_invitados_update"
  ON public.porteria_invitados FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.porteria p
      WHERE p.id = porteria_invitados.porteria_id
        AND p.socio_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.porteria p
      WHERE p.id = porteria_invitados.porteria_id
        AND public.is_guarderia_seguridad(p.guarderia_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.porteria p
      WHERE p.id = porteria_invitados.porteria_id
        AND p.socio_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.porteria p
      WHERE p.id = porteria_invitados.porteria_id
        AND public.is_guarderia_seguridad(p.guarderia_id)
    )
  );


-- ============================================================
-- TAREAS — fusionar INSERT (2→1)
-- ============================================================

DROP POLICY IF EXISTS "tareas_insert_admin"    ON public.tareas;
DROP POLICY IF EXISTS "tareas_insert_seguridad" ON public.tareas;
CREATE POLICY "tareas_insert"
  ON public.tareas FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.is_guarderia_admin(guarderia_id)
    OR public.is_guarderia_seguridad(guarderia_id)
  );


-- ============================================================
-- PUBLICACIONES — Fix A: admin_all FOR ALL → INSERT + UPDATE + DELETE
-- (publicaciones_read_publicadas queda como única SELECT)
-- ============================================================

DROP POLICY IF EXISTS "publicaciones_admin_all" ON public.publicaciones;
CREATE POLICY "publicaciones_admin_insert"
  ON public.publicaciones FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id      = (SELECT auth.uid())
        AND m.guarderia_id = publicaciones.guarderia_id
        AND m.rol IN ('administrador_general', 'administrativo')
        AND m.status = 'active'
    )
    OR public.is_super_admin()
  );
CREATE POLICY "publicaciones_admin_update"
  ON public.publicaciones FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id      = (SELECT auth.uid())
        AND m.guarderia_id = publicaciones.guarderia_id
        AND m.rol IN ('administrador_general', 'administrativo')
        AND m.status = 'active'
    )
    OR public.is_super_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id      = (SELECT auth.uid())
        AND m.guarderia_id = publicaciones.guarderia_id
        AND m.rol IN ('administrador_general', 'administrativo')
        AND m.status = 'active'
    )
    OR public.is_super_admin()
  );
CREATE POLICY "publicaciones_admin_delete"
  ON public.publicaciones FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id      = (SELECT auth.uid())
        AND m.guarderia_id = publicaciones.guarderia_id
        AND m.rol IN ('administrador_general', 'administrativo')
        AND m.status = 'active'
    )
    OR public.is_super_admin()
  );


-- ============================================================
-- 0088 TABLES — Fix A: _admin_write FOR ALL → INSERT + UPDATE + DELETE
-- Patrón estándar (guarderia_id directo)
-- ============================================================

-- areas
DROP POLICY IF EXISTS "areas_admin_write" ON public.areas;
CREATE POLICY "areas_admin_insert" ON public.areas FOR INSERT WITH CHECK (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "areas_admin_update" ON public.areas FOR UPDATE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "areas_admin_delete" ON public.areas FOR DELETE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));

-- naves
DROP POLICY IF EXISTS "naves_admin_write" ON public.naves;
CREATE POLICY "naves_admin_insert" ON public.naves FOR INSERT WITH CHECK (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "naves_admin_update" ON public.naves FOR UPDATE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "naves_admin_delete" ON public.naves FOR DELETE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));

-- marinas
DROP POLICY IF EXISTS "marinas_admin_write" ON public.marinas;
CREATE POLICY "marinas_admin_insert" ON public.marinas FOR INSERT WITH CHECK (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "marinas_admin_update" ON public.marinas FOR UPDATE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "marinas_admin_delete" ON public.marinas FOR DELETE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));

-- lados
DROP POLICY IF EXISTS "lados_admin_write" ON public.lados;
CREATE POLICY "lados_admin_insert" ON public.lados FOR INSERT WITH CHECK (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "lados_admin_update" ON public.lados FOR UPDATE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "lados_admin_delete" ON public.lados FOR DELETE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));

-- horarios_dia
DROP POLICY IF EXISTS "horarios_dia_admin_write" ON public.horarios_dia;
CREATE POLICY "horarios_dia_admin_insert" ON public.horarios_dia FOR INSERT WITH CHECK (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "horarios_dia_admin_update" ON public.horarios_dia FOR UPDATE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "horarios_dia_admin_delete" ON public.horarios_dia FOR DELETE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));

-- servicios
DROP POLICY IF EXISTS "servicios_admin_write" ON public.servicios;
CREATE POLICY "servicios_admin_insert" ON public.servicios FOR INSERT WITH CHECK (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "servicios_admin_update" ON public.servicios FOR UPDATE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "servicios_admin_delete" ON public.servicios FOR DELETE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));

-- tarifas
DROP POLICY IF EXISTS "tarifas_admin_write" ON public.tarifas;
CREATE POLICY "tarifas_admin_insert" ON public.tarifas FOR INSERT WITH CHECK (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "tarifas_admin_update" ON public.tarifas FOR UPDATE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "tarifas_admin_delete" ON public.tarifas FOR DELETE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));

-- categorias_amarras
DROP POLICY IF EXISTS "categorias_amarras_admin_write" ON public.categorias_amarras;
CREATE POLICY "categorias_amarras_admin_insert" ON public.categorias_amarras FOR INSERT WITH CHECK (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "categorias_amarras_admin_update" ON public.categorias_amarras FOR UPDATE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "categorias_amarras_admin_delete" ON public.categorias_amarras FOR DELETE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));

-- espacios
DROP POLICY IF EXISTS "espacios_admin_write" ON public.espacios;
CREATE POLICY "espacios_admin_insert" ON public.espacios FOR INSERT WITH CHECK (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "espacios_admin_update" ON public.espacios FOR UPDATE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "espacios_admin_delete" ON public.espacios FOR DELETE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));

-- proveedores
DROP POLICY IF EXISTS "proveedores_admin_write" ON public.proveedores;
CREATE POLICY "proveedores_admin_insert" ON public.proveedores FOR INSERT WITH CHECK (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "proveedores_admin_update" ON public.proveedores FOR UPDATE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "proveedores_admin_delete" ON public.proveedores FOR DELETE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));

-- restaurantes
DROP POLICY IF EXISTS "restaurantes_admin_write" ON public.restaurantes;
CREATE POLICY "restaurantes_admin_insert" ON public.restaurantes FOR INSERT WITH CHECK (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "restaurantes_admin_update" ON public.restaurantes FOR UPDATE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));
CREATE POLICY "restaurantes_admin_delete" ON public.restaurantes FOR DELETE USING (guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable')));


-- ============================================================
-- 0088 TABLES — pisos (via area_id → guarderia_id)
-- ============================================================

DROP POLICY IF EXISTS "pisos_admin_write" ON public.pisos;
CREATE POLICY "pisos_admin_insert" ON public.pisos
  FOR INSERT WITH CHECK (
    area_id IN (
      SELECT id FROM public.areas WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );
CREATE POLICY "pisos_admin_update" ON public.pisos
  FOR UPDATE USING (
    area_id IN (
      SELECT id FROM public.areas WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );
CREATE POLICY "pisos_admin_delete" ON public.pisos
  FOR DELETE USING (
    area_id IN (
      SELECT id FROM public.areas WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );


-- ============================================================
-- 0088 TABLES — restaurante sub-tablas (via restaurante_id)
-- ============================================================

-- platos
DROP POLICY IF EXISTS "platos_admin_write" ON public.platos;
CREATE POLICY "platos_admin_insert" ON public.platos FOR INSERT WITH CHECK (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));
CREATE POLICY "platos_admin_update" ON public.platos FOR UPDATE USING (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));
CREATE POLICY "platos_admin_delete" ON public.platos FOR DELETE USING (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));

-- ordenes
DROP POLICY IF EXISTS "ordenes_admin_write" ON public.ordenes;
CREATE POLICY "ordenes_admin_insert" ON public.ordenes FOR INSERT WITH CHECK (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));
CREATE POLICY "ordenes_admin_update" ON public.ordenes FOR UPDATE USING (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));
CREATE POLICY "ordenes_admin_delete" ON public.ordenes FOR DELETE USING (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));

-- pagos
DROP POLICY IF EXISTS "pagos_admin_write" ON public.pagos;
CREATE POLICY "pagos_admin_insert" ON public.pagos FOR INSERT WITH CHECK (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));
CREATE POLICY "pagos_admin_update" ON public.pagos FOR UPDATE USING (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));
CREATE POLICY "pagos_admin_delete" ON public.pagos FOR DELETE USING (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));

-- reservas
DROP POLICY IF EXISTS "reservas_admin_write" ON public.reservas;
CREATE POLICY "reservas_admin_insert" ON public.reservas FOR INSERT WITH CHECK (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));
CREATE POLICY "reservas_admin_update" ON public.reservas FOR UPDATE USING (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));
CREATE POLICY "reservas_admin_delete" ON public.reservas FOR DELETE USING (restaurante_id IN (SELECT id FROM public.restaurantes WHERE guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()) AND rol IN ('administrador_general', 'administrativo', 'contable'))));

-- items_orden (via orden_id → restaurante_id)
DROP POLICY IF EXISTS "items_orden_admin_write" ON public.items_orden;
CREATE POLICY "items_orden_admin_insert" ON public.items_orden
  FOR INSERT WITH CHECK (
    orden_id IN (
      SELECT o.id FROM public.ordenes o
      JOIN public.restaurantes r ON r.id = o.restaurante_id
      WHERE r.guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );
CREATE POLICY "items_orden_admin_update" ON public.items_orden
  FOR UPDATE USING (
    orden_id IN (
      SELECT o.id FROM public.ordenes o
      JOIN public.restaurantes r ON r.id = o.restaurante_id
      WHERE r.guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );
CREATE POLICY "items_orden_admin_delete" ON public.items_orden
  FOR DELETE USING (
    orden_id IN (
      SELECT o.id FROM public.ordenes o
      JOIN public.restaurantes r ON r.id = o.restaurante_id
      WHERE r.guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );


-- ============================================================
-- NOTA: espacios sigue teniendo dos SELECT policies
-- (espacios_member_select + espacios_select_publico_disponibles).
-- Para fusionarlas hace falta la definición de
-- espacios_select_publico_disponibles. Pendiente si el linter
-- la sigue reportando después de correr esta migración.
-- ============================================================
