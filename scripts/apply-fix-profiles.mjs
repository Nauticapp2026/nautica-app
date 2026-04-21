import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0004_fix_profiles_update_recursion.sql', import.meta.url),
  'utf8',
);

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql.unsafe(sqlText);
  console.log('Migración 0004 aplicada OK.');

  const policies = await sql`
    select policyname, cmd, qual, with_check
    from pg_policies
    where schemaname='public' and tablename='profiles'
    order by policyname
  `;
  console.log('policies profiles:');
  for (const p of policies) {
    console.log(`  - ${p.policyname} (${p.cmd})`);
  }
} finally {
  await sql.end();
}
