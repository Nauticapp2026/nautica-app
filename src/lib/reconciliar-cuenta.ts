/**
 * Reconciliación FIFO de la cuenta corriente de un socio.
 *
 * Persiste lo que el display ya calcula (`calcularSaldoYEstado` en socio-detail):
 * los pagos (haber) cubren los cargos del más viejo al más nuevo, y un cargo
 * cubierto pasa a `pagado`. Sin esto, un pago "neto" (Payway, débito automático)
 * deja el cargo en `no_pagado` y la auto-emisión lo vuelve a facturar → deuda
 * fantasma (cargos ya cobrados re-facturados como pendientes).
 *
 * Se llama después de registrar un haber neto que no mapea 1:1 a cargos
 * puntuales (hoy: cobro Payway aprobado).
 *
 * Criterio (idéntico al display):
 *  - El pool de haberes se consume sobre TODOS los cargos con debe>0, del más
 *    viejo al más nuevo, salvo los ya `pagado`.
 *  - Solo se PERSISTE el cambio (`no_pagado` → `pagado`) en cargos no_pagado y
 *    sin comprobante interno. Los `facturado` se dejan como están (su cobro se
 *    refleja por la factura) y los de comprobante interno se saldan vía Cobranza
 *    (que mantiene cargo + recibo en sync). Igual se consume el pool por ellos
 *    para respetar el orden FIFO.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  movimientosCuentaCorriente,
} from '@/lib/db/schema';
import { calcularCoberturaNotasCredito } from '@/lib/nc-cobertura';

/**
 * Read-only. Devuelve el conjunto de ids de cargos (movimientos con debe>0) que
 * están saldados para el socio: los ya `pagado`, más los cubiertos por el pool
 * de haberes vía FIFO (del más viejo al más nuevo). Mismo criterio exacto que
 * `getCargosPagadosFifo` en cobranzas y `calcularSaldoYEstado` en el display.
 *
 * Incluye cargos en cualquier estado (no_pagado, facturado, pagado) que el pool
 * cubre — por eso sirve tanto para decidir qué NO facturar (auto-emisión) como
 * para detectar qué comprobantes quedaron 100% saldados.
 */
export async function getCargosSaldadosFifo(socioId: string): Promise<Set<string>> {
  const { montoPorMovimiento, movimientosDeNc } = await calcularCoberturaNotasCredito(socioId);

  const movs = await db
    .select({
      id: movimientosCuentaCorriente.id,
      debe: movimientosCuentaCorriente.debe,
      haber: movimientosCuentaCorriente.haber,
      estado: movimientosCuentaCorriente.estado,
    })
    .from(movimientosCuentaCorriente)
    .where(eq(movimientosCuentaCorriente.socioId, socioId))
    .orderBy(asc(movimientosCuentaCorriente.fecha), asc(movimientosCuentaCorriente.createdAt));

  const saldados = new Set<string>();
  for (const [movId, monto] of montoPorMovimiento) {
    const m = movs.find((x) => x.id === movId);
    if (m && monto >= parseFloat(m.debe ?? '0') - 0.001) saldados.add(movId);
  }

  // Pool genérico: excluye los movimientos que son el asiento de una NC ya
  // aplicada puntualmente arriba (ver calcularCoberturaNotasCredito).
  let pool = movs
    .filter((m) => !movimientosDeNc.has(m.id))
    .reduce((acc, m) => acc + parseFloat(m.haber ?? '0'), 0);

  for (const m of movs) {
    if (saldados.has(m.id)) continue;
    const debe = parseFloat(m.debe ?? '0');
    if (debe <= 0) continue;
    if (m.estado === 'pagado') {
      // Ya pagado: consume su parte del pool (su haber está comprometido), para
      // no inflar la cobertura de otros cargos. Igual que calcularSaldoYEstado.
      saldados.add(m.id);
      pool -= debe;
      continue;
    }
    if (pool >= debe - 0.001) {
      pool -= debe;
      saldados.add(m.id);
    }
  }

  return saldados;
}

