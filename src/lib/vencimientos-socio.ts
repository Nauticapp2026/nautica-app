/**
 * Aviso de vencimiento por socio para la lista de Socios: el puntito rojo
 * ("Posee facturas vencidas") o amarillo ("Factura próx. a vencer") que va al
 * lado del saldo.
 *
 * NO se usa `facturacion.estado = 'vencida'`. Ese valor existe en el enum pero
 * **nadie lo escribe nunca**: no hay cron ni trigger que pase 'pendiente' a
 * 'vencida', así que en prod hay 0 filas con ese estado mientras sí hay
 * comprobantes impagos con vencimiento pasado. El aviso se calcula comparando
 * la fecha, que es el mismo criterio que usa la columna "Situación" de la
 * Cuenta Corriente.
 *
 * Qué comprobantes cuentan: los mismos que Cobranzas ofrece cobrar
 * (TIPOS_COBRABLES), sin anuladas ni rechazadas, y excluyendo los recibos de
 * cobranza RC-/RI- — que son tipo 'recibo' igual que los comprobantes internos,
 * pero documentan un pago pasado, no deuda.
 */

import { and, eq, inArray, isNull, ne, notLike, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { facturacion, memberships } from '@/lib/db/schema';
import { PATRONES_RECIBO_COBRANZA } from '@/lib/recibo-codigos';

/** Tipos que representan deuda cobrable. Mismo criterio que actions/cobranzas. */
const TIPOS_COBRABLES = [
  'factura_a',
  'factura_b',
  'factura_c',
  'nota_debito_a',
  'nota_debito_b',
  'nota_debito_c',
  'recibo',
] as const;

export type AvisoVencimiento = 'vencida' | 'por_vencer';

/**
 * Día calendario ARGENTINO del vencimiento. El campo se guarda anclado a las
 * 12:00 UTC (= 09:00 ART) para representar un día, así que comparar en UTC
 * funcionaría por poco — pero se convierte igual, por el mismo motivo que el
 * resto del sistema: en el borde del día la hora cruda miente.
 */
export const diaVencimientoArg = sql`(${facturacion.vencimiento} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;
export const hoyArg = sql`(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;

/**
 * Aviso por socio. Los socios sin comprobantes impagos no entran en el mapa.
 *
 * Rojo gana sobre amarillo: si tiene una vencida, eso es lo que hay que
 * mostrar aunque además tenga otra por vencer.
 *
 * "Próxima a vencer" = **vence hoy**. Con vencimientos a nivel día, "24 hs
 * antes" es el día del vencimiento: hasta las 23:59 de ese día el comprobante
 * está En Plazo, y recién al día siguiente pasa a Vencida (mismo criterio que
 * la columna Situación). Si el club quisiera más anticipación, acá se cambia
 * el `= hoy` por un rango.
 */
/**
 * Qué comprobante es DEUDA COBRABLE del club, pagada o no: facturas, notas de
 * débito y comprobantes internos (CM-/CL-), sin anuladas ni rechazadas y sin
 * los recibos de cobranza RC-/RI- (documentan un pago, no deuda). Es el mismo
 * conjunto que Cobranzas ofrece cobrar. Lo usan el puntito de Socios, la
 * tarjeta del Dashboard y las tarjetas de Ventas, para que ningún contador
 * pueda separarse de los otros.
 */
export function deudaCobrable(guarderiaId: string) {
  return and(
    eq(facturacion.guarderiaId, guarderiaId),
    inArray(facturacion.tipoFactura, [...TIPOS_COBRABLES]),
    eq(facturacion.anulada, false),
    eq(facturacion.rechazada, false),
    or(
      isNull(facturacion.codigo),
      and(...PATRONES_RECIBO_COBRANZA.map((pat) => notLike(facturacion.codigo, pat))),
    ),
  );
}

/** Deuda cobrable todavía sin cobrar. */
export function deudaCobrablePendiente(guarderiaId: string) {
  return and(
    deudaCobrable(guarderiaId),
    or(isNull(facturacion.estado), ne(facturacion.estado, 'pagada')),
  );
}

/**
 * Qué comprobante cuenta como deuda que puede vencer: la pendiente que tiene
 * vencimiento cargado (sin fecha no puede vencer).
 */
function comprobantesQuePuedenVencer(guarderiaId: string) {
  return and(deudaCobrablePendiente(guarderiaId), sql`${facturacion.vencimiento} is not null`);
}

/**
 * Cuántos COMPROBANTES del club están vencidos hoy (no cuántos socios: eso es
 * `contarSociosConFacturasVencidas`). Es la tarjeta "Vencidas" de Ventas.
 */
export async function contarComprobantesVencidos(guarderiaId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(facturacion)
    .where(and(comprobantesQuePuedenVencer(guarderiaId), sql`${diaVencimientoArg} < ${hoyArg}`));
  return row?.total ?? 0;
}

export async function getAvisoVencimientoBatch(
  socioIds: string[],
  guarderiaId: string,
): Promise<Map<string, AvisoVencimiento>> {
  const out = new Map<string, AvisoVencimiento>();
  if (socioIds.length === 0) return out;

  const rows = await db
    .select({
      socioId: facturacion.socioId,
      tieneVencida: sql<boolean>`bool_or(${diaVencimientoArg} < ${hoyArg})`,
      venceHoy: sql<boolean>`bool_or(${diaVencimientoArg} = ${hoyArg})`,
    })
    .from(facturacion)
    .where(and(comprobantesQuePuedenVencer(guarderiaId), inArray(facturacion.socioId, socioIds)))
    .groupBy(facturacion.socioId);

  for (const r of rows) {
    if (!r.socioId) continue;
    if (r.tieneVencida) out.set(r.socioId, 'vencida');
    else if (r.venceHoy) out.set(r.socioId, 'por_vencer');
  }

  return out;
}

/**
 * Cuántos socios del club tienen al menos una factura YA vencida. Es el número
 * de la tarjeta del Dashboard, y tiene que coincidir con la cantidad de filas
 * que muestra `/usuarios?filtro=facturas-vencidas`.
 *
 * Por eso se join-ea con `memberships` con el MISMO criterio que arma la lista
 * de socios (rol socio, status active/inactivo): si se contara solo sobre
 * `facturacion`, un socio desvinculado del club con deuda vieja sumaría al
 * contador pero no aparecería en la lista, y los dos números no cerrarían.
 */
export async function contarSociosConFacturasVencidas(guarderiaId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(distinct ${facturacion.socioId})::int` })
    .from(facturacion)
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, facturacion.socioId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.rol, 'socio'),
        inArray(memberships.status, ['active', 'inactivo']),
      ),
    )
    .where(and(comprobantesQuePuedenVencer(guarderiaId), sql`${diaVencimientoArg} < ${hoyArg}`));

  return row?.total ?? 0;
}
