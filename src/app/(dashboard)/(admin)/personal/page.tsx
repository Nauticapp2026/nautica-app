import { redirect } from 'next/navigation';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { addDiasYmd, todayArg } from '@/lib/dates';
import {
  catalogosDelClub,
  grillaSemanal,
  listarLegajos,
  lunesDe,
  novedadesDelPeriodo,
  usuariosVinculables,
} from '@/lib/legajo/consultas';

import { PersonalClient } from './personal-client';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function PersonalPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; lunes?: string; mes?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getActiveMarina();
  if (!ctx) return null;
  // El legajo es sensible: solo administración. (Las acciones lo validan de nuevo.)
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    redirect('/dashboard');
  }
  const gId = ctx.activeMembership.guarderiaId;
  const hoy = todayArg();

  const vista = sp.vista === 'semana' || sp.vista === 'novedades' ? sp.vista : 'legajos';
  const lunes = lunesDe(sp.lunes && YMD.test(sp.lunes) ? sp.lunes : hoy);
  const mes = sp.mes && MES.test(sp.mes) ? sp.mes : hoy.slice(0, 7);

  const [filas, catalogos, vinculables, semana, novedades] = await Promise.all([
    listarLegajos(gId),
    catalogosDelClub(gId, ctx.activeGuarderia?.nombre ?? ''),
    usuariosVinculables(gId),
    vista === 'semana' ? grillaSemanal(gId, lunes) : Promise.resolve(null),
    vista === 'novedades' ? novedadesDelPeriodo(gId, mes) : Promise.resolve(null),
  ]);

  return (
    <PersonalClient
      vista={vista}
      filas={filas}
      puestos={catalogos.puesto}
      vinculables={vinculables}
      semana={
        semana
          ? { lunes, anterior: addDiasYmd(lunes, -7), siguiente: addDiasYmd(lunes, 7), ...semana }
          : null
      }
      novedades={novedades ? { mes, filas: novedades } : null}
      clubNombre={ctx.activeGuarderia?.nombre ?? 'Club'}
    />
  );
}
