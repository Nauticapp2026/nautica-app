-- ============================================================
-- 0108 — Seguridad puede mover una tarea de 'salida_programada' a 'preparar'
--
-- Bug: al registrar el ingreso del socio/invitado en portería, la app de
-- seguridad intenta pasar la tarea de la salida de 'salida_programada' a
-- 'preparar' con un UPDATE. La policy `tareas_update_admin_or_operario` solo
-- permite UPDATE a super admin, admin del club u operario asignado, así que el
-- UPDATE de seguridad se rechazaba en silencio (0 filas, sin error) y la tarea
-- quedaba en 'salida_programada'. El operario nunca la veía pasar a 'preparar'.
--
-- Fix: redefinir la policy sumando una rama para el rol seguridad, acotada a la
-- transición 'salida_programada' -> 'preparar' (USING exige el estado viejo,
-- WITH CHECK exige el nuevo). No habilita ningún otro cambio de estado.
-- Idempotente.
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
    OR (
      -- Seguridad: solo puede tocar una tarea recién programada (la mueve a
      -- 'preparar' cuando registra el ingreso en portería).
      public.is_guarderia_seguridad(guarderia_id)
      AND estado = 'salida_programada'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_guarderia_admin(guarderia_id)
    OR (
      public.is_guarderia_member(guarderia_id)
      AND operario_id = (SELECT auth.uid())
    )
    OR (
      public.is_guarderia_seguridad(guarderia_id)
      AND estado = 'preparar'
    )
  );
