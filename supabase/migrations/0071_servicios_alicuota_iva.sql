-- Agrega alicuota de IVA a tarifas (0, 10.5 o 21 %)
ALTER TABLE servicios
  ADD COLUMN alicuota_iva numeric(5, 2) NOT NULL DEFAULT 21;
