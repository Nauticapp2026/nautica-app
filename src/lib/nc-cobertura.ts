/**
 * Notas de crédito y el pool de cobertura: exclusión, nunca aplicación.
 *
 * NINGUNA nota de crédito se aplica sola a un cargo — ni siquiera la que se
 * emitió relacionada a una factura (`facturaOriginalId`). Decisión del cliente
 * (2026-08-28): "toda NC/ND, relacionada o no, total o parcial, se aplica a
 * mano en Cobranzas, sin ningún caso automático". La relación con la factura
 * original es documental (la leyenda del comprobante y el tope fiscal de
 * emisión); el crédito se usa tildando la NC en una cobranza, donde queda
 * declarado en las `aplicaciones` del recibo.
 *
 * Lo único que queda acá es la EXCLUSIÓN: el asiento (haber) de una NC no debe
 * alimentar el pool genérico de cobertura FIFO. Si entrara, ese crédito
 * saldaría cargos por su cuenta — sin usar, duplicaría el que se ofrece en
 * Cobranzas; ya usada, se contaría dos veces (su valor ya viajó en las
 * aplicaciones del recibo que la consumió).
 *
 * Historia, por si hay que volver: hasta 2026-08-28 la NC relacionada se
 * aplicaba automáticamente a los cargos de SU factura original (resolviendo
 * items/links y repartiendo FIFO dentro de esa factura). Ese comportamiento se
 * eliminó completo; el último commit que lo tuvo es el padre de este cambio.
 */

import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { facturacion } from '@/lib/db/schema';

const TIPOS_NC = [
  'nota_credito_a',
  'nota_credito_b',
  'nota_credito_c',
  'nota_credito_interna',
] as const;

/**
 * Resuelve, para varios socios en una sola query, qué movimientos de cuenta
 * corriente son el asiento de una nota de crédito (`movimientosDeNc`, para
 * excluirlos del pool). `montoPorMovimiento` queda SIEMPRE vacío — se conserva
 * en la firma para no tocar a los consumidores, y como punto de reversión si
 * el criterio volviera a cambiar.
 *
 * Sin filtro de estado a propósito: la NC pendiente no está en el pool porque
 * su crédito se ofrece explícitamente en Cobranzas; la usada tampoco, porque
 * ya quedó declarada en las aplicaciones de su recibo.
 */
export async function calcularCoberturaNotasCreditoBatch(socioIds: string[]): Promise<
  Map<
    string,
    {
      montoPorMovimiento: Map<string, number>;
      movimientosDeNc: Set<string>;
    }
  >
> {
  const out = new Map<
    string,
    { montoPorMovimiento: Map<string, number>; movimientosDeNc: Set<string> }
  >();
  for (const id of socioIds) {
    out.set(id, { montoPorMovimiento: new Map(), movimientosDeNc: new Set() });
  }
  if (socioIds.length === 0) return out;

  const notas = await db
    .select({ socioId: facturacion.socioId, movimientoId: facturacion.movimientoId })
    .from(facturacion)
    .where(
      and(
        inArray(facturacion.socioId, socioIds),
        inArray(facturacion.tipoFactura, [...TIPOS_NC]),
        eq(facturacion.anulada, false),
        eq(facturacion.rechazada, false),
        isNotNull(facturacion.movimientoId),
      ),
    );

  for (const n of notas) {
    if (n.movimientoId && n.socioId) out.get(n.socioId)?.movimientosDeNc.add(n.movimientoId);
  }

  return out;
}
