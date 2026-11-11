-- =============================================================================
-- 0172 — Legajo del personal.
--
-- Módulo administrativo (solo admins del club) que centraliza la historia laboral
-- de cada empleado desde el ingreso hasta el egreso: datos personales, laboral,
-- seguridad social, financieros, educación y familia, documentación, licencias,
-- vacaciones y horas trabajadas.
--
-- DECISIÓN DE DISEÑO: el legajo es una ENTIDAD PROPIA (`empleados`), scopeada por
-- guardería, con un vínculo OPCIONAL a un usuario existente (`profile_id`). NO se
-- guarda en `profiles` por cuatro motivos:
--   1) `profiles` es global (una fila por cuenta) y sus policies dejan a los
--      miembros de un club leer los perfiles de los demás: ahí no pueden vivir
--      CUIL, CBU, salud ni grupo familiar.
--   2) No todo el personal tiene usuario (limpieza, mantenimiento, personal de
--      temporada que nunca abre la app), y no todo usuario es personal (socios).
--   3) Una persona puede trabajar en dos clubes: cada club tiene su propio legajo,
--      con su puesto, sueldo-datos y documentación. `profiles` no es por club.
--   4) El legajo tiene que conservarse aunque la cuenta se elimine o el empleado
--      se dé de baja (registro laboral obligatorio): el ciclo de vida de la
--      cuenta y el del legajo son distintos.
--   Cuando hay usuario vinculado, el legajo y la cuenta siguen siendo
--   independientes: vincular solo sirve para reconocer a la persona y, a pedido,
--   copiar nombre, email y teléfono (una sola vez, no se sincroniza).
--
-- Seguridad: todas las tablas tienen RLS activo y SELECT solo para el admin del
-- club. Las escrituras las hace el web con Drizzle (server actions con rol admin
-- y scope por guarderia_id). Los adjuntos van al bucket privado `documentos` bajo
-- legajos/<guarderia_id>/<empleado_id>/ y se entregan con links firmados.
--
-- Tablas nuevas: no cambia nada para el código anterior. Idempotente.
-- =============================================================================

-- 1) empleados -----------------------------------------------------------------

create table if not exists public.empleados (
  id                   uuid primary key default gen_random_uuid(),
  guarderia_id         uuid not null references public.guarderias(id) on delete cascade,
  numero               integer not null,
  profile_id           uuid references public.profiles(id) on delete set null,

  -- Datos personales
  nombre               text not null,
  apellido             text not null,
  tipo_documento       text not null default 'dni',
  nro_documento        text not null,
  cuil_cuit            text,
  fecha_nacimiento     date,
  genero               text,
  direccion            text,
  localidad            text,
  provincia            text,
  telefono             text,
  email                text,

  -- Laboral y contratación
  fecha_ingreso        date not null,
  fecha_ingreso_arca   date,
  tipo_contratacion    text,
  puesto               text,
  tareas               text,
  area                 text,
  sedes                text[] not null default '{}',
  ubicaciones          text[] not null default '{}',
  bienes_uso           text[] not null default '{}',
  convenio             text,
  categoria            text,
  estado               text not null default 'activo',
  fecha_egreso         date,
  motivo_egreso        text,

  -- Seguridad social, salud y seguros
  obra_social          text,
  art                  text,
  apto_medico          boolean not null default false,
  fecha_ultimo_examen  date,

  -- Datos financieros
  banco                text,
  cbu                  text,
  tipo_cuenta          text,

  -- Educación y estado civil
  nivel_educativo      text,
  estado_educativo     text,
  estado_civil         text,

  notas                text,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_by           uuid references public.profiles(id) on delete set null,
  updated_at           timestamptz not null default now(),

  constraint empleados_tipo_documento_check check (tipo_documento in ('dni', 'pasaporte', 'cedula')),
  constraint empleados_genero_check check (genero is null or genero in ('masculino', 'femenino', 'no_binario_otro')),
  constraint empleados_estado_check check (estado in ('activo', 'licencia', 'suspendido', 'baja')),
  constraint empleados_tipo_cuenta_check check (
    tipo_cuenta is null or tipo_cuenta in ('caja_ahorro_sueldo', 'caja_ahorro_comun', 'cuenta_corriente')
  ),
  constraint empleados_nivel_educativo_check check (
    nivel_educativo is null or nivel_educativo in ('secundario', 'terciario', 'universitario', 'posgrado')
  ),
  constraint empleados_estado_educativo_check check (
    estado_educativo is null or estado_educativo in ('completo', 'incompleto')
  ),
  constraint empleados_estado_civil_check check (
    estado_civil is null
    or estado_civil in ('soltero', 'casado', 'divorciado', 'viudo', 'union_convivencial')
  ),
  constraint empleados_egreso_check check (fecha_egreso is null or fecha_egreso >= fecha_ingreso)
);

