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
import { facturacion } from '@/lib/db/schema';
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
const diaVencimientoArg = sql`(${facturacion.vencimiento} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;
const hoyArg = sql`(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;

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
    .where(
      and(
        eq(facturacion.guarderiaId, guarderiaId),
        inArray(facturacion.socioId, socioIds),
        inArray(facturacion.tipoFactura, [...TIPOS_COBRABLES]),
        eq(facturacion.anulada, false),
        eq(facturacion.rechazada, false),
        or(isNull(facturacion.estado), ne(facturacion.estado, 'pagada')),
        // Un comprobante sin vencimiento cargado no puede vencer.
        sql`${facturacion.vencimiento} is not null`,
        // Los recibos de cobranza (RC-/RI-) son tipo 'recibo' pero documentan un
        // pago, no deuda: nunca vencen.
        or(
          isNull(facturacion.codigo),
          and(...PATRONES_RECIBO_COBRANZA.map((pat) => notLike(facturacion.codigo, pat))),
        ),
      ),
    )
    .groupBy(facturacion.socioId);

  for (const r of rows) {
    if (!r.socioId) continue;
    if (r.tieneVencida) out.set(r.socioId, 'vencida');
    else if (r.venceHoy) out.set(r.socioId, 'por_vencer');
  }

  return out;
}
