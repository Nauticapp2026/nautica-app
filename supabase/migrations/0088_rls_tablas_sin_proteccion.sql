-- =============================================================================
-- Migration 0088: Habilitar RLS en tablas sin protección + revocar EXECUTE
-- en funciones trigger accesibles vía REST
-- =============================================================================
-- NOTA: Las queries de la app web van por Drizzle (pooler con service role),
-- que bypasea RLS. El impacto de esta migración es únicamente en llamadas
-- directas al PostgREST de Supabase (app mobile con JWT de usuario).
-- =============================================================================


-- ============================================================
-- 1. ESPACIOS — tiene policy pero RLS estaba deshabilitado
-- ============================================================

ALTER TABLE public.espacios ENABLE ROW LEVEL SECURITY;

-- Todos los miembros pueden ver los espacios de su guardería
CREATE POLICY "espacios_member_select" ON public.espacios
  FOR SELECT USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Admins gestionan todo
CREATE POLICY "espacios_admin_write" ON public.espacios
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- 2. DATOS_FACTURACION — credenciales TusFacturas por perfil
-- ============================================================

ALTER TABLE public.datos_facturacion ENABLE ROW LEVEL SECURITY;

-- Solo el dueño del perfil o super admin pueden ver/modificar
CREATE POLICY "datos_facturacion_owner" ON public.datos_facturacion
  FOR ALL USING (
    profile_id = auth.uid() OR public.is_super_admin()
  );


-- ============================================================
-- 3. MOVIMIENTOS_CUENTA_CORRIENTE — datos financieros
--    No tiene guarderia_id; el scope es via socio_id → memberships
-- ============================================================

ALTER TABLE public.movimientos_cuenta_corriente ENABLE ROW LEVEL SECURITY;

-- Socios ven sus propios movimientos; admins ven los de socios de su guardería
CREATE POLICY "movimientos_select" ON public.movimientos_cuenta_corriente
  FOR SELECT USING (
    socio_id = auth.uid()
    OR
    socio_id IN (
      SELECT m2.user_id
      FROM memberships m1
      JOIN memberships m2 USING (guarderia_id)
      WHERE m1.user_id = auth.uid()
        AND m1.rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

-- Solo admins pueden crear/modificar/borrar movimientos
CREATE POLICY "movimientos_admin_insert" ON public.movimientos_cuenta_corriente
  FOR INSERT WITH CHECK (
    socio_id IN (
      SELECT m2.user_id
      FROM memberships m1
      JOIN memberships m2 USING (guarderia_id)
      WHERE m1.user_id = auth.uid()
        AND m1.rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

CREATE POLICY "movimientos_admin_update" ON public.movimientos_cuenta_corriente
  FOR UPDATE USING (
    socio_id IN (
      SELECT m2.user_id
      FROM memberships m1
      JOIN memberships m2 USING (guarderia_id)
      WHERE m1.user_id = auth.uid()
        AND m1.rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

CREATE POLICY "movimientos_admin_delete" ON public.movimientos_cuenta_corriente
  FOR DELETE USING (
    socio_id IN (
      SELECT m2.user_id
      FROM memberships m1
      JOIN memberships m2 USING (guarderia_id)
      WHERE m1.user_id = auth.uid()
        AND m1.rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- 4. ACTIVIDAD_PORTERIA
--    Staff de portería (rol='seguridad') necesita INSERT
-- ============================================================

ALTER TABLE public.actividad_porteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "actividad_porteria_member_select" ON public.actividad_porteria
  FOR SELECT USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- Cualquier miembro puede registrar actividad (portería desde mobile)
CREATE POLICY "actividad_porteria_member_insert" ON public.actividad_porteria
  FOR INSERT WITH CHECK (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "actividad_porteria_admin_update" ON public.actividad_porteria
  FOR UPDATE USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

CREATE POLICY "actividad_porteria_admin_delete" ON public.actividad_porteria
  FOR DELETE USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- 5. ESTRUCTURA FÍSICA: areas, naves, marinas, lados
--    Patron: SELECT para miembros, todo para admins
-- ============================================================

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "areas_member_select" ON public.areas
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM memberships WHERE user_id = auth.uid())
  );
CREATE POLICY "areas_admin_write" ON public.areas
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

ALTER TABLE public.naves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "naves_member_select" ON public.naves
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM memberships WHERE user_id = auth.uid())
  );
CREATE POLICY "naves_admin_write" ON public.naves
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

ALTER TABLE public.marinas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marinas_member_select" ON public.marinas
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM memberships WHERE user_id = auth.uid())
  );
CREATE POLICY "marinas_admin_write" ON public.marinas
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

ALTER TABLE public.lados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lados_member_select" ON public.lados
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM memberships WHERE user_id = auth.uid())
  );
CREATE POLICY "lados_admin_write" ON public.lados
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- 6. PISOS — sin guarderia_id, se scopa via area_id → areas
-- ============================================================

ALTER TABLE public.pisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pisos_member_select" ON public.pisos
  FOR SELECT USING (
    area_id IN (
      SELECT id FROM areas WHERE guarderia_id IN (
        SELECT guarderia_id FROM memberships WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "pisos_admin_write" ON public.pisos
  FOR ALL USING (
    area_id IN (
      SELECT id FROM areas WHERE guarderia_id IN (
        SELECT guarderia_id FROM memberships
        WHERE user_id = auth.uid()
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );


-- ============================================================
-- 7. HORARIOS_DIA
-- ============================================================

ALTER TABLE public.horarios_dia ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer horarios (son públicos dentro del club)
CREATE POLICY "horarios_dia_member_select" ON public.horarios_dia
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "horarios_dia_admin_write" ON public.horarios_dia
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- 8. SERVICIOS (tarifario) y TARIFAS y CATEGORIAS_AMARRAS
-- ============================================================

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servicios_member_select" ON public.servicios
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM memberships WHERE user_id = auth.uid())
  );
CREATE POLICY "servicios_admin_write" ON public.servicios
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

ALTER TABLE public.tarifas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarifas_member_select" ON public.tarifas
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM memberships WHERE user_id = auth.uid())
  );
CREATE POLICY "tarifas_admin_write" ON public.tarifas
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

ALTER TABLE public.categorias_amarras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categorias_amarras_member_select" ON public.categorias_amarras
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM memberships WHERE user_id = auth.uid())
  );
