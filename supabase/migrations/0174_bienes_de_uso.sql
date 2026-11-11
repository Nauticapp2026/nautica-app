-- 0174 · Bienes de uso (maquinarias, camionetas, grúas…)
--
-- Tablas nuevas, todas scopeadas por `guarderia_id`. Solo el administrador del club las lee
-- (RLS); las escrituras van por el web (Drizzle). Los adjuntos (comprobante del seguro,
-- comprobantes de reparaciones e inspecciones) van al bucket privado `documentos`, bajo
-- `bienes/<club>/<bien>/`.

-- 1) El bien -------------------------------------------------------------------

create table if not exists public.bienes_uso (
  id                   uuid primary key default gen_random_uuid(),
  guarderia_id         uuid not null references public.guarderias(id) on delete cascade,
  -- Next number automático por club.
  numero               integer not null,
  fecha_incorporacion  date not null,
  estado               text not null default 'activo',
  estado_detalle       text,
  forma_adquisicion    text,
  tipo_bien            text,
  rubro                text,
  subrubro             text,
  nro_guarderia        text,
  nombre               text not null,
  marca                text,
  nro_serie            text,
  anio_fabricacion     integer,
  patente              text,
  ubicaciones          text[] not null default '{}',
  lugares_utilizacion  text[] not null default '{}',
  -- true = el bien no tiene horario de utilización (botón "No aplica")
  horario_no_aplica    boolean not null default false,
  seguro_aseguradora   text,
  seguro_poliza        text,
  seguro_vencimiento   date,
  seguro_detalle       text,
  seguro_archivo_path  text,
  seguro_archivo_nombre text,
  -- baja
  fecha_baja           date,
  motivo_baja          text,
  motivo_baja_detalle  text,
  -- datos contables para amortización (lineal)
  vida_util_anios      integer,
  valor_origen         numeric(16,2),
  moneda               text not null default 'ARS',
  fecha_inicio_amortizacion date,
  valor_residual       numeric(16,2) not null default 0,
  -- mantenimiento: a quién le llegan los avisos de los planes preventivos
  mantenimiento_emails text[] not null default '{}',
  notas                text,
  created_by           uuid references public.profiles(id) on delete set null,
  updated_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint bienes_uso_estado_check
    check (estado in ('activo', 'inactivo', 'en_reparacion', 'otro')),
  constraint bienes_uso_adquisicion_check
    check (forma_adquisicion is null or forma_adquisicion in ('propia', 'alquilado', 'leasing', 'donacion', 'otro')),
  constraint bienes_uso_anio_check
    check (anio_fabricacion is null or (anio_fabricacion >= 1900 and anio_fabricacion <= 2100)),
  constraint bienes_uso_vida_util_check
    check (vida_util_anios is null or (vida_util_anios >= 1 and vida_util_anios <= 100)),
  constraint bienes_uso_valores_check
    check ((valor_origen is null or valor_origen >= 0) and valor_residual >= 0
           and (valor_origen is null or valor_residual <= valor_origen)),
  constraint bienes_uso_baja_check
    check (fecha_baja is null or fecha_baja >= fecha_incorporacion)
);
create unique index if not exists bienes_uso_numero_unico on public.bienes_uso (guarderia_id, numero);
create index if not exists bienes_uso_club_idx on public.bienes_uso (guarderia_id, estado);

-- 2) Horario de utilización (días y franjas) -----------------------------------

create table if not exists public.bien_uso_horarios (
  id           uuid primary key default gen_random_uuid(),
  guarderia_id uuid not null references public.guarderias(id) on delete cascade,
  bien_id      uuid not null references public.bienes_uso(id) on delete cascade,
  dia          smallint not null check (dia between 1 and 7),
  desde        time not null,
  hasta        time not null
);
create index if not exists bien_uso_horarios_bien_idx on public.bien_uso_horarios (bien_id);

-- 3) Empleados autorizados y responsables de mantenimiento ----------------------

create table if not exists public.bien_uso_empleados (
  bien_id      uuid not null references public.bienes_uso(id) on delete cascade,
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  guarderia_id uuid not null references public.guarderias(id) on delete cascade,
  rol          text not null check (rol in ('autorizado', 'mantenimiento')),
  primary key (bien_id, empleado_id, rol)
);

-- 4) Planes de mantenimiento preventivo ----------------------------------------

