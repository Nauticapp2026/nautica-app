-- 0178 · Bienes de uso: ajustes de la solapa Datos contables
--
--  - fecha_inicio_marcha:   cuándo el bien empezó a funcionar ("Fecha Inicio Marcha").
--  - metodo_amortizacion:   método elegido de una lista (por defecto lineal).
--  - proveedor_id:          a quién se le compró el bien (un proveedor del maestro).
--
-- "Fecha Inicio Amortización" sigue siendo la columna existente `fecha_inicio_amortizacion`.
-- El valor residual deja de pedirse en pantalla: la columna queda como está (por defecto 0).
-- Aditivo: columnas nuevas y opcionales.

alter table public.bienes_uso
  add column if not exists fecha_inicio_marcha  date,
  add column if not exists metodo_amortizacion  text not null default 'lineal',
  add column if not exists proveedor_id         uuid references public.proveedores(id) on delete set null;

alter table public.bienes_uso drop constraint if exists bienes_uso_metodo_check;
alter table public.bienes_uso add constraint bienes_uso_metodo_check
  check (metodo_amortizacion in ('lineal', 'saldo_decreciente', 'unidades_producidas'));

create index if not exists bienes_uso_proveedor_idx
  on public.bienes_uso (proveedor_id) where proveedor_id is not null;