-- Correlativo por club (el "ID de empleado" que se muestra como Legajo Nº).
create unique index if not exists empleados_numero_unico
  on public.empleados (guarderia_id, numero);

-- La misma persona no se carga dos veces en el mismo club.
create unique index if not exists empleados_documento_unico
  on public.empleados (guarderia_id, tipo_documento, nro_documento);

-- Un usuario del sistema se vincula a un solo legajo por club.
create unique index if not exists empleados_profile_unico
  on public.empleados (guarderia_id, profile_id)
  where profile_id is not null;

create index if not exists empleados_guarderia_estado_idx
  on public.empleados (guarderia_id, estado);

comment on table public.empleados is
  'Legajo del personal del club. Entidad propia (no vive en profiles); profile_id es un vínculo opcional a un usuario existente.';

-- 2) Reporta a (varios jefes posibles) ----------------------------------------

create table if not exists public.empleado_reporta_a (
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  jefe_id      uuid not null references public.empleados(id) on delete cascade,
  guarderia_id uuid not null references public.guarderias(id) on delete cascade,
  primary key (empleado_id, jefe_id),
  constraint empleado_reporta_a_distintos check (empleado_id <> jefe_id)
);

create index if not exists empleado_reporta_a_jefe_idx on public.empleado_reporta_a (jefe_id);

-- 3) Horario laboral previsto (por día de la semana) --------------------------

create table if not exists public.empleado_horarios (
  id           uuid primary key default gen_random_uuid(),
  guarderia_id uuid not null references public.guarderias(id) on delete cascade,
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  dia          smallint not null,
  desde        time not null,
  hasta        time not null,
  tipo_hora    text not null default 'normal',
  constraint empleado_horarios_dia_check check (dia between 1 and 7),
  constraint empleado_horarios_rango_check check (desde <> hasta)
);

create index if not exists empleado_horarios_empleado_idx on public.empleado_horarios (empleado_id, dia);

-- 4) Grupo familiar ------------------------------------------------------------

create table if not exists public.empleado_familiares (
  id                    uuid primary key default gen_random_uuid(),
  guarderia_id          uuid not null references public.guarderias(id) on delete cascade,
  empleado_id           uuid not null references public.empleados(id) on delete cascade,
  parentesco            text not null,
  nombre                text not null,
  apellido              text not null,
  nro_documento         text,
  fecha_nacimiento      date,
  a_cargo               boolean not null default true,
  asignacion_familiar   boolean not null default false,
  extension_obra_social boolean not null default false,
  observaciones         text,
  created_at            timestamptz not null default now(),
  constraint empleado_familiares_parentesco_check check (
    parentesco in ('hijo', 'conyuge', 'conviviente', 'otro')
  )
);

create index if not exists empleado_familiares_empleado_idx on public.empleado_familiares (empleado_id);

-- 5) Documentación y adjuntos (un registro por tipo de documento) -------------

create table if not exists public.empleado_documentos (
  id             uuid primary key default gen_random_uuid(),
  guarderia_id   uuid not null references public.guarderias(id) on delete cascade,
  empleado_id    uuid not null references public.empleados(id) on delete cascade,
  tipo           text not null,
  posee          boolean not null default false,
  vencimiento    date,
  archivo_path   text,
  archivo_nombre text,
  updated_at     timestamptz not null default now(),
  constraint empleado_documentos_unico unique (empleado_id, tipo)
);

-- 6) Vacaciones ----------------------------------------------------------------

create table if not exists public.empleado_vacaciones_anuales (
  id           uuid primary key default gen_random_uuid(),
  guarderia_id uuid not null references public.guarderias(id) on delete cascade,
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  anio         integer not null,
  dias_totales integer not null default 0,
  constraint empleado_vacaciones_anuales_unico unique (empleado_id, anio),
  constraint empleado_vacaciones_anuales_dias_check check (dias_totales >= 0)
);

