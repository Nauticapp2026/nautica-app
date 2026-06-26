-- "Comprobante interno" en los cargos de cuenta corriente.
--
-- Cuando se carga un servicio eligiendo "Comprobante interno" (en vez de fiscal),
-- el cargo ya queda documentado con un comprobante NO fiscal y NO debe volver a
-- facturarse por TusFacturas. Este flag lo excluye de la auto-emisión y de la
-- facturación manual (ver runAutoEmision y la query de pendientes de /facturacion).
--
-- Default false: todos los cargos existentes siguen siendo facturables.
-- Correr desde el SQL Editor de Supabase.

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS comprobante_interno boolean NOT NULL DEFAULT false;