export async function reconciliarCuentaSocio(socioId: string): Promise<string[]> {
  const { movimientosDeNc } = await calcularCoberturaNotasCredito(socioId);

  const movs = await db
    .select({
      id: movimientosCuentaCorriente.id,
      debe: movimientosCuentaCorriente.debe,
      haber: movimientosCuentaCorriente.haber,
      estado: movimientosCuentaCorriente.estado,
      comprobanteInterno: movimientosCuentaCorriente.comprobanteInterno,
    })
    .from(movimientosCuentaCorriente)
    .where(eq(movimientosCuentaCorriente.socioId, socioId))
    .orderBy(asc(movimientosCuentaCorriente.fecha), asc(movimientosCuentaCorriente.createdAt));

  // Excluye los movimientos que son el asiento de una NC ya aplicada
  // puntualmente a su propia factura (ver calcularCoberturaNotasCredito) —
  // esta función solo reconcilia pagos genéricos (ej. Payway), no créditos
  // ya targeteados.
  let pool = movs
    .filter((m) => !movimientosDeNc.has(m.id))
    .reduce((acc, m) => acc + parseFloat(m.haber ?? '0'), 0);
  const toMark: string[] = [];

  for (const m of movs) {
    const debe = parseFloat(m.debe ?? '0');
    if (debe <= 0) continue;
    if (m.estado === 'pagado') {
      // Ya pagado: consume su parte del pool (su haber está comprometido), para
      // no inflar la cobertura de otros cargos. Igual que calcularSaldoYEstado.
      pool -= debe;
      continue;
    }
    if (pool >= debe - 0.001) {
      pool -= debe;
      if (m.estado === 'no_pagado' && !m.comprobanteInterno) toMark.push(m.id);
    }
  }

  if (toMark.length > 0) {
    await db
      .update(movimientosCuentaCorriente)
      .set({ estado: 'pagado' })
      .where(inArray(movimientosCuentaCorriente.id, toMark));
  }

  return toMark;
}

// Tipos de comprobante fiscal que se marcan pagados al quedar cubiertos. Solo
// fiscales: los recibos internos (RB-) tienen su ciclo propio vía Cobranza.
// Las ND entran: son deuda a cobrar igual que una factura (su cargo se linkea
// directo vía facturacion.movimientoId).
const TIPOS_FISCALES = [
  'factura_a',
  'factura_b',
  'factura_c',
  'nota_debito_a',
  'nota_debito_b',
  'nota_debito_c',
] as const;

/**
 * Marca como `pagada` toda factura fiscal `pendiente`/`vencida` del socio cuyos
 * cargos vinculados quedaron TODOS saldados por los pagos (FIFO), y propaga
 * `pagado` a esos cargos. Mismo criterio que el Registro de Cobranza, pero para
 * pagos netos (Payway): sin esto, una factura cobrada por débito automático
 * sigue figurando "pendiente" en el listado de comprobantes aunque ya esté
 * cobrada. Devuelve los ids de las facturas marcadas.
 *
 * Read-side seguro: solo toca facturas 100% cubiertas; nunca marca una factura
 * cubierta a medias (no se puede "pagar media factura").
 */
export async function marcarComprobantesSaldados(
  socioId: string,
  guarderiaId: string,
): Promise<string[]> {
  const saldados = await getCargosSaldadosFifo(socioId);

  const facs = await db
    .select({
      id: facturacion.id,
      movimientoId: facturacion.movimientoId,
    })
    .from(facturacion)
    .where(
      and(
        eq(facturacion.guarderiaId, guarderiaId),
        eq(facturacion.socioId, socioId),
        inArray(facturacion.estado, ['pendiente', 'vencida']),
        inArray(facturacion.tipoFactura, [...TIPOS_FISCALES]),
      ),
    );
  if (facs.length === 0) return [];

  // Mapear cada factura a sus cargos: link directo (movimientoId) + M:N (items).
  const facIds = facs.map((f) => f.id);
  const items = await db
    .select({ id: facturacionItems.id, facturacionId: facturacionItems.facturacionId })
    .from(facturacionItems)
    .where(inArray(facturacionItems.facturacionId, facIds));
  const itemToFac = new Map(items.map((i) => [i.id, i.facturacionId]));
  const links = items.length
    ? await db
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
        )
    : [];

  const cargosPorFac = new Map<string, Set<string>>();
  for (const f of facs) {
    const s = new Set<string>();
    if (f.movimientoId) s.add(f.movimientoId);
    cargosPorFac.set(f.id, s);
  }
  for (const l of links) {
    const facId = itemToFac.get(l.facturacionItemId);
    if (facId) cargosPorFac.get(facId)?.add(l.movimientoId);
  }

  // Factura saldada = tiene cargos vinculados y TODOS están cubiertos. Si no
  // tiene cargos vinculados no podemos inferir cobertura → se deja como está.
  const facsToMark: string[] = [];
  const movsToMark = new Set<string>();
  for (const f of facs) {
    const cargos = cargosPorFac.get(f.id);
    if (!cargos || cargos.size === 0) continue;
    let all = true;
    for (const c of cargos) {
      if (!saldados.has(c)) {
        all = false;
        break;
      }
    }
    if (all) {
      facsToMark.push(f.id);
      for (const c of cargos) movsToMark.add(c);
    }
  }

  if (facsToMark.length > 0) {
    await db
      .update(facturacion)
      .set({ estado: 'pagada', updatedAt: new Date() })
      .where(inArray(facturacion.id, facsToMark));
    if (movsToMark.size > 0) {
      await db
        .update(movimientosCuentaCorriente)
        .set({ estado: 'pagado' })
        .where(inArray(movimientosCuentaCorriente.id, [...movsToMark]));
    }
  }

  return facsToMark;
}
