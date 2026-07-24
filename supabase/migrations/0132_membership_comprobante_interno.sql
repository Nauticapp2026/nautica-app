-- Tilde "Comprobante interno" por socio (pestaña Datos Impositivos del
-- perfil): define el DEFAULT del toggle Interno/Fiscal al cargarle un
-- servicio (Cargar Servicio). No cambia contratos existentes — solo el
-- valor con el que arranca el modal.

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS comprobante_interno boolean NOT NULL DEFAULT false;
