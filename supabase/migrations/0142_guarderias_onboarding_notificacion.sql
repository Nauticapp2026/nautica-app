-- Flag para no duplicar el mail interno de "club avanzó en el onboarding"
-- (pedido cliente 2026-08-12) si el usuario va y vuelve entre pasos del wizard.
ALTER TABLE guarderias
  ADD COLUMN onboarding_notificacion_enviada boolean NOT NULL DEFAULT false;
