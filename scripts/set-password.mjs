import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: node scripts/set-password.mjs <email> <password>');
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let page = 1;
let user = null;
while (!user) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find((u) => u.email === email);
  if (user) break;
  if (data.users.length < 1000) break;
  page++;
}

if (!user) {
  console.error(`No se encontró usuario con email ${email}`);
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(user.id, { password });
if (error) {
  console.error('Error al actualizar contraseña:', error.message);
  process.exit(1);
}

console.log(`OK. Password de ${email} (${user.id}) actualizada.`);
