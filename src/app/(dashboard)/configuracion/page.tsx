import { redirect } from 'next/navigation';
import { eq, and, asc, desc } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { guarderias, horariosDia, memberships, profiles } from '@/lib/db/schema';

import type { GuarderiaFeatures } from '@/app/actions/configuracion';

import {
  ConfiguracionClient,
  type InfoGeneralData,
  type MiembroEquipo,
  type PuntoVentaData,
} from './configuracion-client';

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
      activarNotificaciones: guarderias.activarNotificaciones,
      activarClimaYMareas: guarderias.activarClimaYMareas,
      activarReservasOnline: guarderias.activarReservasOnline,
      activarPagosOnline: guarderias.activarPagosOnline,
      activarMenuGastronomico: guarderias.activarMenuGastronomico,
      puntoDeVenta: guarderias.puntoDeVenta,
      razonSocial: guarderias.razonSocial,
      condicionIva: guarderias.condicionIva,
      rubro: guarderias.rubro,
      fechaInicio: guarderias.fechaInicio,
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

  const miembrosRows = await db
    .select({
      profileId: profiles.id,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      email: profiles.email,
      telefono: profiles.telefono,
      rol: memberships.rol,
      estadoMiembro: profiles.estadoMiembro,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(and(eq(memberships.guarderiaId, guarderiaId), eq(memberships.status, 'active')))
    .orderBy(desc(memberships.createdAt));

  const miembros: MiembroEquipo[] = miembrosRows.map((m) => ({
    profileId: m.profileId,
    nombre: m.nombre,
    apellido: m.apellido,
    email: m.email,
    telefono: m.telefono,
    rol: m.rol,
    estadoMiembro: m.estadoMiembro,
  }));

  const features: GuarderiaFeatures = {
    activarNotificaciones: guarderia?.activarNotificaciones ?? false,
    activarClimaYMareas: guarderia?.activarClimaYMareas ?? false,
    activarReservasOnline: guarderia?.activarReservasOnline ?? false,
    activarPagosOnline: guarderia?.activarPagosOnline ?? false,
    activarMenuGastronomico: guarderia?.activarMenuGastronomico ?? false,
  };

  const puntoVenta: PuntoVentaData = {
    puntoDeVenta: guarderia?.puntoDeVenta ?? null,
    razonSocial: guarderia?.razonSocial ?? '',
    condicionIva: (guarderia?.condicionIva ?? 'monotributo') as PuntoVentaData['condicionIva'],
    rubro: guarderia?.rubro ?? '',
    fechaInicio: guarderia?.fechaInicio ? guarderia.fechaInicio.toISOString().slice(0, 10) : '',
  };

  return (
    <ConfiguracionClient
      infoGeneral={infoGeneral}
      miembros={miembros}
      features={features}
      puntoVenta={puntoVenta}
    />
  );
}
