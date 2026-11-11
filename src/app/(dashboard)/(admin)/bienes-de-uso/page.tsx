import { redirect } from 'next/navigation';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { todayArg } from '@/lib/dates';
import { catalogosBienes, listarBienes } from '@/lib/bienes-uso/consultas';

import { BienesClient } from './bienes-client';

export default async function BienesDeUsoPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  // Datos contables y de seguros: solo administración. (Las acciones lo validan de nuevo.)
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/dashboard');
  }
  const gId = ctx.activeMembership.guarderiaId;

  const [filas, catalogos] = await Promise.all([listarBienes(gId), catalogosBienes(gId)]);

  return <BienesClient filas={filas} tipos={catalogos.bu_tipo} hoy={todayArg()} />;
}
