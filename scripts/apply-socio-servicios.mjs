import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0119_socio_servicios.sql', import.meta.url),
  'utf8',
);

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql.unsafe(sqlText);
  console.log('Migración aplicada OK.');

  const [{ c }] = await sql`SELECT count(*)::int AS c FROM socio_servicios`;
  console.log('Filas en socio_servicios (esperado 0):', c);
} finally {
  await sql.end();
}
