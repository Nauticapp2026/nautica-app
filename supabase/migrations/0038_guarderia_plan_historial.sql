-- =============================================================================
-- Historial de plan / tarifa mensual por guardería
--
-- Cada vez que una guardería elige o cambia de plan (en onboarding o desde el
-- tab Plan del admin) se inserta un row con SNAPSHOT de:
--   - plan elegido
--   - rate del plan al momento (no referencia viva — si el super admin sube
--     después el rate del plan, los rows históricos no se mueven)
--   - cantidad de espacios al momento
--   - monto mensual = rate × espacios
--   - efectivo_desde (now() por default; en backfill = guarderias.created_at)
--
-- El "plan actual" de una guardería se sigue leyendo de `guarderias.plan`
-- (más rápido que joinear contra este historial). Esta tabla es solo para
-- auditoría / vista en super admin.
--
-- RLS: solo super_admin (la lectura desde admin de la guardería se evalúa
-- caso por caso si hace falta — por ahora no se expone).
-- =============================================================================

create table if not exists public.guarderia_plan_historial (
  id              uuid primary key default gen_random_uuid(),
  guarderia_id    uuid not null references public.guarderias(id) on delete cascade,
  plan_slug       public.plan not null,
  rate            integer not null,
  espacios        integer not null,
  monto_mensual   integer not null,
  efectivo_desde  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null
);

comment on table public.guarderia_plan_historial is
  'Snapshot de plan + rate + espacios + monto mensual cada vez que una guardería elige o cambia de plan. Auditoría / vista en super admin.';

create index if not exists guarderia_plan_historial_guarderia_idx
  on public.guarderia_plan_historial (guarderia_id, efectivo_desde desc);

-- RLS: solo super_admin lee/escribe.
alter table public.guarderia_plan_historial enable row level security;

drop policy if exists "guarderia_plan_historial_super_admin" on public.guarderia_plan_historial;
create policy "guarderia_plan_historial_super_admin"
  on public.guarderia_plan_historial
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Backfill: 1 row por guardería con su plan/rate/espacios actuales y
-- efectivo_desde = guarderias.created_at. Idempotente: no inserta si la
-- guardería ya tiene historial.
insert into public.guarderia_plan_historial (
  guarderia_id, plan_slug, rate, espacios, monto_mensual, efectivo_desde
)
select
  g.id,
  g.plan,
  pp.rate,
  coalesce(esp.cnt, 0) as espacios,
  pp.rate * coalesce(esp.cnt, 0) as monto_mensual,
  g.created_at
from public.guarderias g
join public.pricing_plans pp on pp.slug = g.plan
left join (
  select guarderia_id, count(*)::int as cnt
  from public.espacios
  group by guarderia_id
) esp on esp.guarderia_id = g.id
where not exists (
  select 1
  from public.guarderia_plan_historial h
  where h.guarderia_id = g.id
);
