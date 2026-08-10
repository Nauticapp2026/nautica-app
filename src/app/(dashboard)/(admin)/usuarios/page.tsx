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
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getPoolRestanteBatch } from '@/lib/reconciliar-cuenta';
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
      membresiaCreatedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        eq(memberships.guarderiaId, gId),
        eq(memberships.rol, 'socio'),
        inArray(memberships.status, ['active', 'inactivo']),
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
            // Excluir personas que son acceso externo: si tienen registro en
            // porteria_invitados van a la sección "Accesos externos", no a "Invitados".
            .leftJoin(porteriaInvitados, eq(porteriaInvitados.invitadoId, invitados.id))
            .where(
              and(
                inArray(invitados.socioId, profileIds as string[]),
                eq(invitados.guarderiaId, gId),
                eq(invitados.estado, 'activo'),
                isNull(porteriaInvitados.id),
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
    // Saldo: mismo criterio que la card "Saldo cliente" del detalle del socio —
    // todos los movimientos, sin filtrar por estado (Σdebe − Σhaber).
    debeBySocio.set(m.socioId, (debeBySocio.get(m.socioId) ?? 0) + debe);
    haberBySocio.set(m.socioId, (haberBySocio.get(m.socioId) ?? 0) + haber);
    // Moroso: deuda impaga (no_pagado) con 2+ meses de antigüedad.
    if (m.estado === 'no_pagado' && m.fecha && m.fecha <= dosMesesAtras) {
      morososSet.add(m.socioId);
    }
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

  const accesosBySocio = new Map<
    string,
    { id: string; nombre: string | null; desde: string | null }[]
  >();
  // Clave de deduplicación por socio: evitar mostrar la misma persona dos veces.
  // El query viene ordenado DESC por createdAt, así la primera ocurrencia es la más reciente.
  const accesoNombresSeen = new Map<string, Set<string>>();
  for (const acc of accesosList) {
    if (!acc.socioId) continue;
    if (!accesosBySocio.has(acc.socioId)) accesosBySocio.set(acc.socioId, []);
    if (!accesoNombresSeen.has(acc.socioId)) accesoNombresSeen.set(acc.socioId, new Set());
    const arr = accesosBySocio.get(acc.socioId)!;
    const nombre =
      [acc.invitadoNombre, acc.invitadoApellido].filter(Boolean).join(' ') || acc.motivo || null;
    const key = nombre?.toLowerCase().trim() ?? acc.id;
    if (accesoNombresSeen.get(acc.socioId)!.has(key)) continue;
    accesoNombresSeen.get(acc.socioId)!.add(key);
    if (arr.length < 5) {
      arr.push({ id: acc.id, nombre, desde: acc.desde?.toISOString() ?? null });
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

  // Saldo a favor real: el mismo pool FIFO que ofrece Cobranzas al cobrar. El
  // neto crudo (haber − debe) daba $0 en cuanto el socio tenía más deuda que
  // crédito, aunque ese crédito siguiera sin usar — por eso la lista mostraba un
  // número distinto al del modal de cobranza.
  const poolPorSocio = await getPoolRestanteBatch(socios.map((s) => s.profileId));

  const sociosData = socios.map((s) => {
    const debe = debeBySocio.get(s.profileId) ?? 0;
    const haber = haberBySocio.get(s.profileId) ?? 0;
    const deuda = Math.max(0, debe - haber);
    const saldoAFavor = poolPorSocio.get(s.profileId) ?? 0;
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
      // Saldo neto real (debe − haber): positivo = nos debe, negativo = saldo a
      // favor. Permite mostrar el "a favor" en la lista (deuda lo recorta a 0).
      saldoNeto: (debe - haber).toFixed(2),
      // Crédito sin usar (pool FIFO). Puede convivir con deuda: un adelanto
      // targeteado a un comprobante nuevo no cancela una deuda vieja. Es el
      // mismo número que Cobranzas ofrece aplicar.
      saldoAFavor: saldoAFavor.toFixed(2),
      // Moroso solo si además tiene saldo neto positivo: si pagó (aunque sea con
      // "Registrar pago", que deja los cargos viejos en no_pagado), deuda = 0 y
      // deja de figurar como moroso.
      estadoSocio: (morososSet.has(s.profileId) && deuda > 0.001 ? 'moroso' : 'activo') as
        | 'moroso'
        | 'activo',
      membershipStatus: s.membershipStatus as 'active' | 'inactivo',
      numeroSocio: s.numeroSocio,
      embarcacion: s.profileId ? (embByProfile[s.profileId] ?? null) : null,
      ubicacion: s.profileId ? (ubicacionByProfile[s.profileId] ?? null) : null,
      docsCompletos,
      datosIncompletos,
      fechaIngreso: s.membresiaCreatedAt?.toISOString() ?? null,
      invitados: invitadosBySocio.get(s.profileId) ?? [],
      accesosExternos: accesosBySocio.get(s.profileId) ?? [],
    };
  });

  return <UsuariosClient socios={sociosData} initialFiltro={initialFiltro} />;
}
