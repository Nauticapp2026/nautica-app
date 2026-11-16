-- 0177 · Proveedores: tilde "proveedor del exterior"
--
-- Hasta ahora "del exterior" se marcaba al dar de alta y se guardaba como condición frente al
-- IVA "Proveedor del Exterior". Pasa a ser un dato propio de la solapa Información fiscal (el
-- CUIT se valida ahí, salvo que esté tildado). Aditivo: columna nueva, con valor por defecto.

alter table public.proveedores
  add column if not exists es_exterior boolean not null default false;

-- Los que ya se habían cargado como "Proveedor del Exterior" quedan tildados.
update public.proveedores
   set es_exterior = true
 where condicion_iva = 'proveedor_exterior' and es_exterior = false;
