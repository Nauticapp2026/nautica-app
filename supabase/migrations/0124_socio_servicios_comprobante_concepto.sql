-- "Cargar Servicio" deja de crear un movimiento en cuenta corriente al
-- contratar: el contrato (socio_servicios) pasa a ser la fuente de verdad
-- también para el cron de facturación mensual, que hasta ahora dependía de
-- que ya existiera un movimiento fiscal en movimientos_cuenta_corriente
-- para saber a quién seguir cobrando. Para eso el contrato necesita guardar
-- lo que antes solo vivía en el primer movimiento: si es interno/fiscal y
-- el detalle (concepto) opcional que haya tipeado el admin.

ALTER TABLE socio_servicios
  ADD COLUMN comprobante_interno boolean NOT NULL DEFAULT false,
  ADD COLUMN concepto text;

-- Política de baja anticipada pasa a ser opcional (antes NOT NULL con
-- default 'proporcional'): la UI ahora es un checkbox "establecer política"
-- + 2 radios; sin tildar el checkbox no hay política definida (NULL).
ALTER TABLE servicios
  ALTER COLUMN politica_baja_anticipada DROP NOT NULL,
  ALTER COLUMN politica_baja_anticipada DROP DEFAULT;

-- Backfill: los contratos que ya existen (creados por el flujo viejo, que sí
-- insertaba un movimiento al cargar el servicio) heredan comprobante_interno
-- y concepto de su movimiento más antiguo, para no cambiarles el
-- comportamiento a los que ya vienen recurriendo mes a mes.
-- (LATERAL no puede correlacionar con la tabla destino de un UPDATE — eso
-- solo funciona en el WHERE de nivel superior — así que el "más antiguo por
-- par" se resuelve antes, con DISTINCT ON, en vez de una subquery lateral.)
UPDATE socio_servicios ss
SET comprobante_interno = m.comprobante_interno,
    concepto = NULLIF(m.concepto, srv.nombre)
FROM (
  SELECT DISTINCT ON (socio_id, servicio_id)
    socio_id, servicio_id, comprobante_interno, concepto
  FROM movimientos_cuenta_corriente
  WHERE espacio_id IS NULL
  ORDER BY socio_id, servicio_id, fecha ASC, created_at ASC
) m
JOIN servicios srv ON srv.id = m.servicio_id
WHERE ss.espacio_id IS NULL
  AND ss.socio_id = m.socio_id
  AND ss.servicio_id = m.servicio_id;
