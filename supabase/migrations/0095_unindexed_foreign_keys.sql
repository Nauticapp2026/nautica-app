-- =============================================================================
-- Migration 0095: Índices en foreign keys sin cobertura
--
-- Cierra todos los unindexed_foreign_keys INFO del linter.
-- Todos usan CREATE INDEX IF NOT EXISTS por seguridad ante índices ya existentes.
-- =============================================================================

-- actividad_porteria
CREATE INDEX IF NOT EXISTS idx_actividad_porteria_invitado_id  ON public.actividad_porteria (invitado_id);
CREATE INDEX IF NOT EXISTS idx_actividad_porteria_porteria_id  ON public.actividad_porteria (porteria_id);
CREATE INDEX IF NOT EXISTS idx_actividad_porteria_socio_id     ON public.actividad_porteria (socio_id);

-- alertas
CREATE INDEX IF NOT EXISTS idx_alertas_resolved_by ON public.alertas (resolved_by);

-- categorias_amarras
CREATE INDEX IF NOT EXISTS idx_categorias_amarras_guarderia_id ON public.categorias_amarras (guarderia_id);

-- comunicaciones
CREATE INDEX IF NOT EXISTS idx_comunicaciones_autor_id ON public.comunicaciones (autor_id);

-- datos_facturacion
CREATE INDEX IF NOT EXISTS idx_datos_facturacion_profile_id ON public.datos_facturacion (profile_id);

-- embarcaciones
CREATE INDEX IF NOT EXISTS idx_embarcaciones_espacio_id  ON public.embarcaciones (espacio_id);
CREATE INDEX IF NOT EXISTS idx_embarcaciones_profile_id  ON public.embarcaciones (profile_id);

-- entradas_socio
CREATE INDEX IF NOT EXISTS idx_entradas_socio_guarderia_id  ON public.entradas_socio (guarderia_id);
CREATE INDEX IF NOT EXISTS idx_entradas_socio_membership_id ON public.entradas_socio (membership_id);

-- espacios
CREATE INDEX IF NOT EXISTS idx_espacios_area_id      ON public.espacios (area_id);
CREATE INDEX IF NOT EXISTS idx_espacios_lado_id      ON public.espacios (lado_id);
CREATE INDEX IF NOT EXISTS idx_espacios_marina_id    ON public.espacios (marina_id);
CREATE INDEX IF NOT EXISTS idx_espacios_nave_id      ON public.espacios (nave_id);
CREATE INDEX IF NOT EXISTS idx_espacios_ocupante_id  ON public.espacios (ocupante_id);
CREATE INDEX IF NOT EXISTS idx_espacios_piso_id      ON public.espacios (piso_id);
CREATE INDEX IF NOT EXISTS idx_espacios_servicio_id  ON public.espacios (servicio_id);

-- facturacion
CREATE INDEX IF NOT EXISTS idx_facturacion_factura_original_id ON public.facturacion (factura_original_id);
CREATE INDEX IF NOT EXISTS idx_facturacion_movimiento_id       ON public.facturacion (movimiento_id);

-- facturacion_item_movimientos
CREATE INDEX IF NOT EXISTS idx_facturacion_item_mov_item_id       ON public.facturacion_item_movimientos (facturacion_item_id);
CREATE INDEX IF NOT EXISTS idx_facturacion_item_mov_movimiento_id ON public.facturacion_item_movimientos (movimiento_id);

-- facturacion_items
CREATE INDEX IF NOT EXISTS idx_facturacion_items_facturacion_id ON public.facturacion_items (facturacion_id);
CREATE INDEX IF NOT EXISTS idx_facturacion_items_socio_id       ON public.facturacion_items (socio_id);

-- guarderia_plan_historial
CREATE INDEX IF NOT EXISTS idx_guarderia_plan_historial_created_by ON public.guarderia_plan_historial (created_by);

-- horarios_dia
CREATE INDEX IF NOT EXISTS idx_horarios_dia_guarderia_id ON public.horarios_dia (guarderia_id);

-- invitados
CREATE INDEX IF NOT EXISTS idx_invitados_socio_id ON public.invitados (socio_id);
CREATE INDEX IF NOT EXISTS idx_invitados_user_id  ON public.invitados (user_id);

-- invitations
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON public.invitations (invited_by);

-- items_orden
CREATE INDEX IF NOT EXISTS idx_items_orden_orden_id ON public.items_orden (orden_id);
CREATE INDEX IF NOT EXISTS idx_items_orden_plato_id ON public.items_orden (plato_id);

