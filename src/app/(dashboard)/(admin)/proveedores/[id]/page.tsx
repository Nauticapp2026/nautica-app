import { notFound, redirect } from 'next/navigation';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { catalogosProveedor, obtenerProveedor } from '@/lib/proveedores/consultas';
import { PROVEEDOR_TAB_IDS, tabDesdeUrl } from '@/lib/tab-url';

import { ProveedorDetail } from './proveedor-detail';

export default async function ProveedorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/dashboard');
  }
  const gId = ctx.activeMembership.guarderiaId;

  // Se busca SIEMPRE con el guarderia_id del usuario: un id de otro club da 404.
  const det = await obtenerProveedor(gId, id);
  if (!det) notFound();
  const catalogos = await catalogosProveedor(gId);

  return (
    <ProveedorDetail
      det={det}
      catalogos={catalogos}
      tabInicial={tabDesdeUrl(tab, PROVEEDOR_TAB_IDS, 'identificacion')}
    />
  );
}
