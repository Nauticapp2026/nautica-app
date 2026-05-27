-- Activa clima y mareas para todas las guarderías existentes y cambia el
-- default a true para las nuevas. El tab de Notificaciones fue ocultado
-- del panel; esta feature se considera siempre activa.
UPDATE guarderias SET activar_clima_y_mareas = true;
ALTER TABLE guarderias ALTER COLUMN activar_clima_y_mareas SET DEFAULT true;
