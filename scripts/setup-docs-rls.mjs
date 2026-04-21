// One-shot: RLS + policies para documentos y storage.
// Desde nautica-app/ (que tiene `postgres` instalado):
//   node --env-file=.env.local ../nautica-app-mobile/scripts/setup-docs-rls.mjs
import postgres from 'postgres';

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('✗ Falta DATABASE_URL / DIRECT_URL');
  process.exit(1);
}
const sql = postgres(dbUrl, { max: 1, ssl: 'require' });

try {
  await sql.unsafe(`
    alter table public.documentos enable row level security;

    drop policy if exists "documentos_select_own" on public.documentos;
    create policy "documentos_select_own"
      on public.documentos for select
      to authenticated
      using (profile_id = auth.uid());

    drop policy if exists "documentos_insert_own" on public.documentos;
    create policy "documentos_insert_own"
      on public.documentos for insert
      to authenticated
      with check (profile_id = auth.uid());

    drop policy if exists "documentos_update_own" on public.documentos;
    create policy "documentos_update_own"
      on public.documentos for update
      to authenticated
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid());

    drop policy if exists "documentos_delete_own" on public.documentos;
    create policy "documentos_delete_own"
      on public.documentos for delete
      to authenticated
      using (profile_id = auth.uid());

    drop policy if exists "documentos_storage_insert_own" on storage.objects;
    create policy "documentos_storage_insert_own"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'documentos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    drop policy if exists "documentos_storage_select_own" on storage.objects;
    create policy "documentos_storage_select_own"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'documentos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    drop policy if exists "documentos_storage_update_own" on storage.objects;
    create policy "documentos_storage_update_own"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'documentos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    drop policy if exists "documentos_storage_delete_own" on storage.objects;
    create policy "documentos_storage_delete_own"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'documentos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  `);
  console.log('✓ RLS + policies aplicadas a documentos y storage.');
} catch (e) {
  console.error('✗', e.message);
  process.exit(1);
} finally {
  await sql.end();
}
