import { redirect } from 'next/navigation';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { catalogosProveedor, listarProveedores } from '@/lib/proveedores/consultas';

import { ProveedoresClient } from './proveedores-client';

export default async function ProveedoresPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  // Datos fiscales y bancarios: solo administración. (Las acciones lo validan de nuevo.)
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/dashboard');
  }
  const gId = ctx.activeMembership.guarderiaId;

  const [filas, catalogos] = await Promise.all([listarProveedores(gId), catalogosProveedor(gId)]);

  return <ProveedoresClient filas={filas} areas={catalogos.prov_area} />;
}
