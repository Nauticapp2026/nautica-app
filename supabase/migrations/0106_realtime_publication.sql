-- Realtime: agregar a la publicación las tablas que el web ya escucha pero que
-- NO estaban publicando eventos.
--
-- El componente `RealtimeRefresher` (web) se suscribe a 9 tablas con filtro
-- guarderia_id, pero solo 4 estaban en la publicación `supabase_realtime`
-- (porteria, memberships, embarcaciones, facturacion). Las otras 5 nunca emitían
-- eventos, así que los cambios hechos desde la app mobile (ej. un operario que
-- completa una tarea, un socio que pide un lavado) NO refrescaban el panel web en
-- tiempo real. Esta migración las suma a la publicación.
--
-- REPLICA IDENTITY FULL: necesario para que el filtro `guarderia_id=eq.X` aplique
-- también a UPDATE/DELETE (con la identidad default solo viaja la PK en el evento
-- de DELETE, y el filtro por guarderia_id no matchea → se perdían esos eventos).
--
-- Correr desde el SQL Editor de Supabase.

ALTER PUBLICATION supabase_realtime ADD TABLE public.tareas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitudes_lavado;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.espacios;
ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitudes_membership;

ALTER TABLE public.tareas REPLICA IDENTITY FULL;
ALTER TABLE public.solicitudes_lavado REPLICA IDENTITY FULL;
ALTER TABLE public.alertas REPLICA IDENTITY FULL;
ALTER TABLE public.espacios REPLICA IDENTITY FULL;
ALTER TABLE public.solicitudes_membership REPLICA IDENTITY FULL;
