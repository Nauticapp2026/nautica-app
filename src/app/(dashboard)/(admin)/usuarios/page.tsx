import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  areas,
  documentos,
  embarcaciones,
  espacios,
  invitados,
  lados,
  memberships,
  movimientosCuentaCorriente,
  porteria,
  porteriaInvitados,
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
      tipoDocumento: profiles.tipoDocumento,
      numeroDocumento: profiles.numeroDocumento,
      condicionIva: profiles.condicionIva,
      membershipStatus: memberships.status,
      numeroSocio: memberships.numeroSocio,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        eq(memberships.guarderiaId, gId),
        eq(memberships.rol, 'socio'),
        inArray(memberships.status, ['active', 'suspended', 'inactivo']),
      ),
    )
    .orderBy(desc(memberships.createdAt));

  const profileIds = socios.map((s) => s.profileId);

  const [embarcacionesList, movimientosList, espaciosList, docsList, invitadosList, accesosList] =
    await Promise.all([
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
              areaNombre: areas.nombre,
              ladoNombre: lados.nombre,
            })
            .from(espacios)
            .leftJoin(areas, eq(areas.id, espacios.areaId))
            .leftJoin(lados, eq(lados.id, espacios.ladoId))
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
              areaNombre: string | null;
              ladoNombre: string | null;
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

      profileIds.length > 0
        ? db
            .select({
              socioId: invitados.socioId,
              id: invitados.id,
              nombre: invitados.nombre,
              apellido: invitados.apellido,
              estado: invitados.estado,
              validoHasta: invitados.validoHasta,
            })
            .from(invitados)
            .where(
              and(
                inArray(invitados.socioId, profileIds as string[]),
                eq(invitados.guarderiaId, gId),
                eq(invitados.estado, 'activo'),
              ),
            )
        : Promise.resolve(
            [] as {
              socioId: string | null;
              id: string;
              nombre: string;
              apellido: string | null;
              estado: 'activo' | 'inactivo' | null;
              validoHasta: Date | null;
            }[],
          ),

      profileIds.length > 0
        ? db
            .select({
              socioId: porteria.socioId,
              id: porteria.id,
              desde: porteria.desde,
              motivo: porteria.motivo,
              invitadoNombre: invitados.nombre,
              invitadoApellido: invitados.apellido,
            })
            .from(porteria)
            .leftJoin(porteriaInvitados, eq(porteriaInvitados.porteriaId, porteria.id))
            .leftJoin(invitados, eq(invitados.id, porteriaInvitados.invitadoId))
            .where(
              and(
                inArray(porteria.socioId, profileIds as string[]),
                eq(porteria.guarderiaId, gId),
                eq(porteria.tipo, 'acceso_externo'),
              ),
            )
            .orderBy(desc(porteria.createdAt))
        : Promise.resolve(
            [] as {
              socioId: string | null;
              id: string;
              desde: Date | null;
              motivo: string | null;
              invitadoNombre: string | null;
              invitadoApellido: string | null;
            }[],
          ),
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
    const partes = [e.areaNombre, e.ladoNombre, e.nomenclatura].filter(Boolean);
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

  const invitadosBySocio = new Map<
    string,
    { id: string; nombre: string; apellido: string | null; validoHasta: string | null }[]
  >();
  for (const inv of invitadosList) {
    if (!inv.socioId) continue;
    if (!invitadosBySocio.has(inv.socioId)) invitadosBySocio.set(inv.socioId, []);
    invitadosBySocio.get(inv.socioId)!.push({
      id: inv.id,
      nombre: inv.nombre,
      apellido: inv.apellido,
      validoHasta: inv.validoHasta?.toISOString() ?? null,
    });
  }

  const accesosBySocio = new Map<string, { id: string; nombre: string | null }[]>();
  const accesosIdsSeen = new Set<string>();
  for (const acc of accesosList) {
    if (!acc.socioId || accesosIdsSeen.has(acc.id)) continue;
    accesosIdsSeen.add(acc.id);
    if (!accesosBySocio.has(acc.socioId)) accesosBySocio.set(acc.socioId, []);
    const arr = accesosBySocio.get(acc.socioId)!;
    if (arr.length < 5) {
      const nombre =
        [acc.invitadoNombre, acc.invitadoApellido].filter(Boolean).join(' ') || acc.motivo || null;
      arr.push({ id: acc.id, nombre });
    }
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
    const tieneEmbarcacion = Boolean(s.profileId && embByProfile[s.profileId]);
    const datosIncompletos =
      !s.nombre?.trim() ||
      !s.apellido?.trim() ||
      !s.telefono?.trim() ||
      !s.tipoDocumento ||
      !s.numeroDocumento?.trim() ||
      !s.direccion?.trim() ||
      !s.condicionIva ||
      !tieneEmbarcacion;
    return {
      ...s,
      deuda: deuda.toFixed(2),
      estadoSocio: (morososSet.has(s.profileId) ? 'moroso' : 'activo') as 'moroso' | 'activo',
      membershipStatus: s.membershipStatus as 'active' | 'suspended' | 'inactivo',
      numeroSocio: s.numeroSocio,
      embarcacion: s.profileId ? (embByProfile[s.profileId] ?? null) : null,
      ubicacion: s.profileId ? (ubicacionByProfile[s.profileId] ?? null) : null,
      docsCompletos,
      datosIncompletos,
      invitados: invitadosBySocio.get(s.profileId) ?? [],
      accesosExternos: accesosBySocio.get(s.profileId) ?? [],
    };
  });

  return <UsuariosClient socios={sociosData} initialFiltro={initialFiltro} />;
}