CREATE POLICY "categorias_amarras_admin_write" ON public.categorias_amarras
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- 9. FACTURACION, FACTURACION_ITEMS, FACTURACION_ITEM_MOVIMIENTOS
--    Solo admins (datos fiscales del club)
-- ============================================================

ALTER TABLE public.facturacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facturacion_admin_all" ON public.facturacion
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

ALTER TABLE public.facturacion_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facturacion_items_admin_all" ON public.facturacion_items
  FOR ALL USING (
    facturacion_id IN (
      SELECT id FROM facturacion WHERE guarderia_id IN (
        SELECT guarderia_id FROM memberships
        WHERE user_id = auth.uid()
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );

ALTER TABLE public.facturacion_item_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facturacion_item_movimientos_admin_all" ON public.facturacion_item_movimientos
  FOR ALL USING (
    facturacion_item_id IN (
      SELECT fi.id FROM facturacion_items fi
      JOIN facturacion f ON f.id = fi.facturacion_id
      WHERE f.guarderia_id IN (
        SELECT guarderia_id FROM memberships
        WHERE user_id = auth.uid()
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );


-- ============================================================
-- 10. PROVEEDORES
-- ============================================================

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proveedores_member_select" ON public.proveedores
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM memberships WHERE user_id = auth.uid())
  );
CREATE POLICY "proveedores_admin_write" ON public.proveedores
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );


-- ============================================================
-- 11. TABLAS RESTAURANTE / MARKETPLACE
--     restaurantes → platos, ordenes, reservas, pagos, items_orden
-- ============================================================

ALTER TABLE public.restaurantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurantes_member_select" ON public.restaurantes
  FOR SELECT USING (
    guarderia_id IN (SELECT guarderia_id FROM memberships WHERE user_id = auth.uid())
  );
CREATE POLICY "restaurantes_admin_write" ON public.restaurantes
  FOR ALL USING (
    guarderia_id IN (
      SELECT guarderia_id FROM memberships
      WHERE user_id = auth.uid()
      AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

ALTER TABLE public.platos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platos_member_select" ON public.platos
  FOR SELECT USING (
    restaurante_id IN (
      SELECT id FROM restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM memberships WHERE user_id = auth.uid()
      )
    )
  );
CREATE POLICY "platos_admin_write" ON public.platos
  FOR ALL USING (
    restaurante_id IN (
      SELECT id FROM restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM memberships
        WHERE user_id = auth.uid()
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );

ALTER TABLE public.ordenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ordenes_member_select" ON public.ordenes
  FOR SELECT USING (
    restaurante_id IN (
      SELECT id FROM restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM memberships WHERE user_id = auth.uid()
      )
    )
  );
CREATE POLICY "ordenes_admin_write" ON public.ordenes
  FOR ALL USING (
    restaurante_id IN (
      SELECT id FROM restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM memberships
        WHERE user_id = auth.uid()
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );

ALTER TABLE public.items_orden ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_orden_member_select" ON public.items_orden
  FOR SELECT USING (
    orden_id IN (
      SELECT o.id FROM ordenes o
      JOIN restaurantes r ON r.id = o.restaurante_id
      WHERE r.guarderia_id IN (
        SELECT guarderia_id FROM memberships WHERE user_id = auth.uid()
      )
    )
  );
CREATE POLICY "items_orden_admin_write" ON public.items_orden
  FOR ALL USING (
    orden_id IN (
      SELECT o.id FROM ordenes o
      JOIN restaurantes r ON r.id = o.restaurante_id
      WHERE r.guarderia_id IN (
        SELECT guarderia_id FROM memberships
        WHERE user_id = auth.uid()
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );

ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pagos_member_select" ON public.pagos
  FOR SELECT USING (
    restaurante_id IN (
      SELECT id FROM restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM memberships WHERE user_id = auth.uid()
      )
    )
  );
CREATE POLICY "pagos_admin_write" ON public.pagos
  FOR ALL USING (
    restaurante_id IN (
      SELECT id FROM restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM memberships
        WHERE user_id = auth.uid()
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );

ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservas_member_select" ON public.reservas
  FOR SELECT USING (
    restaurante_id IN (
      SELECT id FROM restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM memberships WHERE user_id = auth.uid()
      )
    )
  );
CREATE POLICY "reservas_admin_write" ON public.reservas
  FOR ALL USING (
    restaurante_id IN (
      SELECT id FROM restaurantes WHERE guarderia_id IN (
        SELECT guarderia_id FROM memberships
        WHERE user_id = auth.uid()
        AND rol IN ('administrador_general', 'administrativo', 'contable')
      )
    )
  );


-- ============================================================
-- 12. REVOKE EXECUTE en funciones trigger / internas
--     Son invocadas por triggers del motor, no por usuarios directamente.
--     Exponerlas vía /rpc/ es innecesario y riesgoso.
--
--     NO se revocan:
--       - is_super_admin, is_guarderia_admin, is_guarderia_member,
--         is_guarderia_seguridad, is_elite_socio, guarderia_rol,
--         shares_guarderia_with_seguridad  →  usadas en policies RLS
--       - accept_invitation  →  llamada directamente por mobile/web
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.touch_updated_at()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.app_now_naive()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.monitor_arribos()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.auto_resolver_alertas_por_arribo()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.solicitudes_lavado_touch_updated_at()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.marketplace_servicios_set_updated_at()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.tg_marketplace_propiedades_set_updated()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.tg_marketplace_embarcaciones_set_updated()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.marketplace_resenias_set_updated_at()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.crear_tarea_para_salida_programada()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public._create_tarea_for_solicitud_lavado(uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public._on_membership_socio_downgrade()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public._on_servicio_precio_change()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public._on_solicitud_lavado_insert()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public._on_solicitud_membership_resolved()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.notificar_embarcacion_guardada()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.notificar_ingreso_porteria_invitado()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.notificar_resenia_servicio()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.notificar_sin_respuesta()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.notificar_solicitud_lavado_estado()
  FROM anon, authenticated;


-- ============================================================
-- PENDIENTE FUERA DE SQL:
-- • auth_leaked_password_protection: habilitar desde
--   Supabase Dashboard → Authentication → Password → "Leaked password protection"
-- • function_search_path_mutable: bajo riesgo, requiere
--   ALTER FUNCTION ... SET search_path = public para cada función
-- • guarderias_publicas SECURITY DEFINER view: intencional (novedades cross-club)
-- • mareas_cache RLS sin policy: solo accede el server (OK)
-- ============================================================
