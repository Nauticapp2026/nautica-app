/**
 * A qué cargo puntual aplica cada Nota de Crédito "asociada" (con
 * `facturaOriginalId`) de un socio.
 *
 * El resto del sistema (Cobranzas, reconciliación FIFO, el display de
 * Cuenta Corriente) calculaba "qué está cubierto" con una bolsa común de
 * haberes repartida del cargo más viejo al más nuevo — sin saber que el
 * crédito de una NC es para SU factura específica, no para cualquier cosa.
 * Resultado real observado: una NC de $6,05 sobre una factura terminaba
 * cubriendo cargos más viejos no relacionados (dejándolos "cobrados" sin
 * que nadie los pagara) mientras la factura que la NC realmente anulaba
 * seguía figurando pendiente.
 *
 * Este helper resuelve la cobertura ANTES de que el pool genérico entre en
 * juego: cada NC se aplica solo a los movimientos de su propia factura
 * original (vía facturacionItems/facturacionItemMovimientos), del cargo
 * más viejo al más nuevo dentro de esa factura. El pool genérico de los
 * otros 3 lugares tiene que excluir los movimientos que son el asiento de
 * una de estas NC (`movimientosDeNc`) para no contar esa plata dos veces.
 */

import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  movimientosCuentaCorriente,
} from '@/lib/db/schema';

const TIPOS_NC_ASOCIABLES = [
  'nota_credito_a',
  'nota_credito_b',
  'nota_credito_c',
  'nota_credito_interna',
] as const;

/**
 * Resuelve la cobertura de NC de uno o varios socios en las mismas queries. El
 * batch existe porque el listado de socios muestra el saldo a favor de cientos
 * de socios y no puede disparar una tanda de queries por cada uno.
 *
 * Cada NC solo cubre los cargos de SU factura original, y el acumulado es por
 * socio: dos socios nunca comparten cargos.
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

  // NC SUELTAS (sin factura asociada): su crédito existe como movimiento (haber)
  // pero NUNCA es crédito genérico. Se excluye del pool SIEMPRE, sin importar si
  // ya se usó o no:
  //
  //  - Mientras está sin usar, no puede saldar cargos por su cuenta ni inflar el
  //    saldo a favor: se ofrece explícitamente en Cobranzas, igual que un
  //    adelanto (ver project: "el adelanto no salda solo").
  //  - Una vez usada en una cobranza, su crédito ya quedó declarado en las
  //    `aplicaciones` de ese recibo. Si volviera al pool se contaría dos veces.
  //
  // Va a `movimientosDeNc` (que aporta 0 al pool) sin entrar en
  // `montoPorMovimiento`: el crédito existe pero no cubre cargos por sí mismo.
  const libres = await db
    .select({ socioId: facturacion.socioId, movimientoId: facturacion.movimientoId })
    .from(facturacion)
    .where(
      and(
        inArray(facturacion.socioId, socioIds),
        inArray(facturacion.tipoFactura, [...TIPOS_NC_ASOCIABLES]),
        isNull(facturacion.facturaOriginalId),
        eq(facturacion.anulada, false),
        eq(facturacion.rechazada, false),
        isNotNull(facturacion.movimientoId),
      ),
    );
  for (const n of libres) {
    if (n.movimientoId && n.socioId) out.get(n.socioId)?.movimientosDeNc.add(n.movimientoId);
  }

  const notas = await db
    .select({
      socioId: facturacion.socioId,
      importe: facturacion.importe,
      facturaOriginalId: facturacion.facturaOriginalId,
      movimientoId: facturacion.movimientoId,
    })
    .from(facturacion)
    .where(
      and(
        inArray(facturacion.socioId, socioIds),
        inArray(facturacion.tipoFactura, [...TIPOS_NC_ASOCIABLES]),
        isNotNull(facturacion.facturaOriginalId),
      ),
    );

  if (notas.length === 0) return out;

  for (const n of notas) {
    if (n.movimientoId && n.socioId) out.get(n.socioId)?.movimientosDeNc.add(n.movimientoId);
  }

  const originalIds = [...new Set(notas.map((n) => n.facturaOriginalId!).filter(Boolean))];
  const items = await db
    .select({ id: facturacionItems.id, facturacionId: facturacionItems.facturacionId })
    .from(facturacionItems)
    .where(inArray(facturacionItems.facturacionId, originalIds));
  if (items.length === 0) return out;

  const itemToFac = new Map(items.map((i) => [i.id, i.facturacionId]));
  const links = await db
    .select({
      facturacionItemId: facturacionItemMovimientos.facturacionItemId,
      movimientoId: facturacionItemMovimientos.movimientoId,
    })
    .from(facturacionItemMovimientos)
    .where(
      inArray(
        facturacionItemMovimientos.facturacionItemId,
        items.map((i) => i.id),
      ),
    );

  const movsPorFactura = new Map<string, string[]>();
  for (const l of links) {
    const facId = itemToFac.get(l.facturacionItemId);
    if (!facId) continue;
    if (!movsPorFactura.has(facId)) movsPorFactura.set(facId, []);
    movsPorFactura.get(facId)!.push(l.movimientoId);
  }

  const candidatoIds = [...new Set([...movsPorFactura.values()].flat())];
  if (candidatoIds.length === 0) return out;

  const movsInfo = await db
    .select({
      id: movimientosCuentaCorriente.id,
      debe: movimientosCuentaCorriente.debe,
      fecha: movimientosCuentaCorriente.fecha,
    })
    .from(movimientosCuentaCorriente)
    .where(inArray(movimientosCuentaCorriente.id, candidatoIds));
  const movInfoById = new Map(movsInfo.map((m) => [m.id, m]));

  for (const nota of notas) {
    if (!nota.facturaOriginalId || !nota.socioId) continue;
    // El acumulado de cobertura es por socio: dos socios no comparten cargos, y
    // mezclarlos haría que la NC de uno "consuma" el cupo de otro.
    const montoPorMovimiento = out.get(nota.socioId)?.montoPorMovimiento;
    if (!montoPorMovimiento) continue;
    const movIds = movsPorFactura.get(nota.facturaOriginalId) ?? [];
    const ordenados = movIds
      .map((id) => movInfoById.get(id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .sort((a, b) => (a.fecha && b.fecha ? a.fecha.getTime() - b.fecha.getTime() : 0));

    let disponible = parseFloat(nota.importe ?? '0');
    for (const m of ordenados) {
      if (disponible <= 0.001) break;
      const debe = parseFloat(m.debe ?? '0');
      if (debe <= 0) continue;
      const yaCubierto = montoPorMovimiento.get(m.id) ?? 0;
      const restante = debe - yaCubierto;
      if (restante <= 0.001) continue;
      const aplicar = Math.min(disponible, restante);
      montoPorMovimiento.set(m.id, yaCubierto + aplicar);
      disponible -= aplicar;
    }
  }

  return out;
}
