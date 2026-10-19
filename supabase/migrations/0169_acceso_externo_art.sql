-- =============================================================================
-- 0169 — Acceso externo: el club puede exigir ART.
--
-- Pedido del cliente (2026-10-19): en la configuración del club, un check
-- "Solicitud de ART" con un espacio para la condición específica (ej: "Debe
-- incluir cláusula de no repetición a nombre de…"). Esa leyenda se muestra al
-- socio cuando crea el acceso externo y a la persona externa en el QR que recibe,
-- para que ya sepa que se lo van a pedir para ingresar.
--
-- acceso_externo_art: el club pide ART (default false: ningún club cambia de
--   conducta hasta que lo active).
-- acceso_externo_art_condicion: texto libre con la condición específica. Puede
--   quedar vacío (se pide ART sin condición adicional).
--
-- Solo agrega columnas con default: compatible con el código anterior (web y
-- mobile). La app mobile las lee con la policy de SELECT que ya tienen los
-- miembros sobre guarderias; la página pública del QR las lee con service role.
--
-- Idempotente.
-- =============================================================================

alter table public.guarderias
  add column if not exists acceso_externo_art boolean not null default false;

alter table public.guarderias
  add column if not exists acceso_externo_art_condicion text;

comment on column public.guarderias.acceso_externo_art is
  'El club pide ART a las personas que ingresan por acceso externo. Se avisa al socio al crear el acceso y al externo en su QR.';

comment on column public.guarderias.acceso_externo_art_condicion is
  'Condición específica de la ART (texto libre, opcional). Ej: Debe incluir cláusula de no repetición a nombre de…';
