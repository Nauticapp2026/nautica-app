import postgres from 'postgres';

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql`
    ALTER TABLE public.facturacion
      ADD COLUMN IF NOT EXISTS rechazada boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS motivo_error text
  `;
  console.log('Migración aplicada OK.');

  const [{ n }] = await sql`SELECT count(*)::int AS n FROM facturacion WHERE rechazada = true`;
  console.log('Facturas rechazadas (esperado 0):', n);
} finally {
  await sql.end();
}
