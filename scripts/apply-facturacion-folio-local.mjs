import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0115_facturacion_folio_local.sql', import.meta.url),
  'utf8',
);

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql.unsafe(sqlText);
  console.log('Columna folio_local agregada OK.');

  const col = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'facturacion' AND column_name = 'folio_local'
  `;
  console.log('columna:', col[0] ?? '(no encontrada)');
} finally {
  await sql.end();
}
