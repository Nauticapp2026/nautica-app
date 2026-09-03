-- Fecha de baja del centro emisor.
--
-- Pedido del cliente (2026-09-02): "cuando se da de baja un Centro Emisor, debe
-- quedar registrada y visible la fecha de esa baja".
--
-- La baja del centro es LÓGICA (mig 0144): la fila queda con `activo = false`
-- porque los comprobantes ya emitidos tienen que seguir apuntando a su punto de
-- venta para la trazabilidad ante ARCA. Lo que faltaba era el CUÁNDO — hasta
-- ahora solo se podía inferir de `updated_at`, que se pisa con cualquier otra
-- edición y por lo tanto no sirve como registro.
--
-- Se limpia al reactivar (un centro activo no tiene fecha de baja).
--
-- No hay backfill posible: los que ya estén de baja no dejaron rastro de la
-- fecha. Quedan en NULL y la UI muestra "sin registrar" en vez de inventar una.

alter table public.guarderia_centros_emisores
  add column if not exists baja_at timestamptz;

comment on column public.guarderia_centros_emisores.baja_at is
  'Cuándo se dio de baja el centro. NULL si está activo, o si la baja es anterior a esta columna.';
