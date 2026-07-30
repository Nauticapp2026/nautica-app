-- 0137 — Clubes monotributistas: sanear tarifas legacy con IVA cargado.
--
-- Regla (cuadro del cliente): un club Monotributo emite Factura C y nunca
-- muestra ni cobra IVA. El bloqueo de alícuota en el Tarifario (mig previa)
-- solo aplica al editar; estas tarifas quedaron de antes con 21% / 10,5% y el
-- sistema les venía sumando IVA al cobrar. Decisión del cliente 2026-07-30:
-- alícuota a 0 dejando el precio de lista como está (el monto cobrado baja al
-- precio de lista).
UPDATE servicios s
SET alicuota_iva = 0
FROM guarderias g
WHERE g.id = s.guarderia_id
  AND g.condicion_iva = 'monotributo'
  AND s.alicuota_iva::numeric > 0;

-- Ídem para cobros por baja anticipada que quedaron pendientes de facturar
-- con la alícuota vieja snapshoteada.
UPDATE cargos_pendientes cp
SET alicuota_iva = 0
FROM guarderias g
WHERE g.id = cp.guarderia_id
  AND g.condicion_iva = 'monotributo'
  AND cp.alicuota_iva::numeric > 0;
