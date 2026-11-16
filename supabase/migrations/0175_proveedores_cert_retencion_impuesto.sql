-- 0175 · Proveedores: tipo de impuesto del certificado de exclusión de retenciones
--
-- El certificado de exclusión de retenciones corresponde a UN impuesto (IVA, Ganancias,
-- Ingresos Brutos o SUSS). Se guarda cuál, junto a la vigencia y al porcentaje. Aditivo:
-- columna nueva y opcional (los certificados ya cargados quedan sin impuesto hasta que se edite).

alter table public.proveedores
  add column if not exists cert_ret_impuesto text;

alter table public.proveedores drop constraint if exists proveedores_cert_ret_impuesto_check;
alter table public.proveedores add constraint proveedores_cert_ret_impuesto_check
  check (cert_ret_impuesto is null or cert_ret_impuesto in ('iva', 'ganancias', 'iibb', 'suss'));
