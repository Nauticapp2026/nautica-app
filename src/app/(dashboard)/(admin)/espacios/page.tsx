import { redirect } from 'next/navigation';

// Forzar dynamic rendering para que siempre traiga data fresca después de un
// reorder de espacios (evita caches RSC).
export const dynamic = 'force-dynamic';
import { and, asc, eq } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  areas,
  embarcaciones,
  espacios,
  lados,
  marinas,
  memberships,
  naves,
  pisos,
  profiles,
  servicios,
} from '@/lib/db/schema';

import {
  EspaciosClient,
  type AreaView,
  type EspacioCell,
  type ServicioEspacio,
  type SocioOpt,
} from './espacios-client';

export default async function EspaciosPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const isAdmin =
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo';
  if (!isAdmin) redirect('/dashboard');

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [
    areasRows,
    marinasRows,
    navesRows,
    ladosRows,
    pisosRows,
    espaciosRows,
    sociosRows,
    serviciosRows,
    embarcacionesRows,
  ] = await Promise.all([
    db
      .select({ id: areas.id, nombre: areas.nombre })
      .from(areas)
      .where(eq(areas.guarderiaId, guarderiaId))
      .orderBy(asc(areas.createdAt)),

    db
      .select({
        id: marinas.id,
        areaId: marinas.areaId,
        nombre: marinas.nombre,
        orden: marinas.orden,
      })
      .from(marinas)
      .where(eq(marinas.guarderiaId, guarderiaId))
      .orderBy(asc(marinas.orden)),

    db
      .select({ id: naves.id, areaId: naves.areaId, nombre: naves.nombre })
      .from(naves)
      .where(eq(naves.guarderiaId, guarderiaId))
      .orderBy(asc(naves.orden)),

    db
      .select({
        id: lados.id,
        naveId: lados.naveId,
        nombre: lados.nombre,
        cantidadPisos: lados.cantidadPisos,
      })
      .from(lados)
      .where(eq(lados.guarderiaId, guarderiaId)),

    // pisos no tiene guarderia_id directo — lo derivamos por lados.
    // Join + filter para que el server solo traiga pisos de esta guardería.
    db
      .select({ id: pisos.id, ladoId: pisos.ladoId, nombre: pisos.nombre, orden: pisos.orden })
      .from(pisos)
      .innerJoin(lados, eq(lados.id, pisos.ladoId))
      .where(eq(lados.guarderiaId, guarderiaId)),

    db
      .select({
        id: espacios.id,
        areaId: espacios.areaId,
        naveId: espacios.naveId,
        ladoId: espacios.ladoId,
        pisoId: espacios.pisoId,
        marinaId: espacios.marinaId,
        nomenclatura: espacios.nomenclatura,
        estado: espacios.estado,
        ocupanteId: espacios.ocupanteId,
        servicioId: espacios.servicioId,
        eslora: espacios.eslora,
        manga: espacios.manga,
        puntual: espacios.puntual,
      })
      .from(espacios)
      .where(eq(espacios.guarderiaId, guarderiaId))
      .orderBy(asc(espacios.orden), asc(espacios.createdAt)),

    db
      .select({
        id: profiles.id,
        nombre: profiles.nombre,
        apellido: profiles.apellido,
        email: profiles.email,
      })
      .from(memberships)
      .innerJoin(profiles, eq(profiles.id, memberships.userId))
      .where(
        and(
          eq(memberships.guarderiaId, guarderiaId),
          eq(memberships.rol, 'socio'),
          eq(memberships.status, 'active'),
        ),
      )
      .orderBy(asc(profiles.apellido), asc(profiles.nombre)),

    db
      .select({
        id: servicios.id,
        nombre: servicios.nombre,
        precio: servicios.precio,
        eslora: servicios.eslora,
        manga: servicios.manga,
        puntual: servicios.puntual,
        unidadMetraje: servicios.unidadMetraje,
      })
      .from(servicios)
      .where(
        and(
          eq(servicios.guarderiaId, guarderiaId),
          eq(servicios.tipo, 'espacios'),
          eq(servicios.estado, 'activo'),
        ),
      )
      .orderBy(asc(servicios.nombre)),

    // Embarcaciones de la guardería (solo lo necesario para el filtro de
    // tamaño en el modal "Cambiar ubicación"). El barco se guarda en
    // metros vía eslora_m.
    db
      .select({
        profileId: embarcaciones.profileId,
        esloraM: embarcaciones.esloraM,
      })
      .from(embarcaciones)
      .where(eq(embarcaciones.guarderiaId, guarderiaId)),
  ]);

  const toNum = (v: string | null) => (v != null ? Number(v) : null);

  // Mapa auxiliar: marinaId -> espacios ordenados por nomenclatura numérica
  const espaciosPorMarina = new Map<string, EspacioCell[]>();
  const espaciosPorPiso = new Map<string, EspacioCell[]>();

  for (const e of espaciosRows) {
    const cell: EspacioCell = {
      id: e.id,
      nomenclatura: e.nomenclatura ?? '',
      estado: (e.estado ?? 'disponible') as EspacioCell['estado'],
      ocupanteId: e.ocupanteId,
      servicioId: e.servicioId,
      eslora: toNum(e.eslora),
      manga: toNum(e.manga),
      puntual: toNum(e.puntual),
    };
    if (e.marinaId) {
      const arr = espaciosPorMarina.get(e.marinaId) ?? [];
      arr.push(cell);
      espaciosPorMarina.set(e.marinaId, arr);
    } else if (e.pisoId) {
      const arr = espaciosPorPiso.get(e.pisoId) ?? [];
      arr.push(cell);
      espaciosPorPiso.set(e.pisoId, arr);
    }
  }

  // No re-sort por nomenclatura — la query ya viene ordenada por
  // `orden` ASC, `createdAt` ASC. Re-sortear acá pisaba el reorder
  // manual del admin (drag-and-drop seteaba `orden` pero este sort
  // lo ignoraba).

  // Armar vista por área
  const areasView: AreaView[] = areasRows.map((a) => {
    const marinasDelArea = marinasRows.filter((m) => m.areaId === a.id);
    const navesDelArea = navesRows.filter((n) => n.areaId === a.id);

    if (marinasDelArea.length > 0) {
      const peines = marinasDelArea.map((m) => ({
        marinaId: m.id,
        nombre: m.nombre,
        espacios: espaciosPorMarina.get(m.id) ?? [],
      }));
      return {
        id: a.id,
        nombre: a.nombre,
        tipo: 'marina' as const,
        peines,
        lados: [],
      };
    }

    if (navesDelArea.length > 0) {
      const ladosArea: AreaView['lados'] = [];
      for (const n of navesDelArea) {
        const ladosDeNave = ladosRows.filter((l) => l.naveId === n.id);
        for (const l of ladosDeNave) {
          const pisosDeLado = pisosRows
            .filter((p) => p.ladoId === l.id)
            .sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0));
          ladosArea.push({
            ladoId: l.id,
            nombre: l.nombre,
            pisos: pisosDeLado.map((p) => ({
              pisoId: p.id,
              nombre: p.nombre,
              espacios: espaciosPorPiso.get(p.id) ?? [],
            })),
          });
        }
      }
      return {
        id: a.id,
        nombre: a.nombre,
        tipo: 'nave' as const,
        peines: [],
        lados: ladosArea,
      };
    }

    // Área vacía (sin marinas ni naves cargadas todavía)
    return { id: a.id, nombre: a.nombre, tipo: 'marina' as const, peines: [], lados: [] };
  });

  const socios: SocioOpt[] = sociosRows.map((s) => ({
    id: s.id,
    nombre: [s.nombre, s.apellido].filter(Boolean).join(' ').trim() || s.email,
  }));

  const serviciosEspacios: ServicioEspacio[] = serviciosRows.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    precio: s.precio != null ? Number(s.precio) : 0,
    eslora: toNum(s.eslora),
    manga: toNum(s.manga),
    puntual: toNum(s.puntual),
    unidadMetraje: s.unidadMetraje ?? null,
  }));

  // Mapa socioId → eslora máxima en metros entre sus embarcaciones. Se
  // usa para validar tamaño al mudar a un ocupante en "Cambiar ubicación".
  const esloraMaxPorSocio: Record<string, number> = {};
  for (const e of embarcacionesRows) {
    if (!e.profileId) continue;
    const v = e.esloraM != null ? Number(e.esloraM) : 0;
    if (v <= 0) continue;
    const actual = esloraMaxPorSocio[e.profileId] ?? 0;
    if (v > actual) esloraMaxPorSocio[e.profileId] = v;
  }

  return (
    <EspaciosClient
      areas={areasView}
      socios={socios}
      serviciosEspacios={serviciosEspacios}
      esloraMaxPorSocio={esloraMaxPorSocio}
    />
  );
}
