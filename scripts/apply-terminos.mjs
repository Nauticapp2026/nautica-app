import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0042_terminos_y_condiciones.sql', import.meta.url),
  'utf8',
);

if (!process.env.DIRECT_URL) {
  console.error('Falta DIRECT_URL en .env.local');
  process.exit(1);
}

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql.unsafe(sqlText);
  console.log('Migración 0042 aplicada OK.');

  const tablas = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('terminos_versiones', 'terminos_aceptaciones')
    order by table_name
  `;
  for (const t of tablas) {
    console.log(`tabla creada: ${t.table_name}`);
  }

  const versiones = await sql`
    select version, length(contenido) as chars_contenido, publicado_en
    from public.terminos_versiones
    order by version desc
  `;
  console.log('versiones publicadas:');
  for (const v of versiones) {
    console.log(`  v${v.version} (${v.chars_contenido} chars) — ${v.publicado_en.toISOString()}`);
  }
} finally {
  await sql.end();
}
