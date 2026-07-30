import { redirect } from 'next/navigation';
import { eq, and, asc, desc, inArray } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  guarderiaCentrosEmisores,
  guarderias,
  horariosDia,
  memberships,
  pricingPlans,
  profiles,
} from '@/lib/db/schema';
import { getAllPlanFeatures } from '@/lib/pricing/config';

import type { GuarderiaFeatures } from '@/app/actions/configuracion';

import {
  ConfiguracionClient,
  type CentroEmisor,
  type InfoGeneralData,
  type MiembroEquipo,
  type PaywayData,
  type PlanInfo,
  type PuntoVentaData,
  type TabKey,
} from './configuracion-client';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;

const VALID_TABS: TabKey[] = ['info', 'equipo', 'plan', 'payway'];

type Props = {
  searchParams: Promise<{ tab?: string; nuevo?: string }>;
};

export default async function ConfiguracionPage({ searchParams }: Props) {
  const { tab, nuevo } = await searchParams;
  const initialTab: TabKey = (VALID_TABS as string[]).includes(tab ?? '')
    ? (tab as TabKey)
    : 'info';
  const initialAltaEquipoOpen = initialTab === 'equipo' && nuevo === '1';

  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const isAdmin =
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo';
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
      condicionIibb: guarderias.condicionIibb,
      fechaInicio: guarderias.fechaInicio,
      imagenes: guarderias.imagenes,
      diaFacturacion: guarderias.diaFacturacion,
      facturacionPrimerHabil: guarderias.facturacionPrimerHabil,
      certificadoAfipOk: guarderias.certificadoAfipOk,
      plan: guarderias.plan,
      planPendiente: guarderias.planPendiente,
      paywayPublicKey: guarderias.paywayPublicKey,
      paywayPrivateKey: guarderias.paywayPrivateKey,
      mediosCobroInternos: guarderias.mediosCobroInternos,
    })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);

  const [planesRows, planFeatures] = await Promise.all([
    db
      .select({
        slug: pricingPlans.slug,
        name: pricingPlans.name,
        rate: pricingPlans.rate,
        displayOrder: pricingPlans.displayOrder,
      })
      .from(pricingPlans)
      .orderBy(asc(pricingPlans.displayOrder)),
    getAllPlanFeatures(),
  ]);

  const planes: PlanInfo[] = planesRows.map((p) => ({
    slug: p.slug,
    name: p.name,
    rate: p.rate,
    features: planFeatures[p.slug] ?? [],
  }));

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
    tipo: (guarderia?.tipo ?? 'club_nautico') as InfoGeneralData['tipo'],
    direccion: guarderia?.direccion ?? '',
    ciudad: guarderia?.ciudad ?? '',
    provincia: guarderia?.provincia ?? '',
    codigoPostal: guarderia?.codigoPostal ?? '',
    telefono: guarderia?.telefono ?? '',
    email: guarderia?.email ?? '',
    horarios,
    imagenes: guarderia?.imagenes ?? [],
    diaFacturacion: guarderia?.diaFacturacion ?? 1,
    facturacionPrimerHabil: guarderia?.facturacionPrimerHabil ?? false,
  };

  const miembrosRows = await db
    .select({
      profileId: profiles.id,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      email: profiles.email,
      telefono: profiles.telefono,
      dni: profiles.numeroDocumento,
      sede: profiles.sede,
      rol: memberships.rol,
      estadoMiembro: profiles.estadoMiembro,
      isSuperAdmin: profiles.isSuperAdmin,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.status, 'active'),
        inArray(memberships.rol, [
          'administrador_general',
          'administrativo',
          'operario',
          'marinero',
          'seguridad',
        ]),
      ),
    )
    .orderBy(desc(memberships.createdAt));

  const miembros: MiembroEquipo[] = miembrosRows.map((m) => ({
    profileId: m.profileId,
    nombre: m.nombre,
    apellido: m.apellido,
    email: m.email,
    telefono: m.telefono,
    dni: m.dni,
    sede: m.sede,
    rol: m.rol,
    estadoMiembro: m.estadoMiembro,
    isSuperAdmin: m.isSuperAdmin,
  }));

  const features: GuarderiaFeatures = {
    activarNotificaciones: guarderia?.activarNotificaciones ?? false,
    activarClimaYMareas: guarderia?.activarClimaYMareas ?? false,
    activarReservasOnline: guarderia?.activarReservasOnline ?? false,
    activarPagosOnline: guarderia?.activarPagosOnline ?? false,
    activarMenuGastronomico: guarderia?.activarMenuGastronomico ?? false,
  };

  const payway: PaywayData = {
    publicKey: guarderia?.paywayPublicKey ?? '',
    privateKey: guarderia?.paywayPrivateKey ?? '',
  };

  const centrosRows = await db
    .select({
      id: guarderiaCentrosEmisores.id,
      nombre: guarderiaCentrosEmisores.nombre,
      puntoDeVenta: guarderiaCentrosEmisores.puntoDeVenta,
      esPrincipal: guarderiaCentrosEmisores.esPrincipal,
    })
    .from(guarderiaCentrosEmisores)
    .where(eq(guarderiaCentrosEmisores.guarderiaId, guarderiaId))
    .orderBy(
      desc(guarderiaCentrosEmisores.esPrincipal),
      asc(guarderiaCentrosEmisores.puntoDeVenta),
    );

  const centrosEmisores: CentroEmisor[] = centrosRows;
  const principal = centrosRows.find((c) => c.esPrincipal) ?? null;

  const puntoVenta: PuntoVentaData = {
    puntoDeVenta: principal?.puntoDeVenta ?? guarderia?.puntoDeVenta ?? null,
    razonSocial: guarderia?.razonSocial ?? '',
    cuit: guarderia?.cuit ?? '',
    condicionIva: (guarderia?.condicionIva ?? 'monotributo') as PuntoVentaData['condicionIva'],
    condicionIibb: guarderia?.condicionIibb ?? '',
    direccion: guarderia?.direccion ?? '',
    fechaInicio: guarderia?.fechaInicio ? guarderia.fechaInicio.toISOString().slice(0, 10) : '',
    certificadoAfipOk: guarderia?.certificadoAfipOk ?? false,
  };

  return (
    <ConfiguracionClient
      infoGeneral={infoGeneral}
      miembros={miembros}
      currentUserId={ctx.profile.id}
      features={features}
      puntoVenta={puntoVenta}
      mediosCobroInternos={guarderia?.mediosCobroInternos ?? ['efectivo']}
      centrosEmisores={centrosEmisores}
      payway={payway}
      planes={planes}
      currentPlan={(guarderia?.plan ?? 'esencial') as PlanInfo['slug']}
      pendingPlan={(guarderia?.planPendiente ?? null) as PlanInfo['slug'] | null}
      initialTab={initialTab}
      initialAltaEquipoOpen={initialAltaEquipoOpen}
    />
  );
}
