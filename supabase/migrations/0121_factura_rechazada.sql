-- Antes, si ARCA rechazaba un comprobante, crearFacturaCore no guardaba
-- nada: el intento se perdía y no quedaba registro del motivo. Ahora se
-- persiste igual (sin folio_local, sin codigo, sin cae) para poder
-- mostrarlo en Ventas y reenviarlo una vez corregido.

ALTER TABLE public.facturacion
  ADD COLUMN IF NOT EXISTS rechazada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_error text;
