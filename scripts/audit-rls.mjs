import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';

const sql = postgres(process.env.DIRECT_URL);
try {
  const tables = await sql`
    select tablename, rowsecurity
    from pg_tables
    where schemaname='public'
    order by tablename
  `;
  console.log('=== Tablas public y RLS ===');
  for (const t of tables) {
    console.log(`  ${t.tablename}: rls=${t.rowsecurity}`);
  }

  console.log('\n=== Policies por tabla ===');
  const pol = await sql`
    select tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname='public'
    order by tablename, policyname
  `;
  for (const p of pol) {
    console.log(`\n[${p.tablename}] ${p.policyname} (${p.cmd})`);
    if (p.qual) console.log(`  USING: ${p.qual}`);
    if (p.with_check) console.log(`  CHECK: ${p.with_check}`);
  }

  console.log('\n=== Funciones SECURITY DEFINER en public ===');
  const fns = await sql`
    select proname, prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by proname
  `;
  for (const f of fns) {
    console.log(`  ${f.proname}: security_definer=${f.prosecdef}`);
  }
} finally {
  await sql.end();
}
