-- =============================================================================
-- 0042 — Términos y condiciones de la plataforma.
--
-- Modelo:
--
--   1) terminos_versiones
--        Tabla global (no scopeada por guardería). Una fila por versión
--        publicada de los T&C. La versión "vigente" es la de mayor `version`.
--        El contenido se guarda como texto markdown.
--        - Solo el super admin puede publicar (insert) o editar (update).
--        - SELECT público (anon + authenticated) para que la página /terminos
--          se pueda leer sin login.
--
--   2) terminos_aceptaciones
--        Histórico: cada vez que un user acepta una versión, queda una fila.
--        - El user solo ve y crea sus propias aceptaciones.
--        - El super admin ve todas (auditoría).
--        - Una aceptación es inmutable: no se pueden borrar ni editar (no hay
--          policies de delete/update para usuarios; solo el super admin si
--          alguna vez hace falta corregir manualmente).
--
-- Flujo:
--   - Usuario se registra (web onboarding o app mobile) → último paso muestra
--     T&C + checkbox obligatorio → al aceptar inserta una fila en
--     terminos_aceptaciones con la versión vigente.
--   - Si el super admin publica una nueva versión más adelante, el middleware
--     del web detecta que la última aceptación del user < versión vigente y
--     lo manda a /terminos/aceptar. Hasta que no acepte, no puede entrar al
--     dashboard. El super admin queda exceptuado (él publica las versiones).
--   - La app mobile hace su propio chequeo leyendo esta tabla.
--
-- Idempotente.
-- =============================================================================


-- 1) terminos_versiones ------------------------------------------------------

create table if not exists public.terminos_versiones (
  id             uuid primary key default gen_random_uuid(),
  version        integer not null unique,
  contenido      text not null,
  publicado_en   timestamptz not null default now(),
  publicado_por  uuid references public.profiles(id) on delete set null,
  constraint terminos_versiones_version_positiva check (version >= 1)
);

create index if not exists terminos_versiones_version_desc_idx
  on public.terminos_versiones (version desc);

comment on table public.terminos_versiones is
  'Versiones publicadas de los Términos y Condiciones. La vigente es la de mayor `version`.';

alter table public.terminos_versiones enable row level security;

drop policy if exists "terminos_versiones_select" on public.terminos_versiones;
create policy "terminos_versiones_select"
  on public.terminos_versiones
  for select
  to anon, authenticated
  using (true);

drop policy if exists "terminos_versiones_insert" on public.terminos_versiones;
create policy "terminos_versiones_insert"
  on public.terminos_versiones
  for insert
  to authenticated
  with check (public.is_super_admin());

drop policy if exists "terminos_versiones_update" on public.terminos_versiones;
create policy "terminos_versiones_update"
  on public.terminos_versiones
  for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "terminos_versiones_delete" on public.terminos_versiones;
create policy "terminos_versiones_delete"
  on public.terminos_versiones
  for delete
  to authenticated
  using (public.is_super_admin());


-- 2) terminos_aceptaciones ---------------------------------------------------

create table if not exists public.terminos_aceptaciones (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  version       integer not null,
  aceptado_en   timestamptz not null default now()
);

create index if not exists terminos_aceptaciones_user_idx
  on public.terminos_aceptaciones (user_id, aceptado_en desc);

create index if not exists terminos_aceptaciones_user_version_idx
  on public.terminos_aceptaciones (user_id, version);

comment on table public.terminos_aceptaciones is
  'Histórico de aceptaciones de T&C por usuario. Una fila por cada vez que un user acepta una versión.';

alter table public.terminos_aceptaciones enable row level security;

drop policy if exists "terminos_aceptaciones_select" on public.terminos_aceptaciones;
create policy "terminos_aceptaciones_select"
  on public.terminos_aceptaciones
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
  );

drop policy if exists "terminos_aceptaciones_insert" on public.terminos_aceptaciones;
create policy "terminos_aceptaciones_insert"
  on public.terminos_aceptaciones
  for insert
  to authenticated
  with check (user_id = auth.uid());


-- 3) Versión 1 — placeholder estructurado ------------------------------------
-- El cliente edita el texto definitivo desde /super-admin/terminos cuando lo
-- tenga listo. Cubre los 4 puntos pedidos:
--   - Autorización de uso de datos personales
--   - NauticaApp es plataforma tecnológica (no responsable de facturación)
--   - Política de contenido inapropiado
--   - Condiciones generales de uso

insert into public.terminos_versiones (version, contenido)
values (
  1,
  '# Términos y Condiciones de NauticApp

**Versión 1** — vigente desde la publicación.

## 1. Autorización de uso de datos personales

Al utilizar NauticApp, el usuario autoriza el tratamiento de sus datos personales (nombre, apellido, email, teléfono, documento, datos de embarcaciones y demás información cargada en la plataforma) para los fines de gestión de su cuenta, comunicación con su guardería náutica y operación de la plataforma. Los datos son almacenados de forma segura y no se comparten con terceros sin consentimiento, excepto cuando sea requerido por ley.

## 2. Naturaleza de la plataforma

NauticApp es una **plataforma tecnológica** que conecta guarderías náuticas con sus socios y facilita la operación interna del club. NauticApp **no es parte de la relación comercial** entre la guardería y sus socios. La facturación, los cobros, la prestación de servicios náuticos y el cumplimiento de obligaciones fiscales son responsabilidad exclusiva de cada guardería.

## 3. Política de contenido inapropiado

Está prohibido publicar, compartir o transmitir a través de NauticApp contenido que sea ofensivo, discriminatorio, difamatorio, ilegal, que infrinja derechos de terceros o que pueda considerarse spam. El incumplimiento puede derivar en la suspensión o eliminación de la cuenta sin previo aviso.

## 4. Condiciones generales de uso

- El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso.
- NauticApp puede actualizar estos términos en cualquier momento. Las actualizaciones serán notificadas y el usuario deberá aceptarlas para seguir usando la plataforma.
- El uso de la plataforma implica la aceptación plena de estos términos.
- En caso de disputa, se aplicará la legislación de la República Argentina.

---

Si tenés consultas, contactanos en soporte@nauticapp.club.'
)
on conflict (version) do nothing;
