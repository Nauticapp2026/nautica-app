import postgres from 'postgres';

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql`ALTER TYPE tipo_factura ADD VALUE IF NOT EXISTS 'nota_debito_a'`;
  await sql`ALTER TYPE tipo_factura ADD VALUE IF NOT EXISTS 'nota_debito_b'`;
  await sql`ALTER TYPE tipo_factura ADD VALUE IF NOT EXISTS 'nota_debito_c'`;
  console.log('Migración aplicada OK.');

  const rows = await sql`
    SELECT enumlabel FROM pg_enum
    WHERE enumtypid = 'tipo_factura'::regtype
    ORDER BY enumsortorder
  `;
  console.log(
    'Valores de tipo_factura:',
    rows.map((r) => r.enumlabel),
  );
} finally {
  await sql.end();
}
