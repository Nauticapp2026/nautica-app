import { and, count, desc, eq, gte, lte, sql, sum } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  facturacion,
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  profiles,
} from '@/lib/db/schema';

import { FacturacionClient } from './facturacion-client';

export default async function FacturacionPage() {
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
        ),
      )
      .where(
        and(
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
          eq(memberships.status, 'active'),
        ),
      )
      .groupBy(profiles.id)
      .orderBy(profiles.apellido, profiles.nombre),

    db
      .select({
        puntoDeVenta: guarderias.puntoDeVenta,
        certificadoAfipOk: guarderias.certificadoAfipOk,
      })
      .from(guarderias)
      .where(eq(guarderias.id, gId))
      .limit(1),
  ]);

  const facturas = lista.map((f) => ({
    id: f.id,
    codigo: f.codigo,
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
    socioNombre: [f.socioNombre, f.socioApellido].filter(Boolean).join(' ') || f.socioEmail || '—',
  }));

  const socios = sociosList.map((s) => ({
    id: s.profileId,
    nombre: [s.nombre, s.apellido].filter(Boolean).join(' ') || s.razonSocial || s.email,
    email: s.email,
    numeroDocumento: s.numeroDocumento ?? '',
    pendientes: s.pendientes,
    pendienteTotal: s.pendienteTotal,
  }));

  const posConfigurado = guarderiaInfo?.puntoDeVenta != null;
  const certificadoOk = guarderiaInfo?.certificadoAfipOk ?? false;

  return (
    <FacturacionClient
      facturas={facturas}
      socios={socios}
      kpis={{
        pendientes: pendientesCount,
        pagadasMes,
        vencidas,
        totalFacturado: totalFacturado ?? '0',
      }}
      posConfigurado={posConfigurado}
      certificadoOk={certificadoOk}
    />
  );
}
