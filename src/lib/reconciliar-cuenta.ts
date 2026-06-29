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

import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { movimientosCuentaCorriente } from '@/lib/db/schema';

export async function reconciliarCuentaSocio(socioId: string): Promise<string[]> {
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

  let pool = movs.reduce((acc, m) => acc + parseFloat(m.haber ?? '0'), 0);
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
