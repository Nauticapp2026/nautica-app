-- =============================================================================
-- Migration 0098: Permitir que el socio lea sus propias facturas
--
-- Bug: la tab "Facturas" del perfil del socio en la app mobile siempre mostraba
-- "No hay facturas cargadas". La tabla facturacion tenía RLS habilitada pero la
-- única policy (facturacion_admin_all, mig 0088/0091) solo daba acceso a roles
-- administrativos (administrador_general / administrativo / contable). El socio
-- no tenía ninguna policy de SELECT, así que la query del mobile
-- (.eq('socio_id', auth.uid())) devolvía [] sin error (RLS la filtraba toda).
--
-- Fix: policy de SELECT que deja al usuario leer únicamente las filas de
-- facturacion donde él es el socio_id. No expone facturas de otros socios ni
-- datos fiscales del club. Solo SELECT — el socio no escribe facturas.
-- =============================================================================

DROP POLICY IF EXISTS "facturacion_socio_select_own" ON public.facturacion;
CREATE POLICY "facturacion_socio_select_own" ON public.facturacion
  FOR SELECT USING (
    socio_id = (SELECT auth.uid())
  );
