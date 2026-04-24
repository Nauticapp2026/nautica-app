import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { areas, espacios, lados, marinas, naves, pisos } from '@/lib/db/schema';

import { EspaciosClient, type AreaView, type EspacioCell } from './espacios-client';

export default async function EspaciosPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const isAdmin = ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
  if (!isAdmin) redirect('/dashboard');

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [areasRows, marinasRows, navesRows, ladosRows, pisosRows, espaciosRows] = await Promise.all(
    [
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

      db
        .select({ id: pisos.id, ladoId: pisos.ladoId, nombre: pisos.nombre, orden: pisos.orden })
        .from(pisos),

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
        })
        .from(espacios)
        .where(eq(espacios.guarderiaId, guarderiaId)),
    ],
  );

  // Mapa auxiliar: marinaId -> espacios ordenados por nomenclatura numérica
  const espaciosPorMarina = new Map<string, EspacioCell[]>();
  const espaciosPorPiso = new Map<string, EspacioCell[]>();

  for (const e of espaciosRows) {
    const cell: EspacioCell = {
      id: e.id,
      nomenclatura: e.nomenclatura ?? '',
      estado: (e.estado ?? 'disponible') as EspacioCell['estado'],
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

  const byNum = (a: EspacioCell, b: EspacioCell) => {
    const na = Number(a.nomenclatura);
    const nb = Number(b.nomenclatura);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.nomenclatura.localeCompare(b.nomenclatura);
  };
  for (const arr of espaciosPorMarina.values()) arr.sort(byNum);
  for (const arr of espaciosPorPiso.values()) arr.sort(byNum);

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

  return <EspaciosClient areas={areasView} />;
}
