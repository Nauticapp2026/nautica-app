import { redirect } from 'next/navigation';

import { getActiveMarina } from '@/lib/auth/session';

import { ConfiguracionClient } from './configuracion-client';

export default async function ConfiguracionPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const isAdmin = ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';

  if (!isAdmin) redirect('/dashboard');

  return <ConfiguracionClient />;
}
