-- Realtime: sumar actividad_porteria a la publicación.
--
-- El mobile escribe en actividad_porteria (entradas/salidas registradas en
-- portería). Se la agrega al RealtimeRefresher del web (REALTIME_TABLES) y acá a
-- la publicación, para que esos registros refresquen el panel en tiempo real.
-- Tiene guarderia_id, así que el filtro del refresher aplica.
--
-- REPLICA IDENTITY FULL: para que el filtro guarderia_id aplique también en
-- UPDATE/DELETE (ver mig 0106).
--
-- Correr desde el SQL Editor de Supabase.

ALTER PUBLICATION supabase_realtime ADD TABLE public.actividad_porteria;
ALTER TABLE public.actividad_porteria REPLICA IDENTITY FULL;
