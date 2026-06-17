-- =============================================================================
-- Migration 0091: Corregir auth_rls_initplan en todas las policies con auth.uid()
--
-- Contexto: cuando auth.uid() aparece directamente en la cláusula USING/WITH CHECK
-- de una policy, Postgres lo re-evalúa para cada fila en lugar de evaluarlo una
-- sola vez por consulta (initplan). La solución es envolverlo en un subquery:
--   auth.uid()  →  (select auth.uid())
--
-- Impacto: puramente de performance — ningún cambio semántico. Mobile y web
-- no se ven afectados (la lógica de acceso es idéntica).
--
-- Nota: las policies que solo llaman funciones helper SECURITY DEFINER
-- (is_super_admin, is_guarderia_admin, etc.) NO necesitan fix porque auth.uid()
-- vive dentro del cuerpo de esas funciones, no en la cláusula de la policy.
-- =============================================================================


-- ============================================================
-- profiles
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = (SELECT auth.uid()) OR public.is_super_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND is_super_admin = public.is_super_admin()
  );

-- Versión 0022: administrativo y operario también pueden ver perfiles de miembros
DROP POLICY IF EXISTS "profiles_select_guarderia_members" ON public.profiles;
CREATE POLICY "profiles_select_guarderia_members"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships m1
      JOIN public.memberships m2 ON m2.guarderia_id = m1.guarderia_id
      WHERE m1.user_id = (SELECT auth.uid())
        AND m1.rol IN ('administrador_general', 'administrativo', 'operario')
        AND m1.status = 'active'
        AND m2.user_id = profiles.id
        AND m2.status = 'active'
    )
  );


-- ============================================================
-- memberships
-- ============================================================

DROP POLICY IF EXISTS "memberships_select_own" ON public.memberships;
CREATE POLICY "memberships_select_own"
  ON public.memberships FOR SELECT
  USING (user_id = (SELECT auth.uid()));


-- ============================================================
-- porteria_invitados
-- ============================================================

DROP POLICY IF EXISTS "porteria_invitados_select_own" ON public.porteria_invitados;
CREATE POLICY "porteria_invitados_select_own"
  ON public.porteria_invitados FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.porteria p
      WHERE p.id = porteria_invitados.porteria_id
        AND p.socio_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "porteria_invitados_insert_own" ON public.porteria_invitados;
CREATE POLICY "porteria_invitados_insert_own"
  ON public.porteria_invitados FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.porteria p
      WHERE p.id = porteria_invitados.porteria_id
        AND p.socio_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "porteria_invitados_update_own" ON public.porteria_invitados;
CREATE POLICY "porteria_invitados_update_own"
  ON public.porteria_invitados FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.porteria p
      WHERE p.id = porteria_invitados.porteria_id
        AND p.socio_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.porteria p
      WHERE p.id = porteria_invitados.porteria_id
        AND p.socio_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "porteria_invitados_delete_own" ON public.porteria_invitados;
CREATE POLICY "porteria_invitados_delete_own"
  ON public.porteria_invitados FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.porteria p
      WHERE p.id = porteria_invitados.porteria_id
        AND p.socio_id = (SELECT auth.uid())
    )
  );


-- ============================================================
-- tareas
-- ============================================================

DROP POLICY IF EXISTS "tareas_update_admin_or_operario" ON public.tareas;
CREATE POLICY "tareas_update_admin_or_operario"
  ON public.tareas FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_guarderia_admin(guarderia_id)
    OR (
      public.is_guarderia_member(guarderia_id)
      AND (operario_id = (SELECT auth.uid()) OR operario_id IS NULL)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_guarderia_admin(guarderia_id)
    OR (
      public.is_guarderia_member(guarderia_id)
      AND operario_id = (SELECT auth.uid())
    )
  );


-- ============================================================
-- device_tokens
-- ============================================================

DROP POLICY IF EXISTS "device_tokens_owner_select" ON public.device_tokens;
CREATE POLICY "device_tokens_owner_select"
  ON public.device_tokens FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_super_admin());

