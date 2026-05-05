import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0013_movimientos_espacio_id.sql', import.meta.url),
  'utf8',
);

if (!process.env.DIRECT_URL) {
  console.error('Falta DIRECT_URL en .env.local');
  process.exit(1);
}

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql.unsafe(sqlText);
  console.log('Migración 0013 aplicada OK.');

  const cols = await sql`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'movimientos_cuenta_corriente'
      and column_name = 'espacio_id'
  `;
  console.log('movimientos_cuenta_corriente.espacio_id =', cols[0] ?? 'no existe');

  const idx = await sql`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'movimientos_cuenta_corriente'
      and indexname = 'movimientos_cta_cte_espacio_idx'
  `;
  console.log('índice =', idx[0]?.indexname ?? 'no existe');
} finally {
  await sql.end();
}
