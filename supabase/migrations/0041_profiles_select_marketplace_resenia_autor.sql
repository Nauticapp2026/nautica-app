-- =============================================================================
-- 0041 — Permitir SELECT en profiles a authenticated para autores de reseñas.
--
-- Motivo: la pantalla `/(tabs)/resenias/[id]` de la app mobile renderiza la
-- card de cada reseña con `nombre + apellido + avatar_url` del autor, vía
-- JOIN nested de PostgREST:
--
--   .from('marketplace_resenias')
--   .select('..., autor:autor_id(id, nombre, apellido, avatar_url)')
--
-- Las policies de SELECT en `profiles` hoy solo permiten:
--   - leer la fila propia
--   - leer a un miembro de tu misma guardería (admin/operario/seguridad)
--
-- El dueño de un marketplace_servicio NO necesariamente comparte guardería
-- con el autor de la reseña — la marketplace es cross-tenant. Sin una
-- policy extra, el join devuelve null y la card muestra "Usuario Nauticapp"
-- + ícono genérico.
--
-- Solución: policy que abre el SELECT solo para profiles que hayan escrito
-- al menos una reseña. Quien deja una reseña pública acepta implícitamente
-- ser identificado.
--
-- Nota de privacidad: la policy es a nivel fila — una vez evaluada, todas
-- las columnas son legibles vía API. El cliente mobile solo pide
-- nombre/apellido/avatar_url, pero email/telefono/numero_documento quedan
-- accesibles si alguien construye una query custom. Si esto se vuelve un
-- problema, migrar a una RPC `get_profile_lite(uuid) returns table(...)
-- security definer` y revertir esta policy.
--
-- Idempotente.
-- =============================================================================

drop policy if exists profiles_select_marketplace_resenia_autor on public.profiles;
create policy profiles_select_marketplace_resenia_autor
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.marketplace_resenias r
       where r.autor_id = profiles.id
    )
  );
