-- Ítems one-shot "pendientes de facturar" con monto custom (no derivable del
-- tarifario). Hoy el único origen es el cobro por baja anticipada de un
-- servicio contratado; el CHECK de origen se amplía si aparecen otros.
--
-- Ciclo de vida: nace pendiente (movimiento_id NULL) → la emisión del próximo
-- comprobante del socio lo consume seteando movimiento_id dentro de la misma
-- transacción → si el admin se arrepiente antes de emitir, lo descarta con
-- anulado = true. Nunca se borra: es el registro de que se decidió cobrar.

CREATE TABLE public.cargos_pendientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guarderia_id uuid NOT NULL REFERENCES public.guarderias(id) ON DELETE CASCADE,
  socio_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  servicio_id uuid REFERENCES public.servicios(id) ON DELETE SET NULL,
  socio_servicio_id uuid REFERENCES public.socio_servicios(id) ON DELETE SET NULL,
  origen text NOT NULL CHECK (origen IN ('baja_anticipada')),
  concepto text NOT NULL,
  importe numeric(12, 2) NOT NULL CHECK (importe > 0),
  alicuota_iva numeric(5, 2),
  comprobante_interno boolean NOT NULL DEFAULT false,
  movimiento_id uuid REFERENCES public.movimientos_cuenta_corriente(id) ON DELETE SET NULL,
  anulado boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cargos_pendientes_pendientes_idx
  ON public.cargos_pendientes (guarderia_id, socio_id)
  WHERE movimiento_id IS NULL AND NOT anulado;

ALTER TABLE public.cargos_pendientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY cargos_pendientes_select ON public.cargos_pendientes
  FOR SELECT USING (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT guarderia_id FROM public.memberships WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY cargos_pendientes_insert ON public.cargos_pendientes
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

CREATE POLICY cargos_pendientes_update ON public.cargos_pendientes
  FOR UPDATE USING (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );
