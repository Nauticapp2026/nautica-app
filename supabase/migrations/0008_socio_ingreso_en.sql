-- =============================================================================
-- Columna `socio_ingreso_en` en porteria.
--
-- El rol seguridad necesita registrar cuándo confirmó el ingreso del socio al
-- club, igual que ya registra el ingreso de cada invitado en
-- `porteria_invitados.ingreso_en`. Hoy el socio no tiene su propio bridge en
-- `porteria_invitados`, así que el ingreso se guarda en una columna nueva
-- de `porteria`.
--
-- Mobile: el escáner intentará primero matchear el UUID contra
-- `porteria_invitados.id` (caso invitado) y, si no encuentra, contra
-- `porteria.id` (caso socio). En el segundo caso, la pantalla de confirmación
-- setea `socio_ingreso_en`.
--
-- NULL = el socio aún no ingresó al club. Esta migración agrega solo el
-- schema; las policies SELECT del rol seguridad sobre `porteria` ya están
-- (mig 0007), y `porteria_invitados_update_seguridad` cubre updates a
-- invitados — para updates a esta columna nueva, agregamos también una
-- policy puntual de UPDATE en porteria limitada a la columna nueva via
-- aplicación (no se puede limitar UPDATE a columna específica con RLS;
-- la app debe enviar solo este campo).
--
-- Idempotente.
-- =============================================================================

-- 1) Columna socio_ingreso_en --------------------------------------------------

alter table public.porteria
  add column if not exists socio_ingreso_en timestamptz;

comment on column public.porteria.socio_ingreso_en is
  'Cuándo el rol seguridad confirmó el ingreso del socio al club. NULL = aún no ingresó. Análogo a porteria_invitados.ingreso_en pero para el socio dueño de la salida.';

-- 2) Policy UPDATE en porteria para rol seguridad ------------------------------
--
-- Permite al rol seguridad actualizar porterías de su club. La intención es
-- únicamente setear `socio_ingreso_en` desde la app mobile; Postgres no permite
-- limitar UPDATE a una columna concreta vía RLS, así que el alcance de columna
-- se enforce en el cliente (la app solo envía `socio_ingreso_en`). Las policies
-- de UPDATE para socio dueño y admin no se tocan; RLS evalúa por OR.

drop policy if exists "porteria_update_seguridad" on public.porteria;
create policy "porteria_update_seguridad"
  on public.porteria
  for update
  to authenticated
  using (public.is_guarderia_seguridad(guarderia_id))
  with check (public.is_guarderia_seguridad(guarderia_id));
