import postgres from 'postgres';

const sql = postgres(process.env.DIRECT_URL);
try {
  const policies = await sql`
    select tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname='public' and tablename in ('porteria','invitados','porteria_invitados')
    order by tablename, policyname
  `;
  console.log(JSON.stringify(policies, null, 2));
} finally {
  await sql.end();
}
