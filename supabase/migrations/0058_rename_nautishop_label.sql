-- Renombrar 'Venta / Alquiler de camas y amarras online' al nombre original corto.
UPDATE pricing_features
SET label = 'Publicaciones en NautiShop'
WHERE id = 'nautishop_publicaciones';
