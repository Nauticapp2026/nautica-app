-- Cerrar el acceso público a las tablas de backup.
--
-- El linter de Supabase (2026-09-02) marcó 16 tablas `backup_*` en el esquema
-- `public` sin RLS. `public` es el esquema que PostgREST expone, así que
-- cualquiera con la clave anon —que viaja en el navegador y en la app mobile—
-- podía leerlas enteras. Adentro hay copias de movimientos de cuenta corriente,
-- facturación, servicios contratados y cobros de Payway, **de todos los clubes
-- y sin scope por guardería**.
--
-- Son fotocopias que se sacaron antes de cambios grandes en facturación (25 y 28
-- de agosto de 2026) como red de seguridad. La app NO las lee: no hay ninguna
-- referencia en el código. Por eso alcanza con cerrarlas — no hay que borrarlas,
-- y conviene no hacerlo: contienen parte de los datos que se borraron de IVA y
-- Yacht Club Vicente López.
--
-- El juego `backup_ycvl_*` ya tenía RLS y por eso el linter no lo marcaba; esto
-- deja a todos los backups en el mismo estado.
--
-- RLS habilitado y SIN políticas = nadie llega por la API. Drizzle sigue
-- entrando porque usa el pooler con un rol privilegiado (que además es dueño de
-- las tablas), así que un script de restauración sigue funcionando.
--
-- Dinámico y idempotente a propósito: agarra cualquier `backup_*` que aparezca
-- después, para que un backup nuevo no vuelva a quedar expuesto por olvido.

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'backup\_%'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('revoke all on public.%I from anon, authenticated', t.relname);
    raise notice 'backup cerrado: %', t.relname;
  end loop;
end
$$;
