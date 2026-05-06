/**
 * Helpers para generar movimientos mensuales en la cuenta corriente del socio.
 *
 * Modelo de cobro:
 *  - Espacios con `fechaAsignacion` (modelo aniversario, post deploy 0016):
 *    el cron diario los cobra el mismo día de mes en que fueron asignados.
 *    Si el día no existe en el mes (ej. asignación 31, febrero), cobra
 *    el último día del mes.
 *  - Espacios con `fechaAsignacion = NULL` (modelo viejo, espacios ya
 *    asignados antes del deploy 0016): el cron los cobra el día 1 de
 *    cada mes, como antes.
 *
 * Uso:
 *  - updateEspacioAction: al asociar un socio a un espacio con tarifa,
 *    creamos el movimiento del mes corriente prorrateado por los días
 *    que quedan hasta fin de mes.
 *  - Cron diario (/api/cron/mensuales): recorre todos los espacios con
 *    ocupante + servicio y, para cada uno, decide si hoy es su día de
 *    cobro. Si sí, crea el movimiento mensual completo.
 */

import { and, eq, gte, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { espacios, movimientosCuentaCorriente, servicios } from '@/lib/db/schema';

function nextMonthStart(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * Dado un día N restando 27 días desde `now`. Sirve como ventana de
 * idempotencia: garantizamos que no se cobre dos veces dentro de un
 * ciclo (el ciclo más corto entre cobros consecutivos es 28 días en
 * febrero no bisiesto).
 */
function hace27Dias(now: Date): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 27);
  return d;
}

/**
 * Para asignaciones a mitad de mes, cobramos solo los días que quedan
 * (incluye el día de asignación). Si la fecha es el día 1, devuelve el
 * mes completo. El cron mensual usa siempre el precio completo.
 */
export function calcularProporcionalMes(
  precio: number,
  fecha: Date = new Date(),
): {
  importe: number;
  diasRestantes: number;
  diasMes: number;
  esProporcional: boolean;
} {
  const diasMes = daysInMonth(fecha);
  const diaActual = fecha.getUTCDate();
  const diasRestantes = diasMes - diaActual + 1;
  const importe = Math.round((precio / diasMes) * diasRestantes * 100) / 100;
  return {
    importe,
    diasRestantes,
    diasMes,
    esProporcional: diasRestantes !== diasMes,
  };
}

/**
 * Determina si `hoy` es el día de cobro mensual para un espacio asignado
 * en `fechaAsignacion`. Si el día original no existe en el mes corriente
 * (ej. asignación día 31, mes con 28 días), cobra el último día del mes.
 */
export function esDiaDeCobro(fechaAsignacion: Date, hoy: Date = new Date()): boolean {
  const diaOriginal = fechaAsignacion.getUTCDate();
  const diaEfectivo = Math.min(diaOriginal, daysInMonth(hoy));
  return hoy.getUTCDate() === diaEfectivo;
}

/**
 * Se asegura de que exista un movimiento mensual para (socio, espacio)
 * en los últimos 27 días. Si ya hay uno, no hace nada. Devuelve el id si
 * se creó, o null si ya existía.
 *
 * La ventana de 27 días cubre tanto el modelo viejo (cobros mensuales el
 * día 1) como el modelo aniversario (ciclos de 28-31 días) sin permitir
 * duplicados.
 */
export async function ensureMonthlyMovimiento(params: {
  socioId: string;
  espacioId: string;
  servicioId: string;
  precio: number;
  concepto: string;
  now?: Date;
}): Promise<string | null> {
  const now = params.now ?? new Date();

  const [existing] = await db
    .select({ id: movimientosCuentaCorriente.id })
    .from(movimientosCuentaCorriente)
    .where(
      and(
        eq(movimientosCuentaCorriente.socioId, params.socioId),
        eq(movimientosCuentaCorriente.espacioId, params.espacioId),
        eq(movimientosCuentaCorriente.tipo, 'mensual'),
        gte(movimientosCuentaCorriente.fecha, hace27Dias(now)),
      ),
    )
    .limit(1);

  if (existing) return null;

  const importe = params.precio.toFixed(2);

  const [row] = await db
    .insert(movimientosCuentaCorriente)
    .values({
      socioId: params.socioId,
      espacioId: params.espacioId,
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
 * Recorre todos los espacios con ocupante + servicio. Para cada uno
 * decide si hoy es su día de cobro mensual y, si lo es, crea el
 * movimiento. Se ejecuta diariamente desde el cron.
 */
export async function runMonthlyGeneration(now: Date = new Date()): Promise<{
  created: number;
  scanned: number;
  skipped: number;
}> {
  const rows = await db
    .select({
      espacioId: espacios.id,
      ocupanteId: espacios.ocupanteId,
      servicioId: espacios.servicioId,
      servicioNombre: servicios.nombre,
      servicioPrecio: servicios.precio,
      fechaAsignacion: espacios.fechaAsignacion,
    })
    .from(espacios)
    .innerJoin(servicios, eq(servicios.id, espacios.servicioId))
    .where(and(isNotNull(espacios.ocupanteId), isNotNull(espacios.servicioId)));

  let created = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.ocupanteId || !r.servicioId) continue;

    // Modelo viejo (sin fechaAsignacion): cobrar el día 1.
    // Modelo nuevo: cobrar en el aniversario de la asignación.
    const debeCobrar = r.fechaAsignacion
      ? esDiaDeCobro(r.fechaAsignacion, now)
      : now.getUTCDate() === 1;

    if (!debeCobrar) {
      skipped++;
      continue;
    }

    const precio = r.servicioPrecio != null ? Number(r.servicioPrecio) : 0;
    const res = await ensureMonthlyMovimiento({
      socioId: r.ocupanteId,
      espacioId: r.espacioId,
      servicioId: r.servicioId,
      precio,
      concepto: r.servicioNombre,
      now,
    });
    if (res) created++;
  }

  return { created, scanned: rows.length, skipped };
}
