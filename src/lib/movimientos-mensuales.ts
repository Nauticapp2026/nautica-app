/**
 * Helpers para generar movimientos mensuales en la cuenta corriente del socio.
 *
 * Uso:
 *  - updateEspacioAction: al asociar un socio a un espacio con tarifa, creamos
 *    el movimiento del mes corriente si todavía no existe.
 *  - Cron mensual (/api/cron/mensuales): el 1ro de cada mes recorre todos los
 *    espacios con ocupante + servicio y crea el movimiento del nuevo mes.
 */

import { and, eq, gte, isNotNull, lte } from 'drizzle-orm';

import { db } from '@/lib/db';
import { espacios, movimientosCuentaCorriente, servicios } from '@/lib/db/schema';

function startOfMonth(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function nextMonthStart(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function endOfMonth(d: Date = new Date()): Date {
  const next = nextMonthStart(d);
  return new Date(next.getTime() - 1);
}

/**
 * Se asegura de que exista el movimiento mensual para (socio, servicio) en el
 * mes corriente. Si ya hay uno en el mismo rango, no hace nada. Devuelve el id
 * si se creó, o null si ya existía.
 */
export async function ensureMonthlyMovimiento(params: {
  socioId: string;
  servicioId: string;
  precio: number;
  concepto: string;
  now?: Date;
}): Promise<string | null> {
  const now = params.now ?? new Date();
  const mStart = startOfMonth(now);
  const mEnd = endOfMonth(now);

  const [existing] = await db
    .select({ id: movimientosCuentaCorriente.id })
    .from(movimientosCuentaCorriente)
    .where(
      and(
        eq(movimientosCuentaCorriente.socioId, params.socioId),
        eq(movimientosCuentaCorriente.servicioId, params.servicioId),
        eq(movimientosCuentaCorriente.tipo, 'mensual'),
        gte(movimientosCuentaCorriente.fecha, mStart),
        lte(movimientosCuentaCorriente.fecha, mEnd),
      ),
    )
    .limit(1);

  if (existing) return null;

  const importe = params.precio.toFixed(2);

  const [row] = await db
    .insert(movimientosCuentaCorriente)
    .values({
      socioId: params.socioId,
      servicioId: params.servicioId,
      concepto: params.concepto,
      tipo: 'mensual',
      estado: 'no_pagado',
      debe: importe,
      importeSigned: importe,
      fecha: now,
      proximoPago: nextMonthStart(now),
    })
    .returning({ id: movimientosCuentaCorriente.id });

  return row?.id ?? null;
}

/**
 * Recorre todos los espacios con ocupante + servicio y asegura el movimiento
 * mensual para cada uno. Se usa desde el cron del 1ro de cada mes.
 */
export async function runMonthlyGeneration(now: Date = new Date()): Promise<{
  created: number;
  scanned: number;
}> {
  const rows = await db
    .select({
      ocupanteId: espacios.ocupanteId,
      servicioId: espacios.servicioId,
      servicioNombre: servicios.nombre,
      servicioPrecio: servicios.precio,
    })
    .from(espacios)
    .innerJoin(servicios, eq(servicios.id, espacios.servicioId))
    .where(and(isNotNull(espacios.ocupanteId), isNotNull(espacios.servicioId)));

  let created = 0;
  for (const r of rows) {
    if (!r.ocupanteId || !r.servicioId) continue;
    const precio = r.servicioPrecio != null ? Number(r.servicioPrecio) : 0;
    const res = await ensureMonthlyMovimiento({
      socioId: r.ocupanteId,
      servicioId: r.servicioId,
      precio,
      concepto: r.servicioNombre,
      now,
    });
    if (res) created++;
  }

  return { created, scanned: rows.length };
}
