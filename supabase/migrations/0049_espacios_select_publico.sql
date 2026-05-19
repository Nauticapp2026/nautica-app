-- Habilita la pantalla "Espacios" del mobile (Etapa 1 del plan de lanzamiento).
-- Permite que cualquier usuario autenticado vea los espacios con estado
-- 'disponible' de guarderias con activa=true.
--
-- IMPORTANTE: la tabla public.espacios no aparece con `enable row level security`
-- en ninguna migracion anterior. Si la RLS NO esta habilitada, esta policy se
-- crea pero queda dormida y la tabla sigue siendo leible por cualquiera (caso
-- "abierto"). Si la RLS SI esta habilitada (por configuracion manual desde el
-- Dashboard), esta policy abre el SELECT cross-tenant para los espacios libres.
-- Cualquiera de los dos casos satisface el requisito de "que vean todos".
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'espacios'
      and policyname = 'espacios_select_publico_disponibles'
  ) then
    create policy espacios_select_publico_disponibles on public.espacios
      for select
      to authenticated
      using (
        estado = 'disponible'
        and exists (
          select 1 from public.guarderias g
          where g.id = espacios.guarderia_id
            and g.activa = true
        )
      );
  end if;
end $$;

-- guarderias ya tiene policy de SELECT abierta para guarderias.activa=true
-- (mig 0040_guarderias_publicas_anon.sql) → el JOIN desde mobile resuelve OK.
