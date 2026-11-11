import { notFound, redirect } from 'next/navigation';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { todayArg } from '@/lib/dates';
import { catalogosBienes, obtenerBien } from '@/lib/bienes-uso/consultas';
import { personalParaSelector } from '@/lib/legajo/consultas';
import { proveedoresParaSelector } from '@/lib/proveedores/consultas';
import { BIEN_TAB_IDS, tabDesdeUrl } from '@/lib/tab-url';

import { BienDetail } from './bien-detail';

export default async function BienPage({
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
  const det = await obtenerBien(gId, id);
  if (!det) notFound();

  const [catalogos, personal, proveedores] = await Promise.all([
    catalogosBienes(gId),
    personalParaSelector(gId),
    proveedoresParaSelector(gId),
  ]);

  return (
    <BienDetail
      det={det}
      catalogos={catalogos}
      personal={personal}
      proveedores={proveedores}
      hoy={todayArg()}
      tabInicial={tabDesdeUrl(tab, BIEN_TAB_IDS, 'generales')}
    />
  );
}
