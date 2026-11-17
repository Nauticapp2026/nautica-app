-- 0180 · Circuito de pagos (órdenes de pago a proveedores)
--
-- Aditivo. Depende de 0179 (cp_comprobantes).
--
--  · cp_pagos: una orden de pago (OP) con su Next Number por club. Paga comprobantes en
--    estado A (tipo = 'comprobantes') o es un anticipo a un proveedor (tipo = 'anticipo'),
--    que genera un comprobante de origen 'anticipo' con saldo a favor para aplicar después.
--  · cp_pago_aplicaciones: qué parte de cada comprobante cancela el pago (y su descuento o
--    ajuste). El saldo de un comprobante = total − la suma de lo aplicado por pagos vigentes.
--    Al anular un pago las aplicaciones quedan como historial y dejan de contar.
--  · cp_pago_medios: con qué instrumentos se pagó (uno o varios), con sus datos específicos.

create table if not exists public.cp_pagos (
  id                 uuid primary key default gen_random_uuid(),
  guarderia_id       uuid not null references public.guarderias(id) on delete cascade,
  -- Número de orden de pago: correlativo por club (se muestra como OP-000001).
  numero             integer not null,
  proveedor_id       uuid not null references public.proveedores(id) on delete restrict,
  tipo               text not null default 'comprobantes',
  fecha_pago         date not null,
  moneda             text not null default 'PES',
  tipo_cambio        numeric(14,4),
  -- Lo que cancela el pago en comprobantes (neto de compensaciones, antes de descuentos).
  monto_comprobantes numeric(14,2) not null default 0,
  -- Lo que efectivamente salió por los instrumentos de pago.
  monto_pagado       numeric(14,2) not null,
  observaciones      text,
  estado             text not null default 'pagado',
  anulado_at         timestamptz,
  anulado_por        uuid references public.profiles(id) on delete set null,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint cp_pagos_tipo_check check (tipo in ('comprobantes', 'anticipo')),
  constraint cp_pagos_estado_check check (estado in ('pagado', 'anulado')),
  constraint cp_pagos_moneda_check check (moneda in ('PES', 'DOL')),
  constraint cp_pagos_monto_check check (monto_pagado >= 0),
  constraint cp_pagos_tc_check
    check (moneda = 'PES' or (tipo_cambio is not null and tipo_cambio > 0))
);
create unique index if not exists cp_pagos_numero_unico
  on public.cp_pagos (guarderia_id, numero);
create index if not exists cp_pagos_proveedor_idx
  on public.cp_pagos (guarderia_id, proveedor_id);

create table if not exists public.cp_pago_aplicaciones (
  id              uuid primary key default gen_random_uuid(),
  guarderia_id    uuid not null references public.guarderias(id) on delete cascade,
  pago_id         uuid not null references public.cp_pagos(id) on delete cascade,
  comprobante_id  uuid not null references public.cp_comprobantes(id) on delete restrict,
  -- Cuánto del saldo del comprobante cancela este pago (siempre positivo; el signo lo da el tipo).
  monto_aplicado  numeric(14,2) not null,
  -- Descuento (+) o recargo / diferencia de cambio (−) sobre esa línea; solo FC y ND.
  descuento_ajuste numeric(14,2) not null default 0,
  -- Saldo del comprobante antes de este pago (para la consulta del pago).
  saldo_previo    numeric(14,2) not null,
  constraint cp_pago_aplicaciones_monto_check check (monto_aplicado > 0)
);
create index if not exists cp_pago_aplicaciones_pago_idx on public.cp_pago_aplicaciones (pago_id);
create index if not exists cp_pago_aplicaciones_comprobante_idx
  on public.cp_pago_aplicaciones (comprobante_id);

create table if not exists public.cp_pago_medios (
  id            uuid primary key default gen_random_uuid(),
  guarderia_id  uuid not null references public.guarderias(id) on delete cascade,
  pago_id       uuid not null references public.cp_pagos(id) on delete cascade,
  -- transferencia | cheque_propio | cheque_terceros | efectivo
  medio         text not null,
  monto         numeric(14,2) not null,
  datos         jsonb not null default '{}'::jsonb,
  orden         integer not null default 0,
  constraint cp_pago_medios_monto_check check (monto > 0),
  constraint cp_pago_medios_medio_check
    check (medio in ('transferencia', 'cheque_propio', 'cheque_terceros', 'efectivo'))
);
create index if not exists cp_pago_medios_pago_idx on public.cp_pago_medios (pago_id);

-- Un anticipo nace de una orden de pago.
alter table public.cp_comprobantes
  add column if not exists pago_origen_id uuid references public.cp_pagos(id) on delete restrict;

-- RLS: solo el administrador del club lee; las escrituras van por el web (Drizzle) -------

do $$
declare
  t text;
begin
  foreach t in array array['cp_pagos', 'cp_pago_aplicaciones', 'cp_pago_medios']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_admin', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_guarderia_admin(guarderia_id) or public.is_super_admin())',
      t || '_select_admin', t
    );
  end loop;
end $$;
