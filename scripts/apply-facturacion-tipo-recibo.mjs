import postgres from 'postgres';

const sql = postgres(process.env.DIRECT_URL);
try {
  await sql`
    DO $$ BEGIN
      CREATE TYPE public.tipo_recibo AS ENUM ('fiscal', 'interno');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `;
  await sql`
    ALTER TABLE public.facturacion
      ADD COLUMN IF NOT EXISTS tipo_recibo public.tipo_recibo
  `;
  console.log('Migración aplicada OK.');
} finally {
  await sql.end();
}
