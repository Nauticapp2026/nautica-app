import { notFound, redirect } from 'next/navigation';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { todayArg } from '@/lib/dates';
import {
  adminsParaAprobar,
  catalogosDelClub,
  horasDelEmpleado,
  obtenerLegajo,
  personalParaSelector,
  usuariosVinculables,
} from '@/lib/legajo/consultas';
import { LEGAJO_TAB_IDS, tabDesdeUrl } from '@/lib/tab-url';

import { LegajoDetail } from './legajo-detail';

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function LegajoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; mes?: string }>;
}) {
  const { id } = await params;
  const { tab, mes: mesParam } = await searchParams;
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  // Legajo = datos sensibles: solo administración del club.
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/dashboard');
  }
  const gId = ctx.activeMembership.guarderiaId;
  const mes = mesParam && MES.test(mesParam) ? mesParam : todayArg().slice(0, 7);

  // El legajo se busca SIEMPRE con el guarderia_id del usuario: un id de otro club da 404.
  const det = await obtenerLegajo(gId, id);
  if (!det) notFound();

  const [catalogos, vinculables, personal, admins, horas] = await Promise.all([
    catalogosDelClub(gId, ctx.activeGuarderia?.nombre ?? ''),
    usuariosVinculables(gId, id),
    personalParaSelector(gId),
    adminsParaAprobar(gId),
    horasDelEmpleado(gId, id, mes),
  ]);

  return (
    <LegajoDetail
      det={det}
      catalogos={catalogos}
      vinculables={vinculables}
      personal={personal}
      admins={admins}
      horas={horas}
      mes={mes}
      tabInicial={tabDesdeUrl(tab, LEGAJO_TAB_IDS, 'personales')}
    />
  );
}
