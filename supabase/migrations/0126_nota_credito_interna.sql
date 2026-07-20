-- Nota de Crédito interna: anula/reduce un Comprobante interno (CM-/CL-)
-- sin pasar por ARCA/TusFacturas (a diferencia de nota_credito_a/b/c, que
-- siempre son fiscales). Numeración propia NCI-NNNNNN.

ALTER TYPE tipo_factura ADD VALUE 'nota_credito_interna';