DROP POLICY IF EXISTS "device_tokens_owner_modify" ON public.device_tokens;
CREATE POLICY "device_tokens_owner_modify"
  ON public.device_tokens FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_super_admin())
  WITH CHECK ((SELECT auth.uid()) = user_id OR public.is_super_admin());


-- ============================================================
-- solicitudes_membership
-- ============================================================

DROP POLICY IF EXISTS "solicitudes_membership_select" ON public.solicitudes_membership;
CREATE POLICY "solicitudes_membership_select"
  ON public.solicitudes_membership FOR SELECT TO authenticated
  USING (
    solicitante_id = (SELECT auth.uid())
    OR public.is_guarderia_admin(guarderia_id)
  );

DROP POLICY IF EXISTS "solicitudes_membership_insert" ON public.solicitudes_membership;
CREATE POLICY "solicitudes_membership_insert"
  ON public.solicitudes_membership FOR INSERT TO authenticated
  WITH CHECK (
    solicitante_id = (SELECT auth.uid())
    AND estado = 'pendiente'
  );


-- ============================================================
-- terminos_aceptaciones
-- ============================================================

DROP POLICY IF EXISTS "terminos_aceptaciones_select" ON public.terminos_aceptaciones;
CREATE POLICY "terminos_aceptaciones_select"
  ON public.terminos_aceptaciones FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "terminos_aceptaciones_insert" ON public.terminos_aceptaciones;
CREATE POLICY "terminos_aceptaciones_insert"
  ON public.terminos_aceptaciones FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ============================================================
-- publicaciones
-- ============================================================

DROP POLICY IF EXISTS "publicaciones_admin_all" ON public.publicaciones;
CREATE POLICY "publicaciones_admin_all"
  ON public.publicaciones FOR ALL
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


-- ============================================================
-- platform_comunicaciones
-- ============================================================

DROP POLICY IF EXISTS "platform_comunicaciones_select_authenticated"
  ON public.platform_comunicaciones;
CREATE POLICY "platform_comunicaciones_select_authenticated"
  ON public.platform_comunicaciones FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR tipo = 'publica'
    OR (
      tipo = 'socios'
      AND EXISTS (
        SELECT 1
        FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
          AND rol = 'socio'
          AND status = 'active'
      )
    )
  );


-- ============================================================
-- payway_tokens
-- ============================================================

