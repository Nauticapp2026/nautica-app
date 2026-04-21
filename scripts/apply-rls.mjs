import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0003_porteria_invitados_rls.sql', import.meta.url),
  'utf8',
);

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql.unsafe(sqlText);
  console.log('RLS aplicado OK.');

  const rls = await sql`select rowsecurity from pg_tables where schemaname='public' and tablename='porteria_invitados'`;
  console.log('porteria_invitados.rowsecurity =', rls[0]?.rowsecurity);

  const policies = await sql`select policyname, cmd from pg_policies where schemaname='public' and tablename='porteria_invitados' order by policyname`;
  console.log('policies:', policies.map((p) => `${p.policyname}(${p.cmd})`).join(', '));
} finally {
  await sql.end();
}
