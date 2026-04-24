import { redirect } from 'next/navigation';
import { eq, asc } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { guarderias, horariosDia } from '@/lib/db/schema';

import { ConfiguracionClient, type InfoGeneralData } from './configuracion-client';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;

export default async function ConfiguracionPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const isAdmin = ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
  if (!isAdmin) redirect('/dashboard');

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [guarderia] = await db
    .select({
      nombre: guarderias.nombre,
      cuit: guarderias.cuit,
      tipo: guarderias.tipo,
      direccion: guarderias.direccion,
      ciudad: guarderias.ciudad,
      provincia: guarderias.provincia,
      codigoPostal: guarderias.codigoPostal,
      telefono: guarderias.telefono,
      email: guarderias.email,
    })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);

  const horariosRows = await db
    .select({
      dia: horariosDia.dia,
      horarios: horariosDia.horarios,
      cerrado: horariosDia.cerrado,
    })
    .from(horariosDia)
    .where(eq(horariosDia.guarderiaId, guarderiaId))
    .orderBy(asc(horariosDia.orden));

  const horariosByDia = new Map(horariosRows.map((r) => [r.dia, r]));
  const horarios = DIAS.map((dia) => ({
    dia,
    horarios: horariosByDia.get(dia)?.horarios ?? '',
    cerrado: horariosByDia.get(dia)?.cerrado ?? false,
  }));

  const infoGeneral: InfoGeneralData = {
    nombre: guarderia?.nombre ?? '',
    cuit: guarderia?.cuit ?? '',
    tipo: (guarderia?.tipo ?? 'club_nautico') as InfoGeneralData['tipo'],
    direccion: guarderia?.direccion ?? '',
    ciudad: guarderia?.ciudad ?? '',
    provincia: guarderia?.provincia ?? '',
    codigoPostal: guarderia?.codigoPostal ?? '',
    telefono: guarderia?.telefono ?? '',
    email: guarderia?.email ?? '',
    horarios,
  };

  return <ConfiguracionClient infoGeneral={infoGeneral} />;
}