-- lados
CREATE INDEX IF NOT EXISTS idx_lados_area_id      ON public.lados (area_id);
CREATE INDEX IF NOT EXISTS idx_lados_guarderia_id ON public.lados (guarderia_id);

-- marinas
CREATE INDEX IF NOT EXISTS idx_marinas_area_id ON public.marinas (area_id);

-- movimientos_cuenta_corriente
CREATE INDEX IF NOT EXISTS idx_movimientos_cta_cte_servicio_id ON public.movimientos_cuenta_corriente (servicio_id);

-- naves
CREATE INDEX IF NOT EXISTS idx_naves_area_id ON public.naves (area_id);

-- ordenes
CREATE INDEX IF NOT EXISTS idx_ordenes_profile_id ON public.ordenes (profile_id);

-- pagos
CREATE INDEX IF NOT EXISTS idx_pagos_orden_id       ON public.pagos (orden_id);
CREATE INDEX IF NOT EXISTS idx_pagos_restaurante_id ON public.pagos (restaurante_id);

-- pisos
CREATE INDEX IF NOT EXISTS idx_pisos_area_id ON public.pisos (area_id);

-- platform_comunicaciones
CREATE INDEX IF NOT EXISTS idx_platform_comunicaciones_autor_id ON public.platform_comunicaciones (autor_id);

-- platform_notificaciones
CREATE INDEX IF NOT EXISTS idx_platform_notificaciones_autor_id ON public.platform_notificaciones (autor_id);

-- platform_publicidades
CREATE INDEX IF NOT EXISTS idx_platform_publicidades_autor_id ON public.platform_publicidades (autor_id);

-- platform_settings
CREATE INDEX IF NOT EXISTS idx_platform_settings_updated_by ON public.platform_settings (updated_by);

-- porteria
CREATE INDEX IF NOT EXISTS idx_porteria_embarcacion_id   ON public.porteria (embarcacion_id);
CREATE INDEX IF NOT EXISTS idx_porteria_invitado_user_id ON public.porteria (invitado_user_id);
CREATE INDEX IF NOT EXISTS idx_porteria_socio_id         ON public.porteria (socio_id);

-- pricing_features
CREATE INDEX IF NOT EXISTS idx_pricing_features_updated_by ON public.pricing_features (updated_by);

-- pricing_plan_features
CREATE INDEX IF NOT EXISTS idx_pricing_plan_features_feature_id  ON public.pricing_plan_features (feature_id);
CREATE INDEX IF NOT EXISTS idx_pricing_plan_features_updated_by  ON public.pricing_plan_features (updated_by);

-- pricing_plans
CREATE INDEX IF NOT EXISTS idx_pricing_plans_updated_by ON public.pricing_plans (updated_by);

-- proveedores
CREATE INDEX IF NOT EXISTS idx_proveedores_profile_id ON public.proveedores (profile_id);

-- publicaciones
CREATE INDEX IF NOT EXISTS idx_publicaciones_autor_id ON public.publicaciones (autor_id);

-- reservas
CREATE INDEX IF NOT EXISTS idx_reservas_profile_id ON public.reservas (profile_id);

-- restaurantes
CREATE INDEX IF NOT EXISTS idx_restaurantes_guarderia_id ON public.restaurantes (guarderia_id);

-- servicios
CREATE INDEX IF NOT EXISTS idx_servicios_categoria_amarra_id ON public.servicios (categoria_amarra_id);

-- servicios_historial
CREATE INDEX IF NOT EXISTS idx_servicios_historial_usuario_id ON public.servicios_historial (usuario_id);

-- socio_servicios_cancelados
CREATE INDEX IF NOT EXISTS idx_socio_servicios_cancelados_guarderia_id ON public.socio_servicios_cancelados (guarderia_id);
CREATE INDEX IF NOT EXISTS idx_socio_servicios_cancelados_servicio_id  ON public.socio_servicios_cancelados (servicio_id);

-- solicitudes_membership
CREATE INDEX IF NOT EXISTS idx_solicitudes_membership_resolved_by ON public.solicitudes_membership (resolved_by);

-- tareas
CREATE INDEX IF NOT EXISTS idx_tareas_embarcacion_id ON public.tareas (embarcacion_id);
CREATE INDEX IF NOT EXISTS idx_tareas_porteria_id    ON public.tareas (porteria_id);
CREATE INDEX IF NOT EXISTS idx_tareas_servicio_id    ON public.tareas (servicio_id);

-- terminos_versiones
CREATE INDEX IF NOT EXISTS idx_terminos_versiones_publicado_por ON public.terminos_versiones (publicado_por);
