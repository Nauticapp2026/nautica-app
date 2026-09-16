/**
 * Tarjetas de resumen de la pantalla Ventas.
 *
 * Hasta 2026-09-16 se calculaban sobre TODAS las filas de `facturacion` sin
 * distinguir tipo ni resultado: "Pendientes de cobro" sumaba las rechazadas
 * por ARCA y las notas de crédito, "Cobradas este mes" contaba por fecha de
 * emisión, "Vencidas" leía un estado que nadie escribe (siempre 0) y "Total
 * facturado" sumaba recibos de cobranza, rechazadas y notas de crédito con
 * signo positivo. El cliente vio 6 pendientes en la tarjeta y 4 en el listado.
 *
 * Ahora cada tarjeta dice exactamente qué cuenta, sobre el mismo conjunto de
 * "deuda cobrable" que usan Cobranzas, el puntito de Socios y el Dashboard.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { facturacion } from '@/lib/db/schema';
import { todayArg } from '@/lib/dates';
import {
  contarComprobantesVencidos,
  deudaCobrable,
  deudaCobrablePendiente,
} from '@/lib/vencimientos-socio';

const TZ_AR = 'America/Argentina/Buenos_Aires';

/** Día calendario argentino de la emisión. */
const diaEmisionArg = sql`(${facturacion.emision} AT TIME ZONE ${TZ_AR})::date`;
/** Día calendario argentino de la última modificación (= cuándo se cobró, ver abajo). */
const diaUpdateArg = sql`(${facturacion.updatedAt} AT TIME ZONE ${TZ_AR})::date`;
const inicioMesArg = sql`date_trunc('month', now() AT TIME ZONE ${TZ_AR})::date`;

/** Comprobantes FISCALES que suman al total facturado (facturas y ND). */
const TIPOS_SUMAN = [
  'factura_a',
  'factura_b',
  'factura_c',
  'nota_debito_a',
  'nota_debito_b',
  'nota_debito_c',
] as const;
/** Comprobantes FISCALES que restan (NC). La NC interna no entra: no es fiscal. */
const TIPOS_RESTAN = ['nota_credito_a', 'nota_credito_b', 'nota_credito_c'] as const;

export type PeriodoFacturado = {
  /** "YYYY-MM-DD" inclusive, o null para no acotar por abajo. */
  desde: string | null;
  /** "YYYY-MM-DD" inclusive, o null para no acotar por arriba. */
  hasta: string | null;
};

/** Primer día del mes vigente en hora Argentina, "YYYY-MM-01". */
export function inicioMesVigenteArg(): string {
  return `${todayArg().slice(0, 7)}-01`;
}

/**
 * Total facturado a ARCA en un período: facturas + notas de débito − notas de
 * crédito, solo comprobantes ACEPTADOS (sin rechazadas ni anuladas). No entran
 * los comprobantes internos ni los recibos de cobranza: no son facturación.
 * El período se compara por día calendario argentino de la emisión.
 */
export async function totalFacturadoEnPeriodo(
  guarderiaId: string,
  periodo: PeriodoFacturado,
): Promise<string> {
  const condiciones = [
    eq(facturacion.guarderiaId, guarderiaId),
    inArray(facturacion.tipoFactura, [...TIPOS_SUMAN, ...TIPOS_RESTAN]),
    eq(facturacion.rechazada, false),
    eq(facturacion.anulada, false),
  ];
  if (periodo.desde) condiciones.push(sql`${diaEmisionArg} >= ${periodo.desde}::date`);
  if (periodo.hasta) condiciones.push(sql`${diaEmisionArg} <= ${periodo.hasta}::date`);

  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${facturacion.tipoFactura} in (${sql.join(
        TIPOS_RESTAN.map((t) => sql`${t}`),
        sql`, `,
      )}) then -${facturacion.importe} else ${facturacion.importe} end), 0)::text`,
    })
    .from(facturacion)
    .where(and(...condiciones));

  return row?.total ?? '0';
}

export type KpisVentas = {
  /** Facturas, ND y comprobantes internos aceptados y todavía sin cobrar. */
  pendientes: number;
  /** Comprobantes de deuda que quedaron cobrados este mes (hora Argentina). */
  cobradasMes: number;
  /** Comprobantes de deuda sin cobrar con vencimiento anterior a hoy. */
  vencidas: number;
  /** Total facturado a ARCA del mes vigente (ver `totalFacturadoEnPeriodo`). */
  totalFacturadoMes: string;
};

export async function getKpisVentas(guarderiaId: string): Promise<KpisVentas> {
  const [[pend], [cobr], vencidas, totalFacturadoMes] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(facturacion)
      .where(deudaCobrablePendiente(guarderiaId)),

    // "Cobrada este mes" = pasó a 'pagada' este mes. `facturacion` no tiene
    // fecha de cobro propia; todos los caminos que marcan un comprobante como
    // cobrado (Cobranzas, débito Payway vía reconciliar-cuenta, el lápiz de
    // Ventas) escriben `updated_at` en ese momento y ningún otro flujo toca esa
    // columna en comprobantes de deuda, así que hoy es la fecha de cobro.
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(facturacion)
      .where(
        and(
          deudaCobrable(guarderiaId),
          eq(facturacion.estado, 'pagada'),
          sql`${diaUpdateArg} >= ${inicioMesArg}`,
        ),
      ),

    contarComprobantesVencidos(guarderiaId),

    totalFacturadoEnPeriodo(guarderiaId, { desde: inicioMesVigenteArg(), hasta: null }),
  ]);

  return {
    pendientes: pend?.total ?? 0,
    cobradasMes: cobr?.total ?? 0,
    vencidas,
    totalFacturadoMes,
  };
}
