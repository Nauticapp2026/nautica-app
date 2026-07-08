import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0118_servicios_politica_baja_anticipada.sql', import.meta.url),
  'utf8',
);

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql.unsafe(sqlText);
  console.log('Migración aplicada OK.');

  const [{ c }] = await sql`
    SELECT count(*)::int AS c
    FROM servicios
    WHERE politica_baja_anticipada = 'proporcional'
  `;
  console.log('Tarifas con política proporcional (default):', c);
} finally {
  await sql.end();
}
