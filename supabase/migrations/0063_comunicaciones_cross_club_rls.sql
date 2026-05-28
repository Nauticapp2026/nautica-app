-- =============================================================================
-- 0063 — Distribución cross-club de comunicaciones abiertas (novedades)
--
-- La policy existente (mig 0012) solo permite ver comunicaciones de guarderías
-- donde el user es miembro. Eso bloquea la feature de novedades abiertas:
-- un socio de club Premium o Esencial no puede ver las comunicaciones tipo
-- 'publica' que publicó un club Elite o Premium hacia toda la comunidad.
--
-- Reglas por plan:
--
--   Emisor Premium/Elite publica tipo='publica'
--   → La ven: socios Esencial, socios Premium, no socios.
--   → No la ven: socios Elite (tienen blindaje competitivo).
--
--   Emisor Esencial no puede publicar tipo='publica' (límite=0 en com_abierta),
--   así que no hay caso cross-club para ellos.
--
-- Implementación:
--   1. Función is_elite_socio() — true si el user tiene al menos una membership
--      activa como socio en un club Elite. Usada como condición de blindaje.
--   2. Policy "comunicaciones_select_cross_club_abierta" — se suma a la policy
--      existente "comunicaciones_select_member". En RLS, múltiples policies
--      SELECT se combinan con OR, así que la existente (tu propio club) no se
--      toca.
--
-- Idempotente.
-- =============================================================================

-- 1) Función helper -----------------------------------------------------------

create or replace function public.is_elite_socio()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    inner join public.guarderias g on g.id = m.guarderia_id
    where m.user_id = auth.uid()
      and m.rol = 'socio'
      and m.status = 'active'
      and g.plan = 'elite'
  );
$$;

-- 2) Policy cross-club -------------------------------------------------------

drop policy if exists "comunicaciones_select_cross_club_abierta" on public.comunicaciones;
create policy "comunicaciones_select_cross_club_abierta"
  on public.comunicaciones
  for select
  to authenticated
  using (
    -- Solo comunicaciones abiertas
    tipo = 'publica'
    -- El club emisor tiene plan que habilita com_abierta.
    -- Se usa guarderias_publicas (security_invoker=false) porque guarderias tiene
    -- RLS que solo muestra las guarderías donde el lector es miembro — lo que
    -- bloquearía ver el plan de clubes ajenos.
    and exists (
      select 1 from public.guarderias_publicas g
      where g.id = guarderia_id
        and g.plan in ('premium', 'elite')
    )
    -- El lector no está blindado (no es socio de ningún club Elite)
    and not public.is_elite_socio()
  );
