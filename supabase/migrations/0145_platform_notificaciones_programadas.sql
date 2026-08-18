-- Notificaciones push programadas (super admin).
--
-- Hasta ahora una notificación se enviaba en el acto: el server action la
-- insertaba y disparaba el envío inline. Con esta columna el super admin puede
-- elegir un día y un turno (mañana / tarde / noche en hora Argentina) y el
-- envío queda esperando a que el cron lo levante.
--
-- NULL = enviar ya (comportamiento previo, que es el de todas las filas
-- existentes). No se agrega un estado nuevo al enum: una notificación
-- programada sigue en 'pendiente' hasta que sale, y la UI la muestra como
-- "Programada" mirando si `programada_para` es futura.

alter table public.platform_notificaciones
  add column if not exists programada_para timestamptz;

comment on column public.platform_notificaciones.programada_para is
  'Momento a partir del cual el cron puede enviarla. NULL = enviar en el acto.';

-- El cron busca pendientes cuyo horario ya llegó. El índice parcial cubre
-- exactamente esa consulta y se mantiene chico (solo las que están en cola).
create index if not exists platform_notificaciones_pendientes_idx
  on public.platform_notificaciones (programada_para)
  where estado = 'pendiente';
