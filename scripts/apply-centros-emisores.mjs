import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const sql = postgres(process.env.DIRECT_URL);
try {
  const migracion = readFileSync('supabase/migrations/0135_centros_emisores.sql', 'utf8');
  await sql.unsafe(migracion);
  console.log('Migración 0135_centros_emisores aplicada OK.');

  const centros = await sql`
    SELECT g.nombre AS guarderia, c.nombre, c.punto_de_venta, c.es_principal,
           (c.apikey IS NOT NULL) AS tiene_creds
    FROM guarderia_centros_emisores c
    JOIN guarderias g ON g.id = c.guarderia_id
    ORDER BY g.nombre, c.punto_de_venta
  `;
  console.log('Centros emisores (backfill):', centros);
} finally {
  await sql.end();
}
