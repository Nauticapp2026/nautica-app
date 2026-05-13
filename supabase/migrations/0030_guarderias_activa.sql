-- =============================================================================
-- Estado de activación de la guardería a nivel plataforma.
--   activa = true  → los usuarios de la guardería pueden ingresar al dashboard.
--   activa = false → todos los usuarios reciben una pantalla "guardería pendiente
--                    de activación" en lugar del dashboard. El super_admin sigue
--                    pudiendo ver/operar todo desde el panel de plataforma.
-- Por defecto las guarderías nuevas (alta vía /onboarding) arrancan en false.
-- Las que ya existían cuando se aplica esta migración se backfillean en true
-- para no bloquear a clientes en producción.
-- =============================================================================

alter table public.guarderias
  add column if not exists activa boolean not null default false;

update public.guarderias set activa = true where activa = false;