DROP POLICY IF EXISTS "payway_tokens_admin_select" ON public.payway_tokens;
CREATE POLICY "payway_tokens_admin_select"
  ON public.payway_tokens FOR SELECT
  USING (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT m.guarderia_id FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.rol IN ('administrador_general', 'administrativo', 'contable')
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "payway_tokens_admin_insert" ON public.payway_tokens;
CREATE POLICY "payway_tokens_admin_insert"
  ON public.payway_tokens FOR INSERT
  WITH CHECK (
    guarderia_id IN (
      SELECT m.guarderia_id FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.rol IN ('administrador_general', 'administrativo', 'contable')
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "payway_tokens_admin_update" ON public.payway_tokens;
CREATE POLICY "payway_tokens_admin_update"
  ON public.payway_tokens FOR UPDATE
  USING (
    guarderia_id IN (
      SELECT m.guarderia_id FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.rol IN ('administrador_general', 'administrativo', 'contable')
        AND m.status = 'active'
    )
  );


-- ============================================================
-- payway_cobros
-- ============================================================

DROP POLICY IF EXISTS "payway_cobros_admin_select" ON public.payway_cobros;
CREATE POLICY "payway_cobros_admin_select"
  ON public.payway_cobros FOR SELECT
  USING (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT m.guarderia_id FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.rol IN ('administrador_general', 'administrativo', 'contable')
        AND m.status = 'active'
    )
  );


-- ============================================================
-- embarcaciones
-- ============================================================

DROP POLICY IF EXISTS "embarcaciones_insert_own" ON public.embarcaciones;
CREATE POLICY "embarcaciones_insert_own"
  ON public.embarcaciones FOR INSERT TO authenticated
  WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "embarcaciones_update_own" ON public.embarcaciones;
CREATE POLICY "embarcaciones_update_own"
  ON public.embarcaciones FOR UPDATE TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "embarcaciones_delete_own" ON public.embarcaciones;
CREATE POLICY "embarcaciones_delete_own"
  ON public.embarcaciones FOR DELETE TO authenticated
  USING (profile_id = (SELECT auth.uid()));


-- ============================================================
-- socio_servicios_cancelados
-- ============================================================

DROP POLICY IF EXISTS "admin can manage cancelaciones"
  ON public.socio_servicios_cancelados;
CREATE POLICY "admin can manage cancelaciones"
  ON public.socio_servicios_cancelados FOR ALL
  USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- espacios  (0088)
-- ============================================================

DROP POLICY IF EXISTS "espacios_member_select" ON public.espacios;
CREATE POLICY "espacios_member_select" ON public.espacios
  FOR SELECT USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "espacios_admin_write" ON public.espacios;
CREATE POLICY "espacios_admin_write" ON public.espacios
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- datos_facturacion  (0088)
-- ============================================================

DROP POLICY IF EXISTS "datos_facturacion_owner" ON public.datos_facturacion;
CREATE POLICY "datos_facturacion_owner" ON public.datos_facturacion
  FOR ALL USING (
    profile_id = (SELECT auth.uid()) OR public.is_super_admin()
  );


-- ============================================================
-- movimientos_cuenta_corriente  (0088)
-- ============================================================

DROP POLICY IF EXISTS "movimientos_select" ON public.movimientos_cuenta_corriente;
CREATE POLICY "movimientos_select" ON public.movimientos_cuenta_corriente
  FOR SELECT USING (
    socio_id = (SELECT auth.uid())
    OR
    socio_id IN (
      SELECT m2.user_id
      FROM public.memberships m1
      JOIN public.memberships m2 USING (guarderia_id)
      WHERE m1.user_id = (SELECT auth.uid())
        AND m1.rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

DROP POLICY IF EXISTS "movimientos_admin_insert" ON public.movimientos_cuenta_corriente;
CREATE POLICY "movimientos_admin_insert" ON public.movimientos_cuenta_corriente
  FOR INSERT WITH CHECK (
    socio_id IN (
      SELECT m2.user_id
      FROM public.memberships m1
      JOIN public.memberships m2 USING (guarderia_id)
      WHERE m1.user_id = (SELECT auth.uid())
        AND m1.rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

DROP POLICY IF EXISTS "movimientos_admin_update" ON public.movimientos_cuenta_corriente;
CREATE POLICY "movimientos_admin_update" ON public.movimientos_cuenta_corriente
  FOR UPDATE USING (
    socio_id IN (
      SELECT m2.user_id
      FROM public.memberships m1
      JOIN public.memberships m2 USING (guarderia_id)
      WHERE m1.user_id = (SELECT auth.uid())
        AND m1.rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

DROP POLICY IF EXISTS "movimientos_admin_delete" ON public.movimientos_cuenta_corriente;
CREATE POLICY "movimientos_admin_delete" ON public.movimientos_cuenta_corriente
  FOR DELETE USING (
    socio_id IN (
      SELECT m2.user_id
      FROM public.memberships m1
      JOIN public.memberships m2 USING (guarderia_id)
      WHERE m1.user_id = (SELECT auth.uid())
        AND m1.rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- actividad_porteria  (0088)
-- ============================================================

DROP POLICY IF EXISTS "actividad_porteria_member_select" ON public.actividad_porteria;
CREATE POLICY "actividad_porteria_member_select" ON public.actividad_porteria
  FOR SELECT USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "actividad_porteria_member_insert" ON public.actividad_porteria;
CREATE POLICY "actividad_porteria_member_insert" ON public.actividad_porteria
  FOR INSERT WITH CHECK (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "actividad_porteria_admin_update" ON public.actividad_porteria;
CREATE POLICY "actividad_porteria_admin_update" ON public.actividad_porteria
  FOR UPDATE USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

DROP POLICY IF EXISTS "actividad_porteria_admin_delete" ON public.actividad_porteria;
CREATE POLICY "actividad_porteria_admin_delete" ON public.actividad_porteria
  FOR DELETE USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- areas, naves, marinas, lados  (0088)
-- ============================================================

DROP POLICY IF EXISTS "areas_member_select" ON public.areas;
CREATE POLICY "areas_member_select" ON public.areas
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "areas_admin_write" ON public.areas;
CREATE POLICY "areas_admin_write" ON public.areas
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

DROP POLICY IF EXISTS "naves_member_select" ON public.naves;
CREATE POLICY "naves_member_select" ON public.naves
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "naves_admin_write" ON public.naves;
CREATE POLICY "naves_admin_write" ON public.naves
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

DROP POLICY IF EXISTS "marinas_member_select" ON public.marinas;
CREATE POLICY "marinas_member_select" ON public.marinas
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "marinas_admin_write" ON public.marinas;
CREATE POLICY "marinas_admin_write" ON public.marinas
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

DROP POLICY IF EXISTS "lados_member_select" ON public.lados;
CREATE POLICY "lados_member_select" ON public.lados
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "lados_admin_write" ON public.lados;
CREATE POLICY "lados_admin_write" ON public.lados
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- pisos  (0088)
-- ============================================================

DROP POLICY IF EXISTS "pisos_member_select" ON public.pisos;
CREATE POLICY "pisos_member_select" ON public.pisos
  FOR SELECT USING (
    area_id IN (
      SELECT id FROM public.areas WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "pisos_admin_write" ON public.pisos;
CREATE POLICY "pisos_admin_write" ON public.pisos
  FOR ALL USING (
    area_id IN (
      SELECT id FROM public.areas WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );


-- ============================================================
-- horarios_dia  (0088)
-- ============================================================

DROP POLICY IF EXISTS "horarios_dia_member_select" ON public.horarios_dia;
CREATE POLICY "horarios_dia_member_select" ON public.horarios_dia
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "horarios_dia_admin_write" ON public.horarios_dia;
CREATE POLICY "horarios_dia_admin_write" ON public.horarios_dia
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- servicios, tarifas, categorias_amarras  (0088)
-- ============================================================

DROP POLICY IF EXISTS "servicios_member_select" ON public.servicios;
CREATE POLICY "servicios_member_select" ON public.servicios
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "servicios_admin_write" ON public.servicios;
CREATE POLICY "servicios_admin_write" ON public.servicios
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

DROP POLICY IF EXISTS "tarifas_member_select" ON public.tarifas;
CREATE POLICY "tarifas_member_select" ON public.tarifas
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "tarifas_admin_write" ON public.tarifas;
CREATE POLICY "tarifas_admin_write" ON public.tarifas
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

DROP POLICY IF EXISTS "categorias_amarras_member_select" ON public.categorias_amarras;
CREATE POLICY "categorias_amarras_member_select" ON public.categorias_amarras
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "categorias_amarras_admin_write" ON public.categorias_amarras;
CREATE POLICY "categorias_amarras_admin_write" ON public.categorias_amarras
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- facturacion, facturacion_items, facturacion_item_movimientos  (0088)
-- ============================================================

DROP POLICY IF EXISTS "facturacion_admin_all" ON public.facturacion;
CREATE POLICY "facturacion_admin_all" ON public.facturacion
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

DROP POLICY IF EXISTS "facturacion_items_admin_all" ON public.facturacion_items;
CREATE POLICY "facturacion_items_admin_all" ON public.facturacion_items
  FOR ALL USING (
    facturacion_id IN (
      SELECT id FROM public.facturacion WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );

DROP POLICY IF EXISTS "facturacion_item_movimientos_admin_all"
  ON public.facturacion_item_movimientos;
CREATE POLICY "facturacion_item_movimientos_admin_all"
  ON public.facturacion_item_movimientos FOR ALL USING (
    facturacion_item_id IN (
      SELECT fi.id FROM public.facturacion_items fi
      JOIN public.facturacion f ON f.id = fi.facturacion_id
      WHERE f.guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );


-- ============================================================
-- proveedores  (0088)
-- ============================================================

DROP POLICY IF EXISTS "proveedores_member_select" ON public.proveedores;
CREATE POLICY "proveedores_member_select" ON public.proveedores
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "proveedores_admin_write" ON public.proveedores;
CREATE POLICY "proveedores_admin_write" ON public.proveedores
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- restaurantes, platos, ordenes, items_orden, pagos, reservas  (0088)
-- ============================================================

DROP POLICY IF EXISTS "restaurantes_member_select" ON public.restaurantes;
CREATE POLICY "restaurantes_member_select" ON public.restaurantes
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "restaurantes_admin_write" ON public.restaurantes;
CREATE POLICY "restaurantes_admin_write" ON public.restaurantes
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

DROP POLICY IF EXISTS "platos_member_select" ON public.platos;
CREATE POLICY "platos_member_select" ON public.platos
  FOR SELECT USING (
    restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid())
      )
    )
  );
DROP POLICY IF EXISTS "platos_admin_write" ON public.platos;
CREATE POLICY "platos_admin_write" ON public.platos
  FOR ALL USING (
    restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );

DROP POLICY IF EXISTS "ordenes_member_select" ON public.ordenes;
CREATE POLICY "ordenes_member_select" ON public.ordenes
  FOR SELECT USING (
    restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid())
      )
    )
  );
DROP POLICY IF EXISTS "ordenes_admin_write" ON public.ordenes;
CREATE POLICY "ordenes_admin_write" ON public.ordenes
  FOR ALL USING (
    restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );

DROP POLICY IF EXISTS "items_orden_member_select" ON public.items_orden;
CREATE POLICY "items_orden_member_select" ON public.items_orden
  FOR SELECT USING (
    orden_id IN (
      SELECT o.id FROM public.ordenes o
      JOIN public.restaurantes r ON r.id = o.restaurante_id
      WHERE r.guarderia_id IN (
        SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid())
      )
    )
  );
DROP POLICY IF EXISTS "items_orden_admin_write" ON public.items_orden;
CREATE POLICY "items_orden_admin_write" ON public.items_orden
  FOR ALL USING (
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

DROP POLICY IF EXISTS "pagos_member_select" ON public.pagos;
CREATE POLICY "pagos_member_select" ON public.pagos
  FOR SELECT USING (
    restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid())
      )
    )
  );
DROP POLICY IF EXISTS "pagos_admin_write" ON public.pagos;
CREATE POLICY "pagos_admin_write" ON public.pagos
  FOR ALL USING (
    restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );

DROP POLICY IF EXISTS "reservas_member_select" ON public.reservas;
CREATE POLICY "reservas_member_select" ON public.reservas
  FOR SELECT USING (
    restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid())
      )
    )
  );
DROP POLICY IF EXISTS "reservas_admin_write" ON public.reservas;
CREATE POLICY "reservas_admin_write" ON public.reservas
  FOR ALL USING (
    restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM public.memberships
        WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );


-- ============================================================
-- ADVERTENCIA — policies NOT en git (creadas en Supabase Dashboard):
-- Las siguientes tablas tienen policies con auth.uid() pero sus definiciones
-- no están en las migraciones. Ejecutar la siguiente query en el SQL Editor
-- para obtener sus definiciones actuales y fijarlas manualmente:
--
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'invitados', 'porteria', 'documentos', 'alertas',
--     'solicitudes_lavado', 'marketplace_servicios',
--     'marketplace_propiedades', 'marketplace_embarcaciones',
--     'marketplace_resenias', 'lista_compras_items',
--     'notificaciones', 'entradas_socio'
--   )
-- ORDER BY tablename, policyname;
-- ============================================================
