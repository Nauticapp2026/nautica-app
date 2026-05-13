-- =============================================================================
-- Renombrar los planes de pricing:
--   classic  → esencial
--   plus     → club
--   platinum → elite
--
-- - ALTER TYPE ... RENAME VALUE actualiza el enum y todas las columnas que lo
--   usan (guarderias.plan, pricing_plans.slug). No hay que tocar filas a mano.
-- - El display name en pricing_plans.name sí se actualiza vía UPDATE para que
--   en la landing y en /super-admin/pricing aparezca "ESENCIAL / CLUB / ÉLITE"
--   en vez de "CLASSIC / PLUS / PLATINIUM" (este último ya era un typo viejo).
--
-- Idempotente: cada RENAME chequea que el value viejo todavía exista. Los
-- UPDATEs de name son idempotentes por construcción.
-- =============================================================================

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'plan' and e.enumlabel = 'classic'
  ) then
    alter type public.plan rename value 'classic' to 'esencial';
  end if;

  if exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'plan' and e.enumlabel = 'plus'
  ) then
    alter type public.plan rename value 'plus' to 'club';
  end if;

  if exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'plan' and e.enumlabel = 'platinum'
  ) then
    alter type public.plan rename value 'platinum' to 'elite';
  end if;
end$$;

update public.pricing_plans set name = 'ESENCIAL' where slug = 'esencial';
update public.pricing_plans set name = 'CLUB'     where slug = 'club';
update public.pricing_plans set name = 'ÉLITE'    where slug = 'elite';
