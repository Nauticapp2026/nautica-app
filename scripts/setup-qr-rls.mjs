// One-shot: RLS + policies para porteria, invitados, embarcaciones.
// Desde nautica-app/: node --env-file=.env.local scripts/setup-qr-rls.mjs
import postgres from 'postgres';

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('✗ Falta DATABASE_URL / DIRECT_URL');
  process.exit(1);
}
const sql = postgres(dbUrl, { max: 1, ssl: 'require' });

try {
  await sql.unsafe(`
    -- ── PORTERIA ────────────────────────────────────────────────────────
    alter table public.porteria enable row level security;

    drop policy if exists "porteria_select_own" on public.porteria;
    create policy "porteria_select_own"
      on public.porteria for select
      to authenticated
      using (socio_id = auth.uid());

    drop policy if exists "porteria_insert_own" on public.porteria;
    create policy "porteria_insert_own"
      on public.porteria for insert
      to authenticated
      with check (socio_id = auth.uid());

    drop policy if exists "porteria_update_own" on public.porteria;
    create policy "porteria_update_own"
      on public.porteria for update
      to authenticated
      using (socio_id = auth.uid())
      with check (socio_id = auth.uid());

    drop policy if exists "porteria_delete_own" on public.porteria;
    create policy "porteria_delete_own"
      on public.porteria for delete
      to authenticated
      using (socio_id = auth.uid());

    -- ── INVITADOS ───────────────────────────────────────────────────────
    alter table public.invitados enable row level security;

    drop policy if exists "invitados_select_own" on public.invitados;
    create policy "invitados_select_own"
      on public.invitados for select
      to authenticated
      using (socio_id = auth.uid());

    drop policy if exists "invitados_insert_own" on public.invitados;
    create policy "invitados_insert_own"
      on public.invitados for insert
      to authenticated
      with check (socio_id = auth.uid());

    drop policy if exists "invitados_update_own" on public.invitados;
    create policy "invitados_update_own"
      on public.invitados for update
      to authenticated
      using (socio_id = auth.uid())
      with check (socio_id = auth.uid());

    drop policy if exists "invitados_delete_own" on public.invitados;
    create policy "invitados_delete_own"
      on public.invitados for delete
      to authenticated
      using (socio_id = auth.uid());

    -- ── EMBARCACIONES ──────────────────────────────────────────────────
    alter table public.embarcaciones enable row level security;

    drop policy if exists "embarcaciones_select_own" on public.embarcaciones;
    create policy "embarcaciones_select_own"
      on public.embarcaciones for select
      to authenticated
      using (profile_id = auth.uid());

    drop policy if exists "embarcaciones_insert_own" on public.embarcaciones;
    create policy "embarcaciones_insert_own"
      on public.embarcaciones for insert
      to authenticated
      with check (profile_id = auth.uid());

    drop policy if exists "embarcaciones_update_own" on public.embarcaciones;
    create policy "embarcaciones_update_own"
      on public.embarcaciones for update
      to authenticated
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid());
  `);
  console.log('✓ RLS + policies aplicadas a porteria, invitados y embarcaciones.');
} catch (e) {
  console.error('✗', e.message);
  process.exit(1);
} finally {
  await sql.end();
}
