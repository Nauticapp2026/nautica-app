-- Realtime: completar REPLICA IDENTITY FULL en las 4 tablas que quedaron en
-- identidad `default` desde antes de la 0106.
--
-- Las 4 (porteria, memberships, embarcaciones, facturacion) ya estaban en la
-- publicación `supabase_realtime`, pero con REPLICA IDENTITY default. Con esa
-- identidad, un evento de DELETE solo trae la PK en el WAL, así que el filtro
-- `guarderia_id=eq.X` del RealtimeRefresher no matchea y esos DELETE se pierden
-- (no refrescan el panel). FULL hace que viaje la fila completa y el filtro
-- aplique también en UPDATE/DELETE. Deja las 10 tablas del refresher consistentes.
--
-- Costo: WAL levemente más grande en esas tablas (escritura baja → despreciable).
--
-- Correr desde el SQL Editor de Supabase.

ALTER TABLE public.porteria REPLICA IDENTITY FULL;
ALTER TABLE public.memberships REPLICA IDENTITY FULL;
ALTER TABLE public.embarcaciones REPLICA IDENTITY FULL;
ALTER TABLE public.facturacion REPLICA IDENTITY FULL;
