/**
 * Seed inicial para bootstrap de la plataforma.
 *
 * Uso: pnpm seed
 *
 * Requiere que el usuario ya exista en auth.users (registralo primero via /signup).
 * Variables necesarias en .env.local:
 *   SUPER_ADMIN_EMAIL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const GUARDERIA_NOMBRE = process.env.SEED_GUARDERIA_NOMBRE ?? 'Guardería Demo';
const GUARDERIA_SLUG = process.env.SEED_GUARDERIA_SLUG ?? 'demo';

if (!SUPER_ADMIN_EMAIL) {
  console.error('Falta SUPER_ADMIN_EMAIL en .env.local');
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

  // 3. Crear guardería demo
  const { data: guarderia, error: guarderiaErr } = await admin
    .from('guarderias')
    .upsert({ nombre: GUARDERIA_NOMBRE, slug: GUARDERIA_SLUG }, { onConflict: 'slug' })
    .select()
    .single();
  if (guarderiaErr) throw guarderiaErr;
  console.log(`✓ Guardería "${guarderia.nombre}" creada (id: ${guarderia.id})`);

  // 4. Membership como administrador_general
  const { error: membershipErr } = await admin.from('memberships').upsert(
    {
      user_id: user.id,
      guarderia_id: guarderia.id,
      rol: 'administrador_general',
      status: 'active',
    },
    { onConflict: 'user_id,guarderia_id' },
  );
  if (membershipErr) throw membershipErr;
  console.log(`✓ Membership administrador_general creada`);

  console.log('\nListo. Ingresá a /dashboard.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
