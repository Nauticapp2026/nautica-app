import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0010_lavado_auto_tarea_trigger.sql', import.meta.url),
  'utf8',
);

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql.unsafe(sqlText);
  console.log('Trigger de lavado aplicado OK.');

  const trg = await sql`
    SELECT tgname, tgenabled
    FROM pg_trigger
    WHERE tgname = 'trg_on_solicitud_lavado_insert'
  `;
  console.log('trigger:', trg[0] ?? '(no encontrado)');

  const pendientes = await sql`
    SELECT count(*)::int AS c
    FROM solicitudes_lavado
    WHERE tarea_id IS NULL
      AND estado IN ('pendiente', 'en_proceso')
  `;
  console.log('solicitudes activas sin tarea (debería ser 0):', pendientes[0]?.c);
} finally {
  await sql.end();
}
