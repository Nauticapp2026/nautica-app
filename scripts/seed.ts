/**
 * Seed inicial para bootstrap de la plataforma.
 *
 * Uso: pnpm tsx scripts/seed.ts
 *
 * Esto:
 *  1. Crea una guardería de ejemplo.
 *  2. Marca al user con email SUPER_ADMIN_EMAIL como is_super_admin = true.
 *  3. Le crea membership como marina_admin en esa guardería.
 *
 * Requiere que el usuario ya exista en auth.users (registralo primero via /signup).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const MARINA_NAME = process.env.SEED_MARINA_NAME ?? 'Guardería Demo';
const MARINA_SLUG = process.env.SEED_MARINA_SLUG ?? 'demo';

if (!SUPER_ADMIN_EMAIL) {
  console.error('Falta SUPER_ADMIN_EMAIL en .env');
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  // 1. Buscar el user en auth.users
  const { data: usersList, error: usersErr } = await admin.auth.admin.listUsers();
  if (usersErr) throw usersErr;

  const user = usersList.users.find((u) => u.email === SUPER_ADMIN_EMAIL);
  if (!user) {
    console.error(
      `No encontré user con email ${SUPER_ADMIN_EMAIL}. Registralo primero en /signup.`,
    );
    process.exit(1);
  }

  // 2. Marcar como super_admin
  const { error: profileErr } = await admin
    .from('profiles')
    .update({ is_super_admin: true })
    .eq('id', user.id);
  if (profileErr) throw profileErr;
  console.log(`✓ ${SUPER_ADMIN_EMAIL} marcado como super_admin`);

  // 3. Crear guardería
  const { data: marina, error: marinaErr } = await admin
    .from('marinas')
    .upsert({ name: MARINA_NAME, slug: MARINA_SLUG }, { onConflict: 'slug' })
    .select()
    .single();
  if (marinaErr) throw marinaErr;
  console.log(`✓ Guardería "${marina.name}" creada (id: ${marina.id})`);

  // 4. Membership
  const { error: membershipErr } = await admin
    .from('memberships')
    .upsert(
      { user_id: user.id, marina_id: marina.id, role: 'marina_admin', status: 'active' },
      { onConflict: 'user_id,marina_id' },
    );
  if (membershipErr) throw membershipErr;
  console.log(`✓ Membership marina_admin creada`);

  console.log('\nListo. Ingresá a /dashboard.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
