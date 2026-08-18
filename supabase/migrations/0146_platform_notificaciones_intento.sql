-- Evitar que una push salga dos veces.
--
-- Problema: el envío marcaba la fila DESPUÉS de mandar los push. Si el proceso
-- moría en el medio (timeout de la función serverless, deploy, crash), los push
-- ya habían salido pero la fila seguía en 'pendiente', así que la corrida
-- siguiente del cron la volvía a mandar. El socio recibía la misma push dos
-- veces. La misma ventana permitía que el envío inline y el cron se pisaran.
--
-- Solución: `intento_iniciado_en` se sella ANTES de mandar, con un UPDATE
-- condicional que actúa de reserva. Quien lo logra es el único que envía; los
-- demás ven la fila ya tomada y la saltean.
--
-- Si el proceso muere después de reservar, la fila queda en 'pendiente' con
-- `intento_iniciado_en` sellado: nadie la reintenta (es lo que se quiere, no
-- reintentar algo que pudo haber salido) y la UI la muestra como
-- "Interrumpida" para que se vea que quedó a mitad de camino.

alter table public.platform_notificaciones
  add column if not exists intento_iniciado_en timestamptz;

comment on column public.platform_notificaciones.intento_iniciado_en is
  'Sellado antes de despachar, como reserva. Si está seteado, la notificación ya se intentó y no se vuelve a intentar.';

-- El cron busca pendientes sin intento previo. El índice viejo no contemplaba
-- la columna nueva.
drop index if exists platform_notificaciones_pendientes_idx;

create index if not exists platform_notificaciones_pendientes_idx
  on public.platform_notificaciones (programada_para)
  where estado = 'pendiente' and intento_iniciado_en is null;
