-- Comprobante interno manual/lote (CM-/CL-).
--
-- Hasta ahora, elegir "Interno" en Cargar Servicio generaba al toque un
-- recibo RB-NNNNNN. De acá en más ese paso solo marca el cargo como no
-- fiscal (comprobante_interno = true) y lo deja pendiente: el comprobante
-- (CM- o CL-) se emite después, a mano, desde Ventas → Nuevo comprobante,
-- eligiendo qué cargos consolidar en un solo documento.
--
-- Backfill: los cargos ya cargados como "Interno" antes de este cambio ya
-- tienen su recibo RB- (facturacion.movimiento_id → este movimiento). Sin
-- este backfill, volverían a aparecer como "pendientes" en el nuevo flujo y
-- se podría generar un CM-/CL- duplicado sobre algo que ya tiene RB-.
--
-- Correr desde el SQL Editor de Supabase.

UPDATE public.movimientos_cuenta_corriente m
SET estado = 'facturado'
WHERE m.comprobante_interno = true
  AND m.estado = 'no_pagado'
  AND EXISTS (
    SELECT 1 FROM public.facturacion f WHERE f.movimiento_id = m.id
  );
