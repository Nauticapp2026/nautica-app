/**
 * Auto-emisión de facturas mensuales.
 *
 * Disparada por el cron diario, después de generar movimientos mensuales.
 * Para cada socio de las guarderías que cumplen `diaFacturacion === hoy`:
 *   1. Idempotencia: si ya hay factura creada hoy para este socio, skip.
 *   2. Regla "primera factura manual": solo emite si el socio ya tiene
 *      >= 1 factura emitida (la primera siempre la hace el admin).
 *   3. Solo emite si el socio tiene movimientos pendientes (debe > 0).
 *   4. Copia tipo/condicion/medioPago de la última factura del socio
 *      como heurística para que el formato siga siendo el que usó el
 *      admin la primera vez.
 *
 * Errores: si tusfacturas falla para un socio, se loguea y se sigue
 * con el siguiente.
 */

import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { facturacion, memberships, movimientosCuentaCorriente } from '@/lib/db/schema';
import { crearFacturaCore } from '@/app/actions/facturacion';

type AutoEmisionResult = {
  emitted: number;
  skippedSinFacturaPrevia: number;
  skippedSinPendientes: number;
  skippedYaEmitidaHoy: number;
  failed: { socioId: string; error: string }[];
};

const VENCIMIENTO_DIAS_DEFAULT = 10;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function runAutoEmision(
  guarderiaIds: string[],
  now: Date = new Date(),
): Promise<AutoEmisionResult> {
  const result: AutoEmisionResult = {
    emitted: 0,
    skippedSinFacturaPrevia: 0,
    skippedSinPendientes: 0,
    skippedYaEmitidaHoy: 0,
    failed: [],
  };

  if (guarderiaIds.length === 0) return result;

  const inicioHoy = startOfDay(now);
  const finHoy = addDays(inicioHoy, 1);

  for (const guarderiaId of guarderiaIds) {
    const sociosRows = await db
      .select({ socioId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.guarderiaId, guarderiaId),
          eq(memberships.status, 'active'),
          eq(memberships.rol, 'socio'),
        ),
      );

    for (const { socioId } of sociosRows) {
      // 1. Idempotencia: si ya hay factura creada hoy, skip.
      const [yaHoy] = await db
        .select({ n: count() })
        .from(facturacion)
        .where(
          and(
            eq(facturacion.guarderiaId, guarderiaId),
            eq(facturacion.socioId, socioId),
            gte(facturacion.emision, inicioHoy),
            lte(facturacion.emision, finHoy),
          ),
        );

      if ((yaHoy?.n ?? 0) > 0) {
        result.skippedYaEmitidaHoy++;
        continue;
      }

      // 2. Regla "primera factura manual": skip si nunca tuvo factura.
      const [previas] = await db
        .select({ n: count() })
        .from(facturacion)
        .where(and(eq(facturacion.guarderiaId, guarderiaId), eq(facturacion.socioId, socioId)));

      if ((previas?.n ?? 0) === 0) {
        result.skippedSinFacturaPrevia++;
        continue;
      }

      // 3. Movimientos pendientes con debe > 0 (los pagos a cuenta tienen
      //    haber > 0 / debe = 0; no se facturan). createInvoiceAction se
      //    encarga de marcar los movimientos como 'facturado' al linkearlos,
      //    así que filtrar por estado='no_pagado' alcanza.
      const pendientes = await db
        .select({ id: movimientosCuentaCorriente.id })
        .from(movimientosCuentaCorriente)
        .where(
          and(
            eq(movimientosCuentaCorriente.socioId, socioId),
            eq(movimientosCuentaCorriente.estado, 'no_pagado'),
            sql`${movimientosCuentaCorriente.debe} > 0`,
          ),
        );

      if (pendientes.length === 0) {
        result.skippedSinPendientes++;
        continue;
      }

      // 4. Copiar formato de la última factura.
      const [ultima] = await db
        .select({
          tipoFactura: facturacion.tipoFactura,
          condicionVenta: facturacion.condicionVenta,
          medioPago: facturacion.medioPago,
        })
        .from(facturacion)
        .where(and(eq(facturacion.guarderiaId, guarderiaId), eq(facturacion.socioId, socioId)))
        .orderBy(desc(facturacion.emision))
        .limit(1);

      if (!ultima) {
        result.skippedSinFacturaPrevia++;
        continue;
      }

      const fechaFactura = ymd(now);
      const venc = ymd(addDays(now, VENCIMIENTO_DIAS_DEFAULT));
      const desde = ymd(startOfMonth(now));
      const hasta = ymd(endOfMonth(now));

      const r = await crearFacturaCore({
        guarderiaId,
        socioId,
        tipoFactura: ultima.tipoFactura as 'factura_a' | 'factura_b' | 'factura_c',
        condicionVenta: ultima.condicionVenta as never,
        medioPago: ultima.medioPago as never,
        estado: 'pendiente',
        descripcion: `Facturación mensual ${fechaFactura}`,
        fecha: fechaFactura,
        vencimiento: venc,
        desde,
        hasta,
        movimientoIds: pendientes.map((p) => p.id),
      });

      if (r.error) {
        console.error('[auto-facturacion] error en socio', {
          guarderiaId,
          socioId,
          error: r.error,
        });
        result.failed.push({ socioId, error: r.error });
        continue;
      }

      result.emitted++;
    }
  }

  return result;
}
