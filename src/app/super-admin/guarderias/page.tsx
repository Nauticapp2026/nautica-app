import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  embarcaciones,
  espacios,
  facturacion,
  guarderias,
  guarderiaPlanHistorial,
  memberships,
} from '@/lib/db/schema';
import { GuarderiasClient, type GuarderiaRow, type PlanHistorialEntry } from './guarderias-client';

export const dynamic = 'force-dynamic';

// Primer día del mes corriente expresado en UTC para filtrar por TZ
// Argentina (UTC-3, sin DST). 00:00 AR del día 1 = 03:00 UTC.
function inicioDelMesArgentinoUTC(): Date {
  const now = new Date();
  const arNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(arNow.getUTCFullYear(), arNow.getUTCMonth(), 1, 3, 0, 0));
}

export default async function SuperAdminGuarderiasPage() {
  await requireSuperAdmin();

  const inicioMes = inicioDelMesArgentinoUTC();

  // Queries separadas en vez de subqueries correlacionadas: más robustas y
  // fáciles de leer. count(*)::int devuelve int4, que postgres-js parsea
  // como number — agregamos .mapWith(Number) por las dudas.
  const [
    guarderiasRows,
    usuariosPorGuarderia,
    espaciosPorGuarderia,
    embarcacionesPorGuarderia,
    historialRows,
    facturadoMesPorGuarderia,
  ] = await Promise.all([
    db
      .select({
        id: guarderias.id,
        nombre: guarderias.nombre,
        slug: guarderias.slug,
        ciudad: guarderias.ciudad,
        provincia: guarderias.provincia,
        plan: guarderias.plan,
        activa: guarderias.activa,
        createdAt: guarderias.createdAt,
      })
      .from(guarderias)
      .orderBy(desc(guarderias.createdAt)),

    db
      .select({
        guarderiaId: memberships.guarderiaId,
        count: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(memberships)
      .where(eq(memberships.status, 'active'))
      .groupBy(memberships.guarderiaId),

    db
      .select({
        guarderiaId: espacios.guarderiaId,
        count: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(espacios)
      .groupBy(espacios.guarderiaId),

    db
      .select({
        guarderiaId: embarcaciones.guarderiaId,
        count: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(embarcaciones)
      .groupBy(embarcaciones.guarderiaId),

    db
      .select({
        guarderiaId: guarderiaPlanHistorial.guarderiaId,
        planSlug: guarderiaPlanHistorial.planSlug,
        rate: guarderiaPlanHistorial.rate,
        espacios: guarderiaPlanHistorial.espacios,
        montoMensual: guarderiaPlanHistorial.montoMensual,
        efectivoDesde: guarderiaPlanHistorial.efectivoDesde,
      })
      .from(guarderiaPlanHistorial)
      .orderBy(desc(guarderiaPlanHistorial.efectivoDesde)),

    // Total facturado en el mes calendario corriente (TZ AR). Suma el
    // importe de todas las facturas emitidas — sin importar si están
    // cobradas o no. "Emitidas" = `emision IS NOT NULL`.
    db
      .select({
        guarderiaId: facturacion.guarderiaId,
        total: sql<string>`coalesce(sum(${facturacion.importe}), 0)`.mapWith(Number),
      })
      .from(facturacion)
      .where(and(isNotNull(facturacion.emision), gte(facturacion.emision, inicioMes)))
      .groupBy(facturacion.guarderiaId),
  ]);

  const usuariosMap = new Map(usuariosPorGuarderia.map((r) => [r.guarderiaId, r.count]));
  const espaciosMap = new Map(espaciosPorGuarderia.map((r) => [r.guarderiaId, r.count]));
  const embarcacionesMap = new Map(embarcacionesPorGuarderia.map((r) => [r.guarderiaId, r.count]));
  const facturadoMesMap = new Map(facturadoMesPorGuarderia.map((r) => [r.guarderiaId, r.total]));

  const historialMap = new Map<string, PlanHistorialEntry[]>();
  for (const h of historialRows) {
    const list = historialMap.get(h.guarderiaId) ?? [];
    list.push({
      planSlug: h.planSlug,
      rate: h.rate,
      espacios: h.espacios,
      montoMensual: h.montoMensual,
      efectivoDesde: h.efectivoDesde.toISOString(),
    });
    historialMap.set(h.guarderiaId, list);
  }

  const data: GuarderiaRow[] = guarderiasRows.map((r) => {
    const historial = historialMap.get(r.id) ?? [];
    const tarifaActual = historial[0]?.montoMensual ?? null;
    return {
      id: r.id,
      nombre: r.nombre,
      slug: r.slug,
      ciudad: r.ciudad,
      provincia: r.provincia,
      plan: r.plan,
      activa: r.activa,
      createdAt: r.createdAt.toISOString(),
      usuarios: usuariosMap.get(r.id) ?? 0,
      espacios: espaciosMap.get(r.id) ?? 0,
      embarcaciones: embarcacionesMap.get(r.id) ?? 0,
      tarifaActual,
      facturadoMes: facturadoMesMap.get(r.id) ?? 0,
      historial,
    };
  });

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="page-title">Guarderías</h1>
        <p className="page-subtitle mt-1">
          Todas las guarderías registradas en la plataforma. Eliminar una borra todos sus datos
          (espacios, embarcaciones, facturación, memberships) — las cuentas de los usuarios quedan,
          pueden seguir teniendo acceso a otras guarderías.
        </p>
      </div>

      <GuarderiasClient guarderias={data} />
    </div>
  );
}
