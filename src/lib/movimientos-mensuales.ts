/**
 * Helpers para generar movimientos mensuales en la cuenta corriente del socio.
 *
 * Modelo de cobro (post deploy 0019):
 *  - Cada guardería elige un `diaFacturacion` (1-28) en Configuración.
 *  - El cron diario corre en todas las guarderías y, para las cuyo
 *    `diaFacturacion === hoy`, crea el movimiento mensual de cada espacio
 *    asignado.
 *  - Adicionalmente, dispara la auto-emisión de facturas para los socios
 *    con pendientes (ver `auto-facturacion.ts`). La primera factura de
 *    cada socio sigue siendo manual.
 *
 * Uso:
 *  - updateEspacioAction: al asociar un socio a un espacio con tarifa,
 *    creamos el movimiento del mes corriente prorrateado por los días
 *    que quedan hasta fin de mes (sin tocar — comportamiento al alta).
 *  - Cron diario (/api/cron/mensuales): genera mensuales + auto-emite.
 *
 * La columna `espacios.fecha_asignacion` queda en la DB pero deja de
 * usarse para decidir cuándo cobrar (era el modelo aniversario, ahora
 * deprecado). Sigue siendo útil como historial del alta.
 */

import { and, eq, gte, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { espacios, guarderias, movimientosCuentaCorriente, servicios } from '@/lib/db/schema';

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
 * Determina si `hoy` es el día de cobro de la guardería. Como
 * `diaFacturacion` está restringido a 1-28 (check en DB), siempre existe
 * en cualquier mes — no hace falta el clamp con daysInMonth.
 */
export function esDiaDeCobro(diaFacturacion: number, hoy: Date = new Date()): boolean {
  return hoy.getUTCDate() === diaFacturacion;
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
 * Recorre todos los espacios asignados de las guarderías cuyo
 * `diaFacturacion === hoy.getUTCDate()` y crea el movimiento mensual
 * para cada uno. Se ejecuta diariamente desde el cron.
 *
 * Devuelve además el set de guarderías procesadas, así el caller
 * (cron) puede disparar la auto-emisión de facturas sobre esas
 * mismas guarderías sin volver a calcular qué cumplen hoy.
 */
export async function runMonthlyGeneration(now: Date = new Date()): Promise<{
  created: number;
  scanned: number;
  skipped: number;
  guarderiaIds: string[];
}> {
  const diaHoy = now.getUTCDate();

  const rows = await db
    .select({
      espacioId: espacios.id,
      guarderiaId: espacios.guarderiaId,
      ocupanteId: espacios.ocupanteId,
      servicioId: espacios.servicioId,
      servicioNombre: servicios.nombre,
      servicioPrecio: servicios.precio,
      diaFacturacion: guarderias.diaFacturacion,
    })
    .from(espacios)
    .innerJoin(servicios, eq(servicios.id, espacios.servicioId))
    .innerJoin(guarderias, eq(guarderias.id, espacios.guarderiaId))
    .where(and(isNotNull(espacios.ocupanteId), isNotNull(espacios.servicioId)));

  let created = 0;
  let skipped = 0;
  const guarderiasProcesadas = new Set<string>();

  for (const r of rows) {
    if (!r.ocupanteId || !r.servicioId) continue;

    const dia = r.diaFacturacion ?? 1;
    if (dia !== diaHoy) {
      skipped++;
      continue;
    }

    guarderiasProcesadas.add(r.guarderiaId);

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

  return {
    created,
    scanned: rows.length,
    skipped,
    guarderiaIds: Array.from(guarderiasProcesadas),
  };
}
