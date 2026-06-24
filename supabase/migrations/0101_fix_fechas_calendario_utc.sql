-- Fix de zona horaria en fechas-calendario.
--
-- Las fechas elegidas por el usuario (fecha de un movimiento, emisión / período /
-- vencimiento de una factura) se guardaban con `new Date('YYYY-MM-DD')`, que es
-- MEDIANOCHE UTC. Al renderizarlas en hora Argentina (UTC-3) retrocedían un día
-- (ej. 23/6 se veía 22/6; una factura del 24/6 se veía 23/6).
--
-- A partir de ahora el código las guarda al MEDIODÍA UTC (helper
-- fechaCalendariaArg), que en ART cae siempre en el día correcto. Esta migración
-- corrige las filas YA guardadas: bumpea +12h SOLO las que están exactamente a
-- medianoche UTC (las buggeadas). Las fechas de instante real (cron mensual,
-- cobros Payway, pagos con hora) tienen hora ≠ 00:00:00 y no se tocan.
--
-- Se evalúa el time-of-day en UTC explícitamente (AT TIME ZONE 'UTC') para no
-- depender del timezone de la sesión.

UPDATE movimientos_cuenta_corriente
  SET fecha = fecha + interval '12 hours'
  WHERE fecha IS NOT NULL
    AND (fecha AT TIME ZONE 'UTC')::time = '00:00:00';

UPDATE facturacion
  SET emision = emision + interval '12 hours'
  WHERE emision IS NOT NULL
    AND (emision AT TIME ZONE 'UTC')::time = '00:00:00';

UPDATE facturacion
  SET desde = desde + interval '12 hours'
  WHERE desde IS NOT NULL
    AND (desde AT TIME ZONE 'UTC')::time = '00:00:00';

UPDATE facturacion
  SET hasta = hasta + interval '12 hours'
  WHERE hasta IS NOT NULL
    AND (hasta AT TIME ZONE 'UTC')::time = '00:00:00';

UPDATE facturacion
  SET vencimiento = vencimiento + interval '12 hours'
  WHERE vencimiento IS NOT NULL
    AND (vencimiento AT TIME ZONE 'UTC')::time = '00:00:00';
