import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  areas,
  documentos,
  embarcaciones,
  espacios,
  memberships,
  movimientosCuentaCorriente,
  profiles,
} from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { UsuariosClient, type FiltroSocios } from './usuarios-client';

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro } = await searchParams;
  const initialFiltro: FiltroSocios | null =
    filtro === 'morosos' || filtro === 'docs-incompletas' ? filtro : null;

  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;

  const socios = await db
    .select({
      membresiaId: memberships.id,
      profileId: profiles.id,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      email: profiles.email,
      telefono: profiles.telefono,
      direccion: profiles.direccion,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        eq(memberships.guarderiaId, gId),
        eq(memberships.rol, 'socio'),
        eq(memberships.status, 'active'),
      ),
    )
    .orderBy(desc(memberships.createdAt));

  const profileIds = socios.map((s) => s.profileId);

  const [embarcacionesList, movimientosList, espaciosList, docsList] = await Promise.all([
    profileIds.length > 0
      ? db
          .select({ profileId: embarcaciones.profileId, nombre: embarcaciones.nombre })
          .from(embarcaciones)
          .where(inArray(embarcaciones.profileId, profileIds as string[]))
      : Promise.resolve([] as { profileId: string | null; nombre: string }[]),

    // Deuda + estado moroso se calculan desde movimientos en lugar de leer
    // profiles.deuda / profiles.estado_socio (esos campos están sin
    // sincronización con movimientos y suelen estar stale).
    profileIds.length > 0
      ? db
          .select({
            socioId: movimientosCuentaCorriente.socioId,
            estado: movimientosCuentaCorriente.estado,
            debe: movimientosCuentaCorriente.debe,
            haber: movimientosCuentaCorriente.haber,
            fecha: movimientosCuentaCorriente.fecha,
          })
          .from(movimientosCuentaCorriente)
          .where(inArray(movimientosCuentaCorriente.socioId, profileIds as string[]))
      : Promise.resolve(
          [] as {
            socioId: string;
            estado: 'pagado' | 'no_pagado' | 'facturado' | null;
            debe: string | null;
            haber: string | null;
            fecha: Date | null;
          }[],
        ),

    // Ubicación asignada del socio: espacio que tiene a este profile como
    // ocupante. Traemos también el nombre del área para mostrar "Marina /
    // A5" o "Galpón / B3" según corresponda. Si el socio no tiene espacio
    // asignado, la columna queda en —.
    profileIds.length > 0
      ? db
          .select({
            ocupanteId: espacios.ocupanteId,
            nomenclatura: espacios.nomenclatura,
            marinaId: espacios.marinaId,
            pisoId: espacios.pisoId,
            areaNombre: areas.nombre,
          })
          .from(espacios)
          .leftJoin(areas, eq(areas.id, espacios.areaId))
          .where(
            and(
              eq(espacios.guarderiaId, gId),
              inArray(espacios.ocupanteId, profileIds as string[]),
            ),
          )
      : Promise.resolve(
          [] as {
            ocupanteId: string | null;
            nomenclatura: string | null;
            marinaId: string | null;
            pisoId: string | null;
            areaNombre: string | null;
          }[],
        ),

    // Documentos por socio. Un socio se considera completo si tiene al menos
    // un documento de cada uno de los 3 tipos requeridos (mismo criterio que
    // dashboard/page.tsx).
    profileIds.length > 0
      ? db
          .select({ profileId: documentos.profileId, tipo: documentos.tipo })
          .from(documentos)
          .where(inArray(documentos.profileId, profileIds as string[]))
      : Promise.resolve([] as { profileId: string; tipo: string | null }[]),
  ]);

  const embByProfile: Record<string, string> = {};
  for (const e of embarcacionesList) {
    if (e.profileId && !embByProfile[e.profileId]) embByProfile[e.profileId] = e.nombre;
  }

  // Ubicación: si tiene espacio asignado, mostrar "{area} · {nomenclatura}"
  // (e.g. "Marina Norte · A5" o "Galpón B · B3"). Si tiene varios espacios,
  // tomamos el primero (el caso múltiple no es común).
  const ubicacionByProfile: Record<string, string> = {};
  for (const e of espaciosList) {
    if (!e.ocupanteId || ubicacionByProfile[e.ocupanteId]) continue;
    const partes = [e.areaNombre, e.nomenclatura].filter(Boolean);
    ubicacionByProfile[e.ocupanteId] = partes.join(' · ') || '—';
  }

  // Agregar por socio: total debe de no_pagados, total haber, y flag moroso
  // (al menos un no_pagado con fecha >= 2 meses atrás).
  const now = new Date();
  const dosMesesAtras = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());

  const debeBySocio = new Map<string, number>();
  const haberBySocio = new Map<string, number>();
  const morososSet = new Set<string>();
  for (const m of movimientosList) {
    const debe = parseFloat(m.debe ?? '0');
    const haber = parseFloat(m.haber ?? '0');
    if (m.estado === 'no_pagado') {
      debeBySocio.set(m.socioId, (debeBySocio.get(m.socioId) ?? 0) + debe);
      if (m.fecha && m.fecha <= dosMesesAtras) morososSet.add(m.socioId);
    }
    haberBySocio.set(m.socioId, (haberBySocio.get(m.socioId) ?? 0) + haber);
  }

  const TIPOS_REQUERIDOS = new Set(['carnet_nautico', 'matricula', 'seguro']);
  const tiposPorSocio = new Map<string, Set<string>>();
  for (const r of docsList) {
    if (!tiposPorSocio.has(r.profileId)) tiposPorSocio.set(r.profileId, new Set());
    if (r.tipo && TIPOS_REQUERIDOS.has(r.tipo)) {
      tiposPorSocio.get(r.profileId)!.add(r.tipo);
    }
  }

  const sociosData = socios.map((s) => {
    const debe = debeBySocio.get(s.profileId) ?? 0;
    const haber = haberBySocio.get(s.profileId) ?? 0;
    const deuda = Math.max(0, debe - haber);
    const tipos = tiposPorSocio.get(s.profileId);
    const docsCompletos = (tipos?.size ?? 0) >= TIPOS_REQUERIDOS.size;
    return {
      ...s,
      deuda: deuda.toFixed(2),
      estadoSocio: (morososSet.has(s.profileId) ? 'moroso' : 'activo') as 'moroso' | 'activo',
      embarcacion: s.profileId ? (embByProfile[s.profileId] ?? null) : null,
      ubicacion: s.profileId ? (ubicacionByProfile[s.profileId] ?? null) : null,
      docsCompletos,
    };
  });

  return <UsuariosClient socios={sociosData} initialFiltro={initialFiltro} />;
}
