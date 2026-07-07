import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0116_comprobante_interno_backfill.sql', import.meta.url),
  'utf8',
);

const sql = postgres(process.env.DIRECT_URL);
try {
  const result = await sql.unsafe(sqlText);
  console.log('Backfill aplicado OK. Filas afectadas:', result.count);

  const pendientesInterno = await sql`
    SELECT count(*)::int AS c
    FROM movimientos_cuenta_corriente
    WHERE comprobante_interno = true AND estado = 'no_pagado'
  `;
  console.log('cargos internos pendientes restantes (esperado: 0 o solo los nuevos sin RB-):', pendientesInterno[0]?.c);
} finally {
  await sql.end();
}
