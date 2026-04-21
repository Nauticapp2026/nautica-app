-- =============================================================================
-- RLS para porteria_invitados.
-- Patron: el socio puede operar sobre filas cuyo porteria_id le pertenece.
-- =============================================================================

alter table public.porteria_invitados enable row level security;

create policy "porteria_invitados_select_own"
  on public.porteria_invitados
  for select
  to authenticated
  using (
    exists (
      select 1 from public.porteria p
      where p.id = porteria_invitados.porteria_id
        and p.socio_id = auth.uid()
    )
  );

create policy "porteria_invitados_insert_own"
  on public.porteria_invitados
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.porteria p
      where p.id = porteria_invitados.porteria_id
        and p.socio_id = auth.uid()
    )
  );

create policy "porteria_invitados_update_own"
  on public.porteria_invitados
  for update
  to authenticated
  using (
    exists (
      select 1 from public.porteria p
      where p.id = porteria_invitados.porteria_id
        and p.socio_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.porteria p
      where p.id = porteria_invitados.porteria_id
        and p.socio_id = auth.uid()
    )
  );

create policy "porteria_invitados_delete_own"
  on public.porteria_invitados
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.porteria p
      where p.id = porteria_invitados.porteria_id
        and p.socio_id = auth.uid()
    )
  );