create table if not exists public.bien_uso_planes (
  id               uuid primary key default gen_random_uuid(),
  guarderia_id     uuid not null references public.guarderias(id) on delete cascade,
  bien_id          uuid not null references public.bienes_uso(id) on delete cascade,
  descripcion      text not null,
  frecuencia_tipo  text not null check (frecuencia_tipo in ('dias', 'meses', 'horas')),
  frecuencia_valor integer not null check (frecuencia_valor > 0),
  proxima_fecha    date,
  ultima_fecha     date,
  activo           boolean not null default true,
  notas            text,
  created_at       timestamptz not null default now()
);
create index if not exists bien_uso_planes_bien_idx on public.bien_uso_planes (bien_id);
create index if not exists bien_uso_planes_proxima_idx on public.bien_uso_planes (proxima_fecha) where activo;

-- Avisos por mail ya enviados: evita repetir el mismo aviso si el cron corre dos veces.
create table if not exists public.bien_uso_avisos (
  plan_id          uuid not null references public.bien_uso_planes(id) on delete cascade,
  fecha_programada date not null,
  etapa            text not null check (etapa in ('previo', 'dia')),
  enviado_en       timestamptz not null default now(),
  primary key (plan_id, fecha_programada, etapa)
);

-- 5) Intervenciones (reparaciones y mantenimientos hechos) ----------------------

create table if not exists public.bien_uso_intervenciones (
  id             uuid primary key default gen_random_uuid(),
  guarderia_id   uuid not null references public.guarderias(id) on delete cascade,
  bien_id        uuid not null references public.bienes_uso(id) on delete cascade,
  fecha          date not null,
  tipo           text,
  descripcion    text,
  repuestos      text,
  proveedor_id   uuid references public.proveedores(id) on delete set null,
  costo          numeric(16,2) check (costo is null or costo >= 0),
  moneda         text not null default 'ARS',
  plan_id        uuid references public.bien_uso_planes(id) on delete set null,
  archivo_path   text,
  archivo_nombre text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists bien_uso_interv_bien_idx on public.bien_uso_intervenciones (bien_id, fecha desc);

-- 6) Historial de fallas --------------------------------------------------------

create table if not exists public.bien_uso_fallas (
  id                uuid primary key default gen_random_uuid(),
  guarderia_id      uuid not null references public.guarderias(id) on delete cascade,
  bien_id           uuid not null references public.bienes_uso(id) on delete cascade,
  fecha             date not null,
  tipo              text,
  descripcion       text,
  accion_correctiva text,
  fecha_resolucion  date,
  created_at        timestamptz not null default now(),
  constraint bien_uso_fallas_resolucion_check check (fecha_resolucion is null or fecha_resolucion >= fecha)
);
create index if not exists bien_uso_fallas_bien_idx on public.bien_uso_fallas (bien_id, fecha desc);

-- 7) Insumos y cambios periódicos -----------------------------------------------

create table if not exists public.bien_uso_insumos (
  id               uuid primary key default gen_random_uuid(),
  guarderia_id     uuid not null references public.guarderias(id) on delete cascade,
  bien_id          uuid not null references public.bienes_uso(id) on delete cascade,
  tipo             text not null,
  descripcion      text,
  ultimo_cambio    date,
  frecuencia_valor integer check (frecuencia_valor is null or frecuencia_valor > 0),
  frecuencia_tipo  text check (frecuencia_tipo is null or frecuencia_tipo in ('dias', 'meses', 'horas')),
  notas            text,
  created_at       timestamptz not null default now()
);
create index if not exists bien_uso_insumos_bien_idx on public.bien_uso_insumos (bien_id);

-- 8) Inspecciones ----------------------------------------------------------------

create table if not exists public.bien_uso_inspecciones (
  id             uuid primary key default gen_random_uuid(),
  guarderia_id   uuid not null references public.guarderias(id) on delete cascade,
  bien_id        uuid not null references public.bienes_uso(id) on delete cascade,
  fecha          date not null,
  tipo           text,
  resultado      text not null default 'ok' check (resultado in ('ok', 'observado', 'no_apto')),
  inspector      text,
  observaciones  text,
  archivo_path   text,
  archivo_nombre text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists bien_uso_inspec_bien_idx on public.bien_uso_inspecciones (bien_id, fecha desc);

-- 9) RLS: solo el administrador del club lee -------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'bienes_uso', 'bien_uso_horarios', 'bien_uso_empleados', 'bien_uso_planes',
    'bien_uso_intervenciones', 'bien_uso_fallas', 'bien_uso_insumos', 'bien_uso_inspecciones'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_admin', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_guarderia_admin(guarderia_id) or public.is_super_admin())',
      t || '_select_admin', t
    );
  end loop;
end $$;

-- bien_uso_avisos no tiene guarderia_id: solo la toca el cron (service role). RLS activada
-- sin policies = ningún usuario la lee.
alter table public.bien_uso_avisos enable row level security;
