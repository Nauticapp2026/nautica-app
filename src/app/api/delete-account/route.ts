import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function getUserIdFromAuth(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export async function DELETE(req: Request): Promise<Response> {
  const userId = await getUserIdFromAuth(req);
  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Borrar el profile primero para disparar los ON DELETE CASCADE de las tablas
  // que lo referencian (memberships, documentos, solicitudesLavado, etc.).
  // profiles.id no tiene FK a auth.users, así que la cascada no ocurre sola.
  const { error: profileError } = await admin.from('profiles').delete().eq('id', userId);
  if (profileError) {
    return NextResponse.json({ error: 'Error al eliminar la cuenta.' }, { status: 500 });
  }

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    return NextResponse.json({ error: 'Error al eliminar la cuenta.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
