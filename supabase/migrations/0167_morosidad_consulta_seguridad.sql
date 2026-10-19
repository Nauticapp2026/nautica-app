-- =============================================================================
-- 0167 — Morosidad: consulta para el rol seguridad (freno al escanear el QR).
--
-- Pedido del cliente (2026-10-19): si un socio moroso aparece en portería, que
-- seguridad lo frene al escanear su QR. La app mobile del guardia llama a esta
-- función con el socio que identificó el QR.
--
-- Usa socio_moroso_en_club (mig 0166): mismo criterio de mora que el bloqueo de
-- salidas y que el puntito rojo de Socios. Devuelve FALSE si el club no activó
-- el bloqueo (guarderias.dias_morosidad NULL).
--
-- Seguridad: socio_moroso_en_club es interna (no se le da a authenticated porque
-- contestaría por cualquier socio). Esta envoltura solo contesta si quien llama
-- es seguridad o admin DE ESE CLUB; para cualquier otro devuelve FALSE sin
-- revelar nada.
--
-- Idempotente.
-- =============================================================================

create or replace function public.socio_moroso_para_seguridad(p_socio uuid, p_guarderia uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_guarderia_seguridad(p_guarderia) or public.is_guarderia_admin(p_guarderia)
      then public.socio_moroso_en_club(p_socio, p_guarderia)
    else false
  end;
$$;

revoke all on function public.socio_moroso_para_seguridad(uuid, uuid) from public, anon;
grant execute on function public.socio_moroso_para_seguridad(uuid, uuid) to authenticated;
