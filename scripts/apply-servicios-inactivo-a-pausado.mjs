import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0117_servicios_inactivo_a_pausado.sql', import.meta.url),
  'utf8',
);

const sql = postgres(process.env.DIRECT_URL);
try {
  const result = await sql.unsafe(sqlText);
  console.log('Migración aplicada OK. Filas afectadas:', result.count);

  const restantes = await sql`SELECT count(*)::int AS c FROM servicios WHERE estado = 'inactivo'`;
  console.log('Tarifas en estado inactivo restantes (esperado 0):', restantes[0].c);
} finally {
  await sql.end();
}
