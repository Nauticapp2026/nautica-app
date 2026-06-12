-- 0078: Diferir cambios de plan al último día del mes.
-- Agrega plan_pendiente (nullable) en guarderias. El cron del día 1 aplica
-- el pendiente antes de generar el snapshot mensual.
alter table public.guarderias
  add column if not exists plan_pendiente plan;
