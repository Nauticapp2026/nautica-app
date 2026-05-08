-- =============================================================================
-- Flag de certificado AFIP instalado para gating de facturación.
--
-- Después de "Solicitar certificado AFIP" (PR #79) tusfacturas manda
-- instrucciones por mail al admin. El admin tiene que seguirlas (instalar
-- el certificado en TF/AFIP) antes de poder emitir facturas reales.
-- Este flag indica si el admin confirmó la instalación.
--
-- Comportamiento:
--   - false (default): crearFacturaCore devuelve error y bloquea emisión
--     (manual y auto-emisión del cron).
--   - true: emisión habilitada.
--
-- Backfill: las guarderías que YA tienen POS configurado se asume que
-- estaban facturando bien antes de esta migration, así que se marcan
-- como ok = true automáticamente. Las que se den de alta de ahora en
-- adelante arrancan en false y tienen que solicitar + confirmar.
--
-- Idempotente.
-- =============================================================================

alter table public.guarderias
  add column if not exists certificado_afip_ok boolean not null default false;

-- Backfill: guarderías existentes con POS configurado quedan en true.
update public.guarderias
  set certificado_afip_ok = true
  where punto_de_venta is not null
    and certificado_afip_ok = false;

comment on column public.guarderias.certificado_afip_ok is
  'true = certificado AFIP instalado y confirmado por el admin → puede facturar. false = bloquea emisión hasta que se confirme.';
