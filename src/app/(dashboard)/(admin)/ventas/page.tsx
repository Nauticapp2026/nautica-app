import { and, count, desc, eq, gte, lte, sql, sum } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  embarcaciones,
  facturacion,
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  paywayCobros,
  profiles,
  servicios,
} from '@/lib/db/schema';

import { VentasClient } from './ventas-client';

export default async function VentasPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [
    [{ pendientesCount }],
    [{ pagadasMes }],
    [{ vencidas }],
    [{ totalFacturado }],
    lista,
    sociosList,
    [guarderiaInfo],
    cobrosLista,
    movsPendientesList,
    movsPendientesInternoList,
    embarcacionesList,
  ] = await Promise.all([
    db
      .select({ pendientesCount: count() })
      .from(facturacion)
      .where(and(eq(facturacion.guarderiaId, gId), eq(facturacion.estado, 'pendiente'))),

    db
      .select({ pagadasMes: count() })
      .from(facturacion)
      .where(
        and(
          eq(facturacion.guarderiaId, gId),
          eq(facturacion.estado, 'pagada'),
          gte(facturacion.emision, startOfMonth),
          lte(facturacion.emision, endOfMonth),
        ),
      ),

    db
      .select({ vencidas: count() })
      .from(facturacion)
      .where(and(eq(facturacion.guarderiaId, gId), eq(facturacion.estado, 'vencida'))),

    db
      .select({ totalFacturado: sum(facturacion.importe) })
      .from(facturacion)
      .where(eq(facturacion.guarderiaId, gId)),

    db
      .select({
        id: facturacion.id,
        codigo: facturacion.codigo,
        folioLocal: facturacion.folioLocal,
        tipoFactura: facturacion.tipoFactura,
        importe: facturacion.importe,
        estado: facturacion.estado,
        emision: facturacion.emision,
        vencimiento: facturacion.vencimiento,
        desde: facturacion.desde,
        hasta: facturacion.hasta,
        archivo: facturacion.archivo,
        descripcion: facturacion.descripcion,
        socioId: facturacion.socioId,
        cae: facturacion.cae,
        facturaOriginalId: facturacion.facturaOriginalId,
        socioNombre: profiles.nombre,
        socioApellido: profiles.apellido,
        socioEmail: profiles.email,
      })
      .from(facturacion)
      .leftJoin(profiles, eq(profiles.id, facturacion.socioId))
      .where(eq(facturacion.guarderiaId, gId))
      .orderBy(desc(facturacion.createdAt))
      .limit(200),

    // Socios activos con cantidad de movimientos pendientes — útil para lote
    db
      .select({
        profileId: profiles.id,
        nombre: profiles.nombre,
        apellido: profiles.apellido,
        email: profiles.email,
        razonSocial: profiles.razonSocial,
        numeroDocumento: profiles.numeroDocumento,
        tipoDocumento: profiles.tipoDocumento,
        cuit: profiles.cuit,
        condicionIva: profiles.condicionIva,
        condicionIvaPersonal: profiles.condicionIvaPersonal,
        // true = factura con datos personales (Generales); false = Datos Impositivos.
        facturaFiscal: memberships.facturaFiscal,
        numeroSocio: memberships.numeroSocio,
        pendientes: sql<number>`count(${movimientosCuentaCorriente.id})::int`,
        pendienteTotal: sql<string>`coalesce(sum(${movimientosCuentaCorriente.debe}), '0')::text`,
      })
      .from(memberships)
      .innerJoin(profiles, eq(profiles.id, memberships.userId))
      .leftJoin(
        movimientosCuentaCorriente,
        and(
          eq(movimientosCuentaCorriente.socioId, profiles.id),
          eq(movimientosCuentaCorriente.estado, 'no_pagado'),
          // Excluir cargos con comprobante interno (no se facturan por TusFacturas).
          eq(movimientosCuentaCorriente.comprobanteInterno, false),
        ),
      )
      .where(
        and(
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
          eq(memberships.status, 'active'),
        ),
      )
      .groupBy(profiles.id, memberships.facturaFiscal, memberships.numeroSocio)
      .orderBy(profiles.apellido, profiles.nombre),

    db
      .select({
        puntoDeVenta: guarderias.puntoDeVenta,
        certificadoAfipOk: guarderias.certificadoAfipOk,
        condicionIva: guarderias.condicionIva,
      })
      .from(guarderias)
      .where(eq(guarderias.id, gId))
      .limit(1),

    db
      .select({
        id: paywayCobros.id,
        socioId: paywayCobros.socioId,
        socioNombre: profiles.nombre,
        socioApellido: profiles.apellido,
        monto: paywayCobros.monto,
        estado: paywayCobros.estado,
        errorMensaje: paywayCobros.errorMensaje,
        movimientosIds: paywayCobros.movimientosIds,
        createdAt: paywayCobros.createdAt,
      })
      .from(paywayCobros)
      .leftJoin(profiles, eq(profiles.id, paywayCobros.socioId))
      .where(eq(paywayCobros.guarderiaId, gId))
      .orderBy(desc(paywayCobros.createdAt))
      .limit(200),

    // Movimientos pendientes individuales para el lote (con tipo de servicio)
    db
      .select({
        id: movimientosCuentaCorriente.id,
        socioId: movimientosCuentaCorriente.socioId,
        concepto: movimientosCuentaCorriente.concepto,
        debe: movimientosCuentaCorriente.debe,
        servicioNombre: servicios.nombre,
        tipoServicio: servicios.tipo,
      })
      .from(movimientosCuentaCorriente)
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, movimientosCuentaCorriente.socioId),
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
          eq(memberships.status, 'active'),
        ),
      )
      .leftJoin(servicios, eq(servicios.id, movimientosCuentaCorriente.servicioId))
      .where(
        and(
          eq(movimientosCuentaCorriente.estado, 'no_pagado'),
          eq(movimientosCuentaCorriente.comprobanteInterno, false),
        ),
      )
      .orderBy(movimientosCuentaCorriente.fecha),

    // Cargos "Interno" pendientes de consolidar en un Comprobante interno.
    db
      .select({
        id: movimientosCuentaCorriente.id,
        socioId: movimientosCuentaCorriente.socioId,
        concepto: movimientosCuentaCorriente.concepto,
        debe: movimientosCuentaCorriente.debe,
        servicioNombre: servicios.nombre,
        tipoServicio: servicios.tipo,
      })
      .from(movimientosCuentaCorriente)
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, movimientosCuentaCorriente.socioId),
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
          eq(memberships.status, 'active'),
        ),
      )
      .leftJoin(servicios, eq(servicios.id, movimientosCuentaCorriente.servicioId))
      .where(
        and(
          eq(movimientosCuentaCorriente.estado, 'no_pagado'),
          eq(movimientosCuentaCorriente.comprobanteInterno, true),
        ),
      )
      .orderBy(movimientosCuentaCorriente.fecha),

    // Embarcaciones por socio, para buscar por embarcación en Facturación
    // manual / Comprobante interno manual.
    db
      .select({ profileId: embarcaciones.profileId, nombre: embarcaciones.nombre })
      .from(embarcaciones)
      .where(eq(embarcaciones.guarderiaId, gId)),
  ]);

  const facturas = lista.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    folioLocal: f.folioLocal,
    tipoFactura: f.tipoFactura,
    importe: f.importe,
    estado: f.estado,
    emision: f.emision ? f.emision.toISOString() : null,
    vencimiento: f.vencimiento ? f.vencimiento.toISOString() : null,
    desde: f.desde ? f.desde.toISOString() : null,
    hasta: f.hasta ? f.hasta.toISOString() : null,
    archivo: f.archivo,
    descripcion: f.descripcion,
    socioId: f.socioId,
    cae: f.cae,
    facturaOriginalId: f.facturaOriginalId,
    socioNombre: [f.socioNombre, f.socioApellido].filter(Boolean).join(' ') || f.socioEmail || '—',
  }));

  const movsBySocio = new Map<
    string,
    {
      id: string;
      concepto: string | null;
      debe: string | null;
      servicioNombre: string | null;
      tipoServicio: string | null;
    }[]
  >();
  for (const m of movsPendientesList) {
    if (!movsBySocio.has(m.socioId)) movsBySocio.set(m.socioId, []);
    movsBySocio.get(m.socioId)!.push({
      id: m.id,
      concepto: m.concepto,
      debe: m.debe,
      servicioNombre: m.servicioNombre,
      tipoServicio: m.tipoServicio,
    });
  }

  const embsBySocio = new Map<string, string[]>();
  for (const e of embarcacionesList) {
    if (!e.profileId) continue;
    if (!embsBySocio.has(e.profileId)) embsBySocio.set(e.profileId, []);
    if (e.nombre) embsBySocio.get(e.profileId)!.push(e.nombre);
  }

  const socios = sociosList.map((s) => ({
    id: s.profileId,
    nombre: [s.nombre, s.apellido].filter(Boolean).join(' ') || s.razonSocial || s.email,
    email: s.email,
    numeroDocumento: s.numeroDocumento ?? '',
    tipoDocumento: s.tipoDocumento ?? null,
    cuit: s.cuit ?? null,
    condicionIva: s.condicionIva ?? null,
    condicionIvaPersonal: s.condicionIvaPersonal ?? null,
    facturaFiscal: s.facturaFiscal,
    numeroSocio: s.numeroSocio,
    embarcaciones: embsBySocio.get(s.profileId) ?? [],
    pendientes: s.pendientes,
    pendienteTotal: s.pendienteTotal,
    movimientos: movsBySocio.get(s.profileId) ?? [],
  }));

  // Cargos "Interno" pendientes, agrupados por socio (para Comprobante interno por lote).
  const movsInternoBySocio = new Map<
    string,
    {
      id: string;
      concepto: string | null;
      debe: string | null;
      servicioNombre: string | null;
      tipoServicio: string | null;
    }[]
  >();
  for (const m of movsPendientesInternoList) {
    if (!movsInternoBySocio.has(m.socioId)) movsInternoBySocio.set(m.socioId, []);
    movsInternoBySocio.get(m.socioId)!.push({
      id: m.id,
      concepto: m.concepto,
      debe: m.debe,
      servicioNombre: m.servicioNombre,
      tipoServicio: m.tipoServicio,
    });
  }
  const sociosInterno = socios
    .map((s) => ({
      id: s.id,
      nombre: s.nombre,
      email: s.email,
      movimientos: movsInternoBySocio.get(s.id) ?? [],
    }))
    .filter((s) => s.movimientos.length > 0);

  const posConfigurado = guarderiaInfo?.puntoDeVenta != null;
  const certificadoOk = guarderiaInfo?.certificadoAfipOk ?? false;
  const guarderiaCondicionIva = guarderiaInfo?.condicionIva ?? null;

  const cobrosPayway = cobrosLista.map((c) => ({
    id: c.id,
    socioId: c.socioId,
    socioNombre: [c.socioNombre, c.socioApellido].filter(Boolean).join(' ') || '—',
    monto: c.monto,
    estado: c.estado,
    errorMensaje: c.errorMensaje,
    movimientosIds: c.movimientosIds,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <VentasClient
      facturas={facturas}
      socios={socios}
      sociosInterno={sociosInterno}
      kpis={{
        pendientes: pendientesCount,
        pagadasMes,
        vencidas,
        totalFacturado: totalFacturado ?? '0',
      }}
      posConfigurado={posConfigurado}
      certificadoOk={certificadoOk}
      cobrosPayway={cobrosPayway}
      guarderiaCondicionIva={guarderiaCondicionIva}
    />
  );
}
