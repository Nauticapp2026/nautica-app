import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const sqlText = readFileSync(
  new URL('../supabase/migrations/0139_monotributo_montos_neto_backfill.sql', import.meta.url),
  'utf8',
);

const sql = postgres(process.env.DIRECT_URL);
try {
  const antes = await sql`
    SELECT g.nombre AS guarderia, f.codigo, f.monto_neto, f.monto_exento, f.monto_iva
    FROM public.facturacion f
    JOIN public.guarderias g ON g.id = f.guarderia_id
    WHERE g.condicion_iva = 'monotributo' AND COALESCE(f.monto_exento, 0) > 0
    ORDER BY g.nombre, f.emision
  `;
  console.log(`Comprobantes a corregir: ${antes.length}`);
  for (const r of antes) {
    console.log(
      `  ${r.guarderia} — ${r.codigo ?? '(sin código)'}: neto ${r.monto_neto} / exento ${r.monto_exento} / iva ${r.monto_iva}`,
    );
  }

  const result = await sql.unsafe(sqlText);
  console.log('\nBackfill aplicado OK. Filas afectadas:', result.count);

  const restantes = await sql`
    SELECT count(*)::int AS c
    FROM public.facturacion f
    JOIN public.guarderias g ON g.id = f.guarderia_id
    WHERE g.condicion_iva = 'monotributo' AND COALESCE(f.monto_exento, 0) > 0
  `;
  console.log('Comprobantes Monotributo con exento > 0 restantes (esperado: 0):', restantes[0]?.c);
} finally {
  await sql.end();
}
