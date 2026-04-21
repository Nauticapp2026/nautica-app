import postgres from 'postgres';

const sql = postgres(process.env.DIRECT_URL);
try {
  const rows = await sql`select count(*)::int as n from porteria_invitados`;
  console.log('porteria_invitados existe. rows =', rows[0].n);
  const cols = await sql`select column_name, data_type from information_schema.columns where table_name='porteria_invitados' order by ordinal_position`;
  console.log('columnas:', cols.map((c) => c.column_name + ':' + c.data_type).join(', '));
  const porteriaCols = await sql`select column_name from information_schema.columns where table_name='porteria' and column_name='invitado_id'`;
  console.log('porteria.invitado_id existe?', porteriaCols.length > 0);
  const invitadosCols = await sql`select column_name from information_schema.columns where table_name='invitados' and column_name='cantidad_acompanantes'`;
  console.log('invitados.cantidad_acompanantes existe?', invitadosCols.length > 0);
  const rls = await sql`select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('porteria','invitados','porteria_invitados')`;
  console.log('RLS:', rls);
} finally {
  await sql.end();
}
