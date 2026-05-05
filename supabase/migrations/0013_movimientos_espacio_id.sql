-- Agrega espacio_id a movimientos_cuenta_corriente para que la idempotencia
-- mensual identifique cada espacio individualmente. Sin esta columna, dos
-- espacios del mismo socio que comparten el mismo servicio_id chocaban en
-- (socio_id, servicio_id, mes) y solo se cobraba uno.
--
-- Movimientos previos quedan con espacio_id = NULL: no chocan con los nuevos
-- porque el filtro de idempotencia también incluye el rango del mes corriente.

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS espacio_id uuid
    REFERENCES public.espacios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS movimientos_cta_cte_espacio_idx
  ON public.movimientos_cuenta_corriente (espacio_id);
