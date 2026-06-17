-- =============================================================================
-- Migration 0092: Corregir auth_rls_initplan en policies creadas desde el
-- Supabase Dashboard (no estaban en git — definiciones obtenidas vía pg_policies).
--
-- Mismo fix que 0091: auth.uid() → (select auth.uid())
-- Impacto: puramente de performance, ningún cambio semántico.
-- =============================================================================


-- ============================================================
-- alertas
-- ============================================================

DROP POLICY IF EXISTS "alertas_socio_select" ON public.alertas;
CREATE POLICY "alertas_socio_select"
  ON public.alertas FOR SELECT
  USING (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "alertas_socio_update" ON public.alertas;
CREATE POLICY "alertas_socio_update"
  ON public.alertas FOR UPDATE
  USING (socio_id = (SELECT auth.uid()))
  WITH CHECK (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "alertas_staff_select" ON public.alertas;
CREATE POLICY "alertas_staff_select"
  ON public.alertas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = alertas.guarderia_id
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "alertas_staff_update" ON public.alertas;
CREATE POLICY "alertas_staff_update"
  ON public.alertas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = alertas.guarderia_id
        AND m.status = 'active'
    )
  );


-- ============================================================
-- documentos
-- ============================================================

DROP POLICY IF EXISTS "documentos_select_own" ON public.documentos;
CREATE POLICY "documentos_select_own"
  ON public.documentos FOR SELECT
  USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "documentos_insert_own" ON public.documentos;
CREATE POLICY "documentos_insert_own"
  ON public.documentos FOR INSERT
  WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "documentos_update_own" ON public.documentos;
CREATE POLICY "documentos_update_own"
  ON public.documentos FOR UPDATE
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "documentos_delete_own" ON public.documentos;
CREATE POLICY "documentos_delete_own"
  ON public.documentos FOR DELETE
  USING (profile_id = (SELECT auth.uid()));


-- ============================================================
-- entradas_socio
-- ============================================================

DROP POLICY IF EXISTS "member_select_entradas_socio" ON public.entradas_socio;
CREATE POLICY "member_select_entradas_socio"
  ON public.entradas_socio FOR SELECT
  USING (
    membership_id IN (
      SELECT id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = entradas_socio.guarderia_id
        AND m.rol = 'seguridad'
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "seguridad_insert_entradas_socio" ON public.entradas_socio;
CREATE POLICY "seguridad_insert_entradas_socio"
  ON public.entradas_socio FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = entradas_socio.guarderia_id
        AND m.rol = 'seguridad'
        AND m.status = 'active'
    )
  );


-- ============================================================
-- invitados
-- (invitados_select_seguridad usa is_guarderia_seguridad() — no toca auth.uid() directamente, se omite)
-- ============================================================

