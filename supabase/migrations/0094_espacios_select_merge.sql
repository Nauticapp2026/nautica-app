-- =============================================================================
-- Migration 0094: Fusionar espacios_member_select + espacios_select_publico_disponibles
--
-- Cierra el último multiple_permissive_policies warning.
-- Semánticamente idéntico:
--   • anon: auth.uid() = null → IN subquery vacío → solo ve disponibles en guarderías activas.
--   • authenticated: ve sus propias guarderías + espacios disponibles en guarderías activas.
-- =============================================================================

DROP POLICY IF EXISTS "espacios_member_select"              ON public.espacios;
DROP POLICY IF EXISTS "espacios_select_publico_disponibles" ON public.espacios;

CREATE POLICY "espacios_select"
  ON public.espacios FOR SELECT
  USING (
    guarderia_id IN (
      SELECT m.guarderia_id FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid())
    )
    OR (
      estado = 'disponible'
      AND EXISTS (
        SELECT 1 FROM public.guarderias g
        WHERE g.id = espacios.guarderia_id
          AND g.activa = true
      )
    )
  );
