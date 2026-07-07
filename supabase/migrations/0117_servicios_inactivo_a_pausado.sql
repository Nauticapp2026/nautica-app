-- Se saca "Inactivo" de la edición de tarifas (el modal de Editar solo
-- ofrecía Activo/Inactivo; de ahora en más el único estado alternativo se
-- maneja con Pausar/Reactivar). Pausado e Inactivo ya se comportan igual en
-- todo el código (ambos bloquean cron, carga manual y asignación — todos los
-- chequeos son "estado === 'activo'", nunca "!== 'inactivo'"), así que se
-- migran las tarifas ya inactivas a pausado para no dejar un estado húerfano
-- que la UI ya no puede volver a asignar.
--
-- Correr desde el SQL Editor de Supabase.

UPDATE public.servicios
SET estado = 'pausado', updated_at = now()
WHERE estado = 'inactivo';