DROP POLICY IF EXISTS "invitados_select_own" ON public.invitados;
CREATE POLICY "invitados_select_own"
  ON public.invitados FOR SELECT
  USING (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "invitados_insert_own" ON public.invitados;
CREATE POLICY "invitados_insert_own"
  ON public.invitados FOR INSERT
  WITH CHECK (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "invitados_update_own" ON public.invitados;
CREATE POLICY "invitados_update_own"
  ON public.invitados FOR UPDATE
  USING (socio_id = (SELECT auth.uid()))
  WITH CHECK (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "invitados_delete_own" ON public.invitados;
CREATE POLICY "invitados_delete_own"
  ON public.invitados FOR DELETE
  USING (socio_id = (SELECT auth.uid()));


-- ============================================================
-- lista_compras_items
-- ============================================================

DROP POLICY IF EXISTS "lista_compras_select_own" ON public.lista_compras_items;
CREATE POLICY "lista_compras_select_own"
  ON public.lista_compras_items FOR SELECT
  USING (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "lista_compras_insert_own" ON public.lista_compras_items;
CREATE POLICY "lista_compras_insert_own"
  ON public.lista_compras_items FOR INSERT
  WITH CHECK (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "lista_compras_update_own" ON public.lista_compras_items;
CREATE POLICY "lista_compras_update_own"
  ON public.lista_compras_items FOR UPDATE
  USING (socio_id = (SELECT auth.uid()))
  WITH CHECK (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "lista_compras_delete_own" ON public.lista_compras_items;
CREATE POLICY "lista_compras_delete_own"
  ON public.lista_compras_items FOR DELETE
  USING (socio_id = (SELECT auth.uid()));


-- ============================================================
-- marketplace_servicios
-- (marketplace_servicios_select_authenticated usa USING true — se omite)
-- ============================================================

DROP POLICY IF EXISTS "marketplace_servicios_insert_owner" ON public.marketplace_servicios;
CREATE POLICY "marketplace_servicios_insert_owner"
  ON public.marketplace_servicios FOR INSERT
  WITH CHECK (comerciante_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "marketplace_servicios_update_owner" ON public.marketplace_servicios;
CREATE POLICY "marketplace_servicios_update_owner"
  ON public.marketplace_servicios FOR UPDATE
  USING (comerciante_id = (SELECT auth.uid()))
  WITH CHECK (comerciante_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "marketplace_servicios_delete_owner" ON public.marketplace_servicios;
CREATE POLICY "marketplace_servicios_delete_owner"
  ON public.marketplace_servicios FOR DELETE
  USING (comerciante_id = (SELECT auth.uid()));


-- ============================================================
-- marketplace_propiedades
-- (marketplace_propiedades_select_all usa USING true — se omite)
-- ============================================================

DROP POLICY IF EXISTS "marketplace_propiedades_insert_own" ON public.marketplace_propiedades;
CREATE POLICY "marketplace_propiedades_insert_own"
  ON public.marketplace_propiedades FOR INSERT
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "marketplace_propiedades_update_own" ON public.marketplace_propiedades;
CREATE POLICY "marketplace_propiedades_update_own"
  ON public.marketplace_propiedades FOR UPDATE
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "marketplace_propiedades_delete_own" ON public.marketplace_propiedades;
CREATE POLICY "marketplace_propiedades_delete_own"
  ON public.marketplace_propiedades FOR DELETE
  USING (owner_id = (SELECT auth.uid()));


-- ============================================================
-- marketplace_embarcaciones
-- (marketplace_embarcaciones_select_all usa USING true — se omite)
-- ============================================================

DROP POLICY IF EXISTS "marketplace_embarcaciones_insert_own" ON public.marketplace_embarcaciones;
CREATE POLICY "marketplace_embarcaciones_insert_own"
  ON public.marketplace_embarcaciones FOR INSERT
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "marketplace_embarcaciones_update_own" ON public.marketplace_embarcaciones;
CREATE POLICY "marketplace_embarcaciones_update_own"
  ON public.marketplace_embarcaciones FOR UPDATE
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "marketplace_embarcaciones_delete_own" ON public.marketplace_embarcaciones;
CREATE POLICY "marketplace_embarcaciones_delete_own"
  ON public.marketplace_embarcaciones FOR DELETE
  USING (owner_id = (SELECT auth.uid()));


-- ============================================================
-- marketplace_resenias
-- (marketplace_resenias_select usa USING true — se omite)
-- ============================================================

DROP POLICY IF EXISTS "marketplace_resenias_insert" ON public.marketplace_resenias;
CREATE POLICY "marketplace_resenias_insert"
  ON public.marketplace_resenias FOR INSERT
  WITH CHECK (
    autor_id = (SELECT auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM public.marketplace_servicios s
      WHERE s.id = marketplace_resenias.servicio_id
        AND s.comerciante_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "marketplace_resenias_update" ON public.marketplace_resenias;
CREATE POLICY "marketplace_resenias_update"
  ON public.marketplace_resenias FOR UPDATE
  USING (autor_id = (SELECT auth.uid()))
  WITH CHECK (autor_id = (SELECT auth.uid()));


-- ============================================================
-- notificaciones
-- ============================================================

DROP POLICY IF EXISTS "notificaciones_select_own" ON public.notificaciones;
CREATE POLICY "notificaciones_select_own"
  ON public.notificaciones FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notificaciones_update_own" ON public.notificaciones;
CREATE POLICY "notificaciones_update_own"
  ON public.notificaciones FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notificaciones_delete_own" ON public.notificaciones;
CREATE POLICY "notificaciones_delete_own"
  ON public.notificaciones FOR DELETE
  USING (user_id = (SELECT auth.uid()));


-- ============================================================
-- porteria
-- (porteria_select_member, porteria_select_seguridad, porteria_update_seguridad
--  usan solo funciones helper — no tocan auth.uid() directamente, se omiten)
-- ============================================================

DROP POLICY IF EXISTS "porteria_select_own" ON public.porteria;
CREATE POLICY "porteria_select_own"
  ON public.porteria FOR SELECT
  USING (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "porteria_insert_own" ON public.porteria;
CREATE POLICY "porteria_insert_own"
  ON public.porteria FOR INSERT
  WITH CHECK (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "porteria_update_own" ON public.porteria;
CREATE POLICY "porteria_update_own"
  ON public.porteria FOR UPDATE
  USING (socio_id = (SELECT auth.uid()))
  WITH CHECK (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "porteria_delete_own" ON public.porteria;
CREATE POLICY "porteria_delete_own"
  ON public.porteria FOR DELETE
  USING (socio_id = (SELECT auth.uid()));


-- ============================================================
-- solicitudes_lavado
-- ============================================================

DROP POLICY IF EXISTS "solicitudes_lavado_socio_select" ON public.solicitudes_lavado;
CREATE POLICY "solicitudes_lavado_socio_select"
  ON public.solicitudes_lavado FOR SELECT
  USING (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "solicitudes_lavado_socio_insert" ON public.solicitudes_lavado;
CREATE POLICY "solicitudes_lavado_socio_insert"
  ON public.solicitudes_lavado FOR INSERT
  WITH CHECK (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "solicitudes_lavado_socio_update" ON public.solicitudes_lavado;
CREATE POLICY "solicitudes_lavado_socio_update"
  ON public.solicitudes_lavado FOR UPDATE
  USING (socio_id = (SELECT auth.uid()))
  WITH CHECK (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "solicitudes_lavado_socio_delete" ON public.solicitudes_lavado;
CREATE POLICY "solicitudes_lavado_socio_delete"
  ON public.solicitudes_lavado FOR DELETE
  USING (socio_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "solicitudes_lavado_staff_select" ON public.solicitudes_lavado;
CREATE POLICY "solicitudes_lavado_staff_select"
  ON public.solicitudes_lavado FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = solicitudes_lavado.guarderia_id
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "solicitudes_lavado_staff_update" ON public.solicitudes_lavado;
CREATE POLICY "solicitudes_lavado_staff_update"
  ON public.solicitudes_lavado FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.guarderia_id = solicitudes_lavado.guarderia_id
        AND m.status = 'active'
    )
  );
