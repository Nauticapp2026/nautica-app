import { redirect } from 'next/navigation';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { listarComprobantes } from '@/lib/cuentas-a-pagar/consultas';

import { CuentasClient } from './cuentas-client';

export default async function CuentasAPagarPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  // Datos financieros de proveedores: solo administración. (Las acciones lo validan de nuevo.)
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/dashboard');
  }
  const filas = await listarComprobantes(ctx.activeMembership.guarderiaId);
  return <CuentasClient filas={filas} />;
}
