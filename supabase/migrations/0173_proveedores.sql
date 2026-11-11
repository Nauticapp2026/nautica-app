-- 0173 · Maestro de proveedores
--
-- La tabla `proveedores` ya existía (mig 0088) pero estaba vacía y ninguna pantalla ni la app
-- mobile la usaba, así que se AMPLÍA en vez de crear otra. Es aditivo: no se borra ni se
-- renombra ninguna columna.
--
--  - `nombre`  pasa a ser la Razón social / nombre legal (sigue NOT NULL).
--  - `email`   es el correo de facturación; `telefono` es el teléfono / celular.
--  - `apellido`, `profile_id` y `categoria` quedan sin uso (heredados).
--
-- Es información sensible (CUIT, CBU, retenciones): la policy vieja dejaba leer a cualquier
-- miembro del club; ahora solo la ve el administrador del club. Las escrituras van por el web
-- (Drizzle), que no pasa por RLS.

-- 1) Columnas nuevas ---------------------------------------------------------

alter table public.proveedores
  add column if not exists numero              integer,
  add column if not exists codigo              text,
  add column if not exists nombre_comercial    text,
  add column if not exists tipo_sujeto         text,
  add column if not exists area_sector         text,
  -- fiscal (mismos datos que los Datos Impositivos del socio)
  add column if not exists cuit                text,
  add column if not exists condicion_iva       public.condicion_frente_iva,
  add column if not exists condicion_iibb      public.condicion_iibb,
  add column if not exists actividades         text[] not null default '{}',
  add column if not exists retenciones         text[] not null default '{}',
  add column if not exists certificado_retencion boolean not null default false,
  add column if not exists cert_ret_desde      date,
  add column if not exists cert_ret_hasta      date,
  add column if not exists cert_ret_porcentaje numeric(5,2),
  -- ubicación
  add column if not exists dir_fiscal_calle    text,
  add column if not exists dir_fiscal_numero   text,
  add column if not exists dir_fiscal_interior text,
  add column if not exists dir_comercial_calle    text,
  add column if not exists dir_comercial_numero   text,
  add column if not exists dir_comercial_interior text,
  add column if not exists codigo_postal       text,
  add column if not exists ciudad              text,
  add column if not exists provincia           text,
  add column if not exists pais                text not null default 'Argentina',
  -- contable y financiero
  add column if not exists cuentas_contables   text[] not null default '{}',
  add column if not exists moneda              text not null default 'ARS',
  add column if not exists condicion_pago      text,
  add column if not exists forma_pago          text,
  -- contacto
  add column if not exists contacto_nombre     text,
  add column if not exists notas               text,
  add column if not exists created_by          uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by          uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at          timestamptz not null default now();

alter table public.proveedores drop constraint if exists proveedores_tipo_sujeto_check;
alter table public.proveedores add constraint proveedores_tipo_sujeto_check
  check (tipo_sujeto is null or tipo_sujeto in ('persona_fisica', 'srl', 'sa', 'sas', 'otro'));

alter table public.proveedores drop constraint if exists proveedores_cert_ret_check;
alter table public.proveedores add constraint proveedores_cert_ret_check
  check (
    (cert_ret_hasta is null or cert_ret_desde is null or cert_ret_hasta >= cert_ret_desde)
    and (cert_ret_porcentaje is null or (cert_ret_porcentaje >= 0 and cert_ret_porcentaje <= 100))
  );

-- Código y CUIT únicos dentro del club (un mismo CUIT puede ser proveedor de dos clubes).
create unique index if not exists proveedores_numero_unico
  on public.proveedores (guarderia_id, numero) where numero is not null;
create unique index if not exists proveedores_codigo_unico
  on public.proveedores (guarderia_id, lower(codigo)) where codigo is not null;
create unique index if not exists proveedores_cuit_unico
  on public.proveedores (guarderia_id, cuit) where cuit is not null;

-- 2) Cuentas bancarias (varias por proveedor) --------------------------------

create table if not exists public.proveedor_cuentas_bancarias (
  id            uuid primary key default gen_random_uuid(),
  guarderia_id  uuid not null references public.guarderias(id) on delete cascade,
  proveedor_id  uuid not null references public.proveedores(id) on delete cascade,
  banco         text,
  tipo_cuenta   text,
  nro_cuenta    text,
  cbu           text,
  alias         text,
  titular       text,
  observaciones text,
  created_at    timestamptz not null default now()
);
create index if not exists proveedor_cuentas_prov_idx on public.proveedor_cuentas_bancarias (proveedor_id);

-- 3) Documentación del proveedor ---------------------------------------------
-- Dos usos en la misma tabla:
--  · clave = 'legajo_impositivo' | 'cert_retencion': los dos adjuntos fijos de la pestaña fiscal
--    (uno de cada uno por proveedor).
--  · clave null: un requisito que el proveedor debe presentar para ingresar a trabajar al
--    recinto (los que el club enumere), con su vencimiento y archivo opcionales.

create table if not exists public.proveedor_documentos (
  id             uuid primary key default gen_random_uuid(),
  guarderia_id   uuid not null references public.guarderias(id) on delete cascade,
  proveedor_id   uuid not null references public.proveedores(id) on delete cascade,
  clave          text,
  requisito      text not null,
  obligatorio    boolean not null default true,
  presentado     boolean not null default false,
  vencimiento    date,
  archivo_path   text,
  archivo_nombre text,
  notas          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint proveedor_documentos_clave_check
    check (clave is null or clave in ('legajo_impositivo', 'cert_retencion'))
);
create index if not exists proveedor_docs_prov_idx on public.proveedor_documentos (proveedor_id);
create unique index if not exists proveedor_docs_clave_unica
  on public.proveedor_documentos (proveedor_id, clave) where clave is not null;

-- 4) RLS: solo el administrador del club lee ----------------------------------

drop policy if exists "proveedores_member_select" on public.proveedores;
drop policy if exists "proveedores_admin_write" on public.proveedores;

do $$
declare
  t text;
begin
  foreach t in array array['proveedores', 'proveedor_cuentas_bancarias', 'proveedor_documentos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_admin', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_guarderia_admin(guarderia_id) or public.is_super_admin())',
      t || '_select_admin', t
    );
  end loop;
end $$;
