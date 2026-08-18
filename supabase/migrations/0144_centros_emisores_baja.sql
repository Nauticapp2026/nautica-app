-- Baja de centros emisores (pedido cliente 2026-08-19).
--
-- Es una baja LÓGICA, no un DELETE: una factura ya emitida tiene que seguir
-- apuntando a su punto de venta para la trazabilidad ante ARCA (hoy el club
-- "IVA" tiene 12 comprobantes emitidos y Yacht Club 3). Un centro dado de baja
-- deja de ofrecerse al emitir, pero los comprobantes viejos siguen enteros y
-- se pueden reimprimir / reenviar por su POS original.

ALTER TABLE guarderia_centros_emisores
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- El índice parcial de "un solo principal por guardería" sigue valiendo tal
-- cual: el principal no se puede dar de baja (hay que designar otro antes),
-- así que nunca hay un principal inactivo.
