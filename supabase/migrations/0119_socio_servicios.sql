-- Servicio Contratado: un registro por contrato (socio + servicio), con su
-- propia ventana de vigencia (fecha_inicio / fecha_baja) y un número de
-- operación correlativo global por guardería. Reemplaza, para la UI de
-- "Servicios Contratados", la inferencia implícita que hoy se hacía a partir
-- del historial de movimientos + socio_servicios_cancelados.
--
-- A diferencia de socio_servicios_cancelados (un simple existence-check sin
-- historial), esta tabla SÍ guarda historial completo: no tiene unique
-- constraint sobre (socio_id, servicio_id), porque un socio puede cancelar y
-- volver a contratar el mismo servicio más adelante.
--
-- El cron de facturación mensual (movimientos-mensuales.ts) NO se toca: sigue
-- leyendo únicamente socio_servicios_cancelados. Esta tabla es la fuente de
-- verdad para la UI, no para el cron.

CREATE TABLE public.socio_servicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guarderia_id uuid NOT NULL REFERENCES public.guarderias(id) ON DELETE CASCADE,
  socio_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  espacio_id uuid REFERENCES public.espacios(id) ON DELETE SET NULL,
  numero_operacion integer NOT NULL,
  fecha_asignacion timestamptz NOT NULL DEFAULT now(),
  fecha_inicio date NOT NULL,
  fecha_baja date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX socio_servicios_guarderia_socio_servicio_idx
  ON public.socio_servicios (guarderia_id, socio_id, servicio_id);

CREATE INDEX socio_servicios_vigencia_idx
  ON public.socio_servicios (socio_id, fecha_inicio, fecha_baja);

ALTER TABLE public.socio_servicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY socio_servicios_select ON public.socio_servicios
  FOR SELECT USING (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY socio_servicios_insert ON public.socio_servicios
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

CREATE POLICY socio_servicios_update ON public.socio_servicios
  FOR UPDATE USING (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );
