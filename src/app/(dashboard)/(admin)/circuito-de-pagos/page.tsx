import { redirect } from 'next/navigation';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { listarPagos } from '@/lib/pagos/consultas';

import { PagosClient } from './pagos-client';

export default async function CircuitoDePagosPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  // Pagos a proveedores: solo administración. (Las acciones lo validan de nuevo.)
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/dashboard');
  }
  const filas = await listarPagos(ctx.activeMembership.guarderiaId);
  return <PagosClient filas={filas} />;
}
