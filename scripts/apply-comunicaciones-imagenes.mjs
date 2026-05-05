import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0014_comunicaciones_imagenes.sql', import.meta.url),
  'utf8',
);

if (!process.env.DIRECT_URL) {
  console.error('Falta DIRECT_URL en .env.local');
  process.exit(1);
}

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql.unsafe(sqlText);
  console.log('Migración 0014 aplicada OK.');

  const cols = await sql`
    select table_name, column_name, data_type, udt_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('comunicaciones', 'platform_comunicaciones')
      and column_name = 'imagen_urls'
    order by table_name
  `;
  for (const c of cols) {
    console.log(`${c.table_name}.${c.column_name} = ${c.data_type} (${c.udt_name})`);
  }
} finally {
  await sql.end();
}
