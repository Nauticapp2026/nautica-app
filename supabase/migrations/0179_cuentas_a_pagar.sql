-- 0179 · Cuentas a pagar (comprobantes de proveedores)
--
-- Módulo nuevo, solo para administradores del club. Es aditivo: tablas nuevas, no toca nada
-- existente (la FK a `proveedores` es de solo lectura).
--
--  · cp_comprobantes: un comprobante de un proveedor (legal o no legal). Nace en estado H
--    (ingresado), pasa a A (autorizado, listo para pagar), a P (pagado, automático desde el
--    Circuito de pagos) o a X (anulado). Un anticipo a proveedor también vive acá
--    (origen = 'anticipo'), lo genera el Circuito de pagos (mig 0180) y se muestra negativo.
--  · Los importes se guardan siempre en positivo; el signo (FC y ND suman, NC y anticipos
--    restan) sale del tipo de comprobante.
--  · El saldo NO se guarda: es total − lo aplicado por los pagos vigentes (mig 0180).
--  · cp_comprobantes_historial: cada cambio de estado, con el usuario y la fecha.

create table if not exists public.cp_comprobantes (
  id                       uuid primary key default gen_random_uuid(),
  guarderia_id             uuid not null references public.guarderias(id) on delete cascade,
  -- Next Number: correlativo por club (se muestra como CP-000001).
  numero                   integer not null,
  origen                   text not null default 'manual',
  proveedor_id             uuid not null references public.proveedores(id) on delete restrict,
  -- Condición frente al IVA del proveedor al momento de cargar el comprobante.
  condicion_iva_proveedor  text,
  fecha_emision            date not null,
  -- Código oficial de ARCA ('001' Factura A, '006' Factura B…); 9xx = no legales; 'ANT' = anticipo.
  tipo_comprobante         text not null,
  punto_venta              text,
  numero_comprobante       text,
  fecha_contabilizacion    date not null,
  fecha_vencimiento        date,
  condicion_pago           text,
  moneda                   text not null default 'PES',
  tipo_cambio              numeric(14,4),
  -- Concepto = imputación contable (por defecto la cuenta contable del proveedor).
  concepto                 text,
  instrumento_pago         text,
  -- Líneas de IVA [{neto, alicuota, iva}] y percepciones IIBB [{jurisdiccion, monto}].
  lineas_iva               jsonb not null default '[]'::jsonb,
  percepciones_iibb        jsonb not null default '[]'::jsonb,
  neto_gravado             numeric(14,2) not null default 0,
  iva                      numeric(14,2) not null default 0,
  neto_no_gravado          numeric(14,2) not null default 0,
  exento                   numeric(14,2) not null default 0,
  otros_tributos           numeric(14,2) not null default 0,
  percepciones_iibb_total  numeric(14,2) not null default 0,
  monotributo              numeric(14,2) not null default 0,
  total                    numeric(14,2) not null,
  estado                   text not null default 'H',
  -- Quién y cuándo lo pasó de H a A.
  autorizado_por           uuid references public.profiles(id) on delete set null,
  autorizado_at            timestamptz,
  -- Día en que quedó pagado (estado P).
  fecha_pago               date,
  anulado_at               timestamptz,
  anulado_por              uuid references public.profiles(id) on delete set null,
  adjunto_path             text,
  adjunto_nombre           text,
  observaciones            text,
  created_by               uuid references public.profiles(id) on delete set null,
  updated_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint cp_comprobantes_origen_check check (origen in ('manual', 'anticipo')),
  constraint cp_comprobantes_estado_check check (estado in ('H', 'A', 'P', 'X')),
  constraint cp_comprobantes_moneda_check check (moneda in ('PES', 'DOL')),
  constraint cp_comprobantes_total_check check (total >= 0),
  constraint cp_comprobantes_tc_check
    check (moneda = 'PES' or (tipo_cambio is not null and tipo_cambio > 0))
);

-- Next Number único por club.
create unique index if not exists cp_comprobantes_numero_unico
  on public.cp_comprobantes (guarderia_id, numero);

-- Un mismo comprobante de un mismo proveedor no se carga dos veces. Los anulados no cuentan
-- (si se anuló por un error de carga, se puede volver a cargar bien).
create unique index if not exists cp_comprobantes_duplicado_unico
  on public.cp_comprobantes (guarderia_id, proveedor_id, tipo_comprobante, punto_venta, numero_comprobante)
  where origen = 'manual' and estado <> 'X';

create index if not exists cp_comprobantes_proveedor_idx
  on public.cp_comprobantes (guarderia_id, proveedor_id);
create index if not exists cp_comprobantes_estado_idx
  on public.cp_comprobantes (guarderia_id, estado);

-- Historial de cambios de estado ----------------------------------------------

create table if not exists public.cp_comprobantes_historial (
  id             uuid primary key default gen_random_uuid(),
  guarderia_id   uuid not null references public.guarderias(id) on delete cascade,
  comprobante_id uuid not null references public.cp_comprobantes(id) on delete cascade,
  estado_desde   text,
  estado_hasta   text not null,
  usuario_id     uuid references public.profiles(id) on delete set null,
  detalle        text,
  created_at     timestamptz not null default now()
);
create index if not exists cp_comprobantes_historial_idx
  on public.cp_comprobantes_historial (comprobante_id, created_at);

-- RLS: solo el administrador del club lee; las escrituras van por el web (Drizzle) -------

do $$
declare
  t text;
begin
  foreach t in array array['cp_comprobantes', 'cp_comprobantes_historial']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_admin', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_guarderia_admin(guarderia_id) or public.is_super_admin())',
      t || '_select_admin', t
    );
  end loop;
end $$;
