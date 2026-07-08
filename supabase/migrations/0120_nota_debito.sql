-- Agrega Nota de Débito (A/B/C) al enum tipo_factura, análogo a las Notas de
-- Crédito ya existentes. Confirmado contra la documentación de TusFacturas
-- (developers.tusfacturas.app, tabla de referencia de tipos de comprobante):
-- el string exacto que espera la API es "NOTA DE DEBITO A/B/C".
--
-- ALTER TYPE ... ADD VALUE no puede usarse dentro de la misma transacción en
-- la que se lee/escribe el nuevo valor, pero sí puede ejecutarse en una
-- transacción propia (Postgres 12+, que es lo que corre Supabase).

ALTER TYPE tipo_factura ADD VALUE IF NOT EXISTS 'nota_debito_a';
ALTER TYPE tipo_factura ADD VALUE IF NOT EXISTS 'nota_debito_b';
ALTER TYPE tipo_factura ADD VALUE IF NOT EXISTS 'nota_debito_c';
