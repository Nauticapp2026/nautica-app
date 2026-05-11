-- =============================================================================
-- Renombra espacios.offset → espacios.orden.
--
-- "offset" es palabra reservada en Postgres y aunque Drizzle deberia quotear-
-- la al generar SQL, en la practica los updates no se aplicaban (probable-
-- mente el quoting fallaba en algun caso). Renombrar a "orden" elimina el
-- conflicto y alinea con la convencion ya usada en marinas.orden /
-- pisos.orden / naves.orden.
--
-- Idempotente: solo renombra si "offset" existe y "orden" no existe.
-- =============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'espacios' and column_name = 'offset'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'espacios' and column_name = 'orden'
  ) then
    execute 'alter table public.espacios rename column "offset" to orden';
  end if;
end$$;

-- Si la columna no existe en absoluto (no se aplico la 0024), la creamos
-- como orden directamente.
alter table public.espacios
  add column if not exists orden integer not null default 0;
