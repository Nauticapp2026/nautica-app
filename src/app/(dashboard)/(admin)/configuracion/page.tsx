import { redirect } from 'next/navigation';
import { eq, and, asc, count, desc, inArray } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { PERIODO_ANULACION_DEFAULT, esPeriodoAnulacion } from '@/lib/periodo-anulacion';
import { PERIODO_CARGA_DEFAULT, esPeriodoCarga } from '@/lib/tesoreria/periodo-carga';
import { PERIODO_EDICION_DEFAULT, esPeriodoEdicion } from '@/lib/tesoreria/periodo-edicion';
import { db } from '@/lib/db';
import {
  guarderiaCentrosEmisores,
  guarderias,
  horariosDia,
  memberships,
  pricingPlans,
  profiles,
  reglamentoAceptaciones,
  reglamentosClub,
} from '@/lib/db/schema';
import { BUCKET_REGLAMENTO } from '@/lib/reglamento';
import { createAdminClient } from '@/lib/supabase/admin';
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
  type ReglamentoData,
  type TabKey,
} from './configuracion-client';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;

const VALID_TABS: TabKey[] = ['info', 'reglamento', 'equipo', 'plan', 'payway'];

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
      periodoAnulacionRecibo: guarderias.periodoAnulacionRecibo,
      periodoCargaTesoreria: guarderias.periodoCargaTesoreria,
      periodoEdicionTesoreria: guarderias.periodoEdicionTesoreria,
      diasMorosidad: guarderias.diasMorosidad,
      accesoExternoArt: guarderias.accesoExternoArt,
      accesoExternoArtCondicion: guarderias.accesoExternoArtCondicion,
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
      activo: guarderiaCentrosEmisores.activo,
      bajaAt: guarderiaCentrosEmisores.bajaAt,
    })
    .from(guarderiaCentrosEmisores)
    .where(eq(guarderiaCentrosEmisores.guarderiaId, guarderiaId))
    .orderBy(
      desc(guarderiaCentrosEmisores.esPrincipal),
      asc(guarderiaCentrosEmisores.puntoDeVenta),
    );

  const centrosEmisores: CentroEmisor[] = centrosRows.map((c) => ({
    ...c,
    bajaAt: c.bajaAt ? c.bajaAt.toISOString() : null,
  }));
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

  // ── Reglamento del club (mig 0170). Todo scopeado por la guardería del usuario. ──
  const versionesRows = await db
    .select({
      id: reglamentosClub.id,
      version: reglamentosClub.version,
      titulo: reglamentosClub.titulo,
      novedades: reglamentosClub.novedades,
      archivoPath: reglamentosClub.archivoPath,
      archivoNombre: reglamentosClub.archivoNombre,
      publicadoEn: reglamentosClub.publicadoEn,
    })
    .from(reglamentosClub)
    .where(eq(reglamentosClub.guarderiaId, guarderiaId))
    .orderBy(desc(reglamentosClub.version));

  const conteos = await db
    .select({ reglamentoId: reglamentoAceptaciones.reglamentoId, n: count() })
    .from(reglamentoAceptaciones)
    .where(eq(reglamentoAceptaciones.guarderiaId, guarderiaId))
    .groupBy(reglamentoAceptaciones.reglamentoId);
  const aceptacionesPorVersion = new Map(conteos.map((c) => [c.reglamentoId, Number(c.n)]));

  // Links firmados de una hora para que el admin pueda abrir cada PDF.
  const urlsReglamento = new Map<string, string>();
  if (versionesRows.length > 0) {
    const { data: firmadas } = await createAdminClient()
      .storage.from(BUCKET_REGLAMENTO)
      .createSignedUrls(
        versionesRows.map((v) => v.archivoPath),
        60 * 60,
      );
    for (const f of firmadas ?? []) {
      if (f.path && f.signedUrl) urlsReglamento.set(f.path, f.signedUrl);
    }
  }

  // Quién aceptó la versión vigente: los socios activos del club, con su aceptación si la hay.
  const vigente = versionesRows[0] ?? null;
  const sociosReglamentoRows = vigente
    ? await db
        .select({
          profileId: profiles.id,
          nombre: profiles.nombre,
          apellido: profiles.apellido,
          email: profiles.email,
          aceptadoEn: reglamentoAceptaciones.aceptadoEn,
        })
        .from(memberships)
        .innerJoin(profiles, eq(profiles.id, memberships.userId))
        .leftJoin(
          reglamentoAceptaciones,
          and(
            eq(reglamentoAceptaciones.userId, memberships.userId),
            eq(reglamentoAceptaciones.reglamentoId, vigente.id),
          ),
        )
        .where(
          and(
            eq(memberships.guarderiaId, guarderiaId),
            eq(memberships.rol, 'socio'),
            eq(memberships.status, 'active'),
          ),
        )
        .orderBy(asc(profiles.apellido), asc(profiles.nombre))
    : [];

  const reglamento: ReglamentoData = {
    versiones: versionesRows.map((v) => ({
      id: v.id,
      version: v.version,
      titulo: v.titulo,
      novedades: v.novedades,
      archivoNombre: v.archivoNombre,
      publicadoEn: v.publicadoEn.toISOString(),
      url: urlsReglamento.get(v.archivoPath) ?? null,
      aceptaciones: aceptacionesPorVersion.get(v.id) ?? 0,
    })),
    socios: sociosReglamentoRows.map((s) => ({
      profileId: s.profileId,
      nombre: s.nombre,
      apellido: s.apellido,
      email: s.email,
      aceptadoEn: s.aceptadoEn ? s.aceptadoEn.toISOString() : null,
    })),
  };

  return (
    <ConfiguracionClient
      infoGeneral={infoGeneral}
      miembros={miembros}
      currentUserId={ctx.profile.id}
      features={features}
      puntoVenta={puntoVenta}
      mediosCobroInternos={guarderia?.mediosCobroInternos ?? ['efectivo']}
      periodoAnulacionRecibo={
        esPeriodoAnulacion(guarderia?.periodoAnulacionRecibo)
          ? guarderia.periodoAnulacionRecibo
          : PERIODO_ANULACION_DEFAULT
      }
      periodoCargaTesoreria={
        esPeriodoCarga(guarderia?.periodoCargaTesoreria)
          ? guarderia.periodoCargaTesoreria
          : PERIODO_CARGA_DEFAULT
      }
      periodoEdicionTesoreria={
        esPeriodoEdicion(guarderia?.periodoEdicionTesoreria)
          ? guarderia.periodoEdicionTesoreria
          : PERIODO_EDICION_DEFAULT
      }
      diasMorosidad={guarderia?.diasMorosidad ?? null}
      reglamento={reglamento}
      accesoExternoArt={{
        requiereArt: guarderia?.accesoExternoArt ?? false,
        condicion: guarderia?.accesoExternoArtCondicion ?? '',
      }}
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
