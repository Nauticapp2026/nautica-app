-- Política de baja anticipada por tarifa: cómo se factura el mes en que el
-- socio cancela el servicio. 'proporcional' es el comportamiento histórico
-- (precio mensual / días del mes, sin redondeo) y queda como default para no
-- cambiar el comportamiento de las tarifas existentes.

CREATE TYPE politica_baja_anticipada AS ENUM ('mes_completo', 'proporcional');

ALTER TABLE servicios
  ADD COLUMN politica_baja_anticipada politica_baja_anticipada NOT NULL DEFAULT 'proporcional';
