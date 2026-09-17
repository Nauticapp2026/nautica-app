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
 * Desde 2026-09-17 las tarjetas son POR CANAL: la pantalla tiene dos pestañas
 * (Comprobantes ARCA / Comprobantes internos) y mostraba los mismos números en
 * las dos. Ahora se calculan los dos juegos y la pantalla muestra el de la
 * pestaña abierta.
 *
 * El conjunto base sigue siendo la "deuda cobrable" de `vencimientos-socio`
 * —la misma que usan Cobranzas, el puntito de Socios y el Dashboard—, acá
 * partida por canal.
 */

import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { facturacion } from '@/lib/db/schema';
import { todayArg } from '@/lib/dates';
import { deudaCobrable, deudaCobrablePendiente } from '@/lib/vencimientos-socio';
import { PATRONES_RECIBO_COBRANZA } from '@/lib/recibo-codigos';

const TZ_AR = 'America/Argentina/Buenos_Aires';

/** Día calendario argentino de la emisión. */
const diaEmisionArg = sql`(${facturacion.emision} AT TIME ZONE ${TZ_AR})::date`;
/** Día calendario argentino de la última modificación (= cuándo se cobró, ver abajo). */
const diaUpdateArg = sql`(${facturacion.updatedAt} AT TIME ZONE ${TZ_AR})::date`;
/** Día calendario argentino del vencimiento. */
const diaVencimientoArg = sql`(${facturacion.vencimiento} AT TIME ZONE ${TZ_AR})::date`;
const hoyArg = sql`(now() AT TIME ZONE ${TZ_AR})::date`;
const inicioMesArg = sql`date_trunc('month', now() AT TIME ZONE ${TZ_AR})::date`;

/**
 * Las dos pestañas de Ventas.
 * - `fiscal`: lo que pasa por ARCA (facturas A/B/C, ND y NC).
 * - `interno`: los comprobantes propios del club (CI-/CL-/CA- y NC internas).
 */
export type CanalVentas = 'fiscal' | 'interno';

/** Deuda fiscal: facturas y notas de débito. */
const TIPOS_DEUDA_FISCAL = [
  'factura_a',
  'factura_b',
  'factura_c',
  'nota_debito_a',
  'nota_debito_b',
  'nota_debito_c',
] as const;

/** Notas de crédito fiscales: restan del total facturado. */
const TIPOS_NC_FISCAL = ['nota_credito_a', 'nota_credito_b', 'nota_credito_c'] as const;

/**
 * Filtro de canal para aplicar SOBRE `deudaCobrable`, que ya dejó afuera las
 * anuladas, las rechazadas y los recibos de cobranza RC-/RI-. Lo que queda con
 * tipo 'recibo' es exactamente un comprobante interno (CI-/CL-/CA-).
 */
function esDelCanal(canal: CanalVentas): SQL | undefined {
  return canal === 'fiscal'
    ? inArray(facturacion.tipoFactura, [...TIPOS_DEUDA_FISCAL])
    : eq(facturacion.tipoFactura, 'recibo');
}

/** Comprobante interno (incluye las NC internas, que no son deuda cobrable). */
function esComprobanteInterno(): SQL | undefined {
  return and(
    inArray(facturacion.tipoFactura, ['recibo', 'nota_credito_interna']),
    eq(facturacion.anulada, false),
    sql`(${facturacion.codigo} is null or ${sql.join(
      PATRONES_RECIBO_COBRANZA.map((p) => sql`${facturacion.codigo} not like ${p}`),
      sql` and `,
    )})`,
  );
}

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
 * Total emitido en un período, por canal:
 * - `fiscal`: facturas + notas de débito − notas de crédito, solo ACEPTADAS
 *   (sin rechazadas ni anuladas).
 * - `interno`: comprobantes internos − notas de crédito internas.
 *
 * En los dos casos se excluyen los recibos de cobranza: documentan un pago, no
 * una venta. El período se compara por día calendario argentino de la emisión.
 */
export async function totalFacturadoEnPeriodo(
  guarderiaId: string,
  periodo: PeriodoFacturado,
  canal: CanalVentas,
): Promise<string> {
  const restan = canal === 'fiscal' ? [...TIPOS_NC_FISCAL] : ['nota_credito_interna'];

  const condiciones = [
    eq(facturacion.guarderiaId, guarderiaId),
    canal === 'fiscal'
      ? and(
          inArray(facturacion.tipoFactura, [...TIPOS_DEUDA_FISCAL, ...TIPOS_NC_FISCAL]),
          eq(facturacion.rechazada, false),
          eq(facturacion.anulada, false),
        )
      : esComprobanteInterno(),
  ];
  if (periodo.desde) condiciones.push(sql`${diaEmisionArg} >= ${periodo.desde}::date`);
  if (periodo.hasta) condiciones.push(sql`${diaEmisionArg} <= ${periodo.hasta}::date`);

  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${facturacion.tipoFactura} in (${sql.join(
        restan.map((t) => sql`${t}`),
        sql`, `,
      )}) then -${facturacion.importe} else ${facturacion.importe} end), 0)::text`,
    })
    .from(facturacion)
    .where(and(...condiciones));

  return row?.total ?? '0';
}

export type KpisCanal = {
  /** Comprobantes de deuda del canal, aceptados y todavía sin cobrar. */
  pendientes: number;
  /** Los que quedaron cobrados este mes (hora Argentina). */
  cobradasMes: number;
  /** Sin cobrar y con vencimiento anterior a hoy. */
  vencidas: number;
  /** Total emitido del mes vigente (ver `totalFacturadoEnPeriodo`). */
  totalFacturadoMes: string;
};

/** Un juego de tarjetas por pestaña. */
export type KpisVentas = Record<CanalVentas, KpisCanal>;

async function kpisDeCanal(guarderiaId: string, canal: CanalVentas): Promise<KpisCanal> {
  const delCanal = esDelCanal(canal);

  const [[pend], [cobr], [venc], totalFacturadoMes] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(facturacion)
      .where(and(deudaCobrablePendiente(guarderiaId), delCanal)),

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
          delCanal,
          eq(facturacion.estado, 'pagada'),
          sql`${diaUpdateArg} >= ${inicioMesArg}`,
        ),
      ),

    db
      .select({ total: sql<number>`count(*)::int` })
      .from(facturacion)
      .where(
        and(
          deudaCobrablePendiente(guarderiaId),
          delCanal,
          sql`${facturacion.vencimiento} is not null`,
          sql`${diaVencimientoArg} < ${hoyArg}`,
        ),
      ),

    totalFacturadoEnPeriodo(guarderiaId, { desde: inicioMesVigenteArg(), hasta: null }, canal),
  ]);

  return {
    pendientes: pend?.total ?? 0,
    cobradasMes: cobr?.total ?? 0,
    vencidas: venc?.total ?? 0,
    totalFacturadoMes,
  };
}

/**
 * Los dos juegos de tarjetas. Se calculan en el server de una sola vez para que
 * cambiar de pestaña sea instantáneo y no dispare otra consulta.
 */
export async function getKpisVentas(guarderiaId: string): Promise<KpisVentas> {
  const [fiscal, interno] = await Promise.all([
    kpisDeCanal(guarderiaId, 'fiscal'),
    kpisDeCanal(guarderiaId, 'interno'),
  ]);
  return { fiscal, interno };
}