create table if not exists public.empleado_vacaciones_tomadas (
  id           uuid primary key default gen_random_uuid(),
  guarderia_id uuid not null references public.guarderias(id) on delete cascade,
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  anio         integer not null,
  desde        date not null,
  hasta        date not null,
  dias         integer not null,
  nota         text,
  created_at   timestamptz not null default now(),
  constraint empleado_vacaciones_tomadas_rango_check check (hasta >= desde),
  constraint empleado_vacaciones_tomadas_dias_check check (dias > 0)
);

create index if not exists empleado_vacaciones_tomadas_empleado_idx
  on public.empleado_vacaciones_tomadas (empleado_id, anio);

-- 7) Licencias (historial) -----------------------------------------------------

create table if not exists public.empleado_licencias (
  id                      uuid primary key default gen_random_uuid(),
  guarderia_id            uuid not null references public.guarderias(id) on delete cascade,
  empleado_id             uuid not null references public.empleados(id) on delete cascade,
  tipo                    text not null,
  fecha_alta              date not null,
  fecha_incorporacion     date,
  motivo                  text,
  certificado_path        text,
  certificado_nombre      text,
  aprobador_empleado_id   uuid references public.empleados(id) on delete set null,
  aprobador_profile_id    uuid references public.profiles(id) on delete set null,
  created_by              uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  constraint empleado_licencias_fechas_check check (
    fecha_incorporacion is null or fecha_incorporacion >= fecha_alta
  ),
  constraint empleado_licencias_un_aprobador check (
    aprobador_empleado_id is null or aprobador_profile_id is null
  )
);

create index if not exists empleado_licencias_empleado_idx on public.empleado_licencias (empleado_id, fecha_alta desc);

-- 8) Horas trabajadas y novedades ---------------------------------------------

create table if not exists public.empleado_horas (
  id           uuid primary key default gen_random_uuid(),
  guarderia_id uuid not null references public.guarderias(id) on delete cascade,
  empleado_id  uuid not null references public.empleados(id) on delete cascade,
  fecha        date not null,
  desde        time,
  hasta        time,
  horas        numeric(5, 2) not null default 0,
  tipo_hora    text not null default 'normal',
  novedad      text not null default 'trabajado',
  nota         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint empleado_horas_novedad_check check (
    novedad in ('trabajado', 'enfermedad', 'licencia', 'vacaciones', 'ausencia', 'feriado')
  ),
  constraint empleado_horas_horas_check check (horas >= 0 and horas <= 24)
);

create index if not exists empleado_horas_empleado_fecha_idx on public.empleado_horas (empleado_id, fecha);
create index if not exists empleado_horas_guarderia_fecha_idx on public.empleado_horas (guarderia_id, fecha);

-- 9) Historial de cambios (respaldo: quién cambió qué y cuándo) ---------------

create table if not exists public.empleado_historial (
  id             uuid primary key default gen_random_uuid(),
  guarderia_id   uuid not null references public.guarderias(id) on delete cascade,
  empleado_id    uuid not null references public.empleados(id) on delete cascade,
  campo          text not null,
  valor_anterior text,
  valor_nuevo    text,
  cambiado_por   uuid references public.profiles(id) on delete set null,
  cambiado_en    timestamptz not null default now()
);

create index if not exists empleado_historial_empleado_idx on public.empleado_historial (empleado_id, cambiado_en desc);

-- 10) Listas desplegables que el club arma sobre la marcha --------------------

create table if not exists public.legajo_catalogo (
  id           uuid primary key default gen_random_uuid(),
  guarderia_id uuid not null references public.guarderias(id) on delete cascade,
  tipo         text not null,
  valor        text not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint legajo_catalogo_unico unique (guarderia_id, tipo, valor)
);

-- RLS: solo el admin del club lee; las escrituras van por el web (Drizzle) ------

do $$
declare
  t text;
begin
  foreach t in array array[
    'empleados', 'empleado_reporta_a', 'empleado_horarios', 'empleado_familiares',
    'empleado_documentos', 'empleado_vacaciones_anuales', 'empleado_vacaciones_tomadas',
    'empleado_licencias', 'empleado_horas', 'empleado_historial', 'legajo_catalogo'
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
