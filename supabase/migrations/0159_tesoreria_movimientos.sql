-- =============================================================================
-- 0159 — Tesorería: movimientos manuales de caja.
--
-- Motivo: la sección Tesorería (daily Richi/Flor 2026-10-06, modelo Excel de
-- Canestrari) muestra, por instrumento (efectivo, transferencia, cheque, ...),
-- los ingresos y egresos del club con saldo acumulado y un cierre de caja en
-- PDF. Los INGRESOS por cobranzas no viven acá: salen de los recibos
-- (facturacion RC-/RI- + formas de pago en movimientos_cuenta_corriente.
-- datos_pago) y de sus anulaciones. Esta tabla guarda lo que se carga a mano:
-- retiros, gastos, depósitos, ingresos que no son cobranzas.
--
-- `numero` es correlativo por guardería (lo pide el cliente: "número
-- secuencial autoincremental"). `instrumento` usa los mismos valores que las
-- formas de cobranza (efectivo, efectivo_usd, transferencia, tarjeta_debito,
-- tarjeta_credito, mercado_pago, cheque, debito_automatico, otro) así los
-- movimientos manuales y los recibos caen en la misma caja.
--
-- `anulado` queda reservado: la anulación/modificación de movimientos se
-- validará más adelante (acordado en la daily); sin UI por ahora.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.tesoreria_movimientos (
  id             uuid primary key default gen_random_uuid(),
  guarderia_id   uuid not null references public.guarderias(id) on delete cascade,
  numero         integer not null,
  tipo           text not null check (tipo in ('ingreso', 'egreso')),
  fecha          date not null,
  instrumento    text not null,
  monto          numeric(12, 2) not null check (monto > 0),
  rubro          text not null,
  subrubro       text not null,
  detalle        text not null,
  observaciones  text not null default '',
  -- Path en el bucket privado `documentos` (tesoreria/{guarderia}/...). Se
  -- firma al mostrar; nunca URL pública.
  adjunto_path   text,
  adjunto_nombre text,
  anulado        boolean not null default false,
  anulado_at     timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint tesoreria_movimientos_numero_unico unique (guarderia_id, numero)
);

create index if not exists tesoreria_movimientos_guarderia_fecha_idx
  on public.tesoreria_movimientos (guarderia_id, fecha);

comment on table public.tesoreria_movimientos is
  'Movimientos manuales de caja (Tesorería). Los ingresos por cobranzas salen de los recibos, no de acá.';

alter table public.tesoreria_movimientos enable row level security;

-- Solo el staff administrativo del club ve sus movimientos. Las mutaciones van
-- por server action con Drizzle (pooler, sin RLS); esta policy es la red de
-- seguridad para cualquier acceso vía PostgREST (mismo criterio que 0149).
drop policy if exists "tesoreria_movimientos_select_propio_club" on public.tesoreria_movimientos;
create policy "tesoreria_movimientos_select_propio_club"
  on public.tesoreria_movimientos for select
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid()
        and m.guarderia_id = tesoreria_movimientos.guarderia_id
        and m.status = 'active'
        and m.rol in ('administrador_general', 'administrativo', 'contable')
    )
  );
