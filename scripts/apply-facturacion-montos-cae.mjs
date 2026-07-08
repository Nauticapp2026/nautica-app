import postgres from 'postgres';

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql`
    ALTER TABLE public.facturacion
      ADD COLUMN IF NOT EXISTS monto_neto numeric(12,2),
      ADD COLUMN IF NOT EXISTS monto_exento numeric(12,2),
      ADD COLUMN IF NOT EXISTS monto_iva numeric(12,2),
      ADD COLUMN IF NOT EXISTS cae_vencimiento date
  `;
  console.log('Migración aplicada OK.');
} finally {
  await sql.end();
}
