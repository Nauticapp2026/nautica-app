/**
 * Deuda pendiente de un socio, con el MISMO criterio que las filas de la Cuenta
 * Corriente de su ficha (`calcularSaldoYEstado`, en cuenta-corriente-saldo.ts).
 *
 * La lista de socios calculaba su columna Deuda como el neto crudo
 * (Σdebe − Σhaber). Eso no coincide con la ficha: el neto le resta un adelanto
 * que todavía no se aplicó a ningún cargo, y el criterio por fila no lo hace a
 * propósito (un adelanto sin comprobante no salda nada solo). Un socio con
 * deuda $2.451,61 y un adelanto sin usar de $10.050 figuraba con deuda $0 en la
 * lista y sin flag de moroso, mientras la ficha mostraba la deuda entera
 * (reporte del cliente 2026-09-03, punto 9).
 *
 * Para que los dos números sean el mismo hay que reproducir el pipeline de la
 * ficha completo, no solo el cálculo final: mismo orden cronológico, misma
 * cobertura targeted y la misma consolidación de una fila por comprobante (la
 * emisión crea un movimiento por cargo, todos con la misma factura).
 */

import { desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  movimientosCuentaCorriente,
} from '@/lib/db/schema';
import { calcularCoberturaTargetedBatch } from '@/lib/cobranza-cobertura';
import { fechaOperativa } from '@/lib/reconciliar-cuenta';
import { calcularSaldoYEstado } from '@/lib/cuenta-corriente-saldo';

/** Deuda pendiente por socio. Los socios sin movimientos quedan en 0. */
export async function getDeudaPendienteBatch(socioIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (socioIds.length === 0) return out;
  for (const id of socioIds) out.set(id, 0);

  const [coberturaPorSocio, movs] = await Promise.all([
    calcularCoberturaTargetedBatch(socioIds),
    db
      .select({
        socioId: movimientosCuentaCorriente.socioId,
        id: movimientosCuentaCorriente.id,
        tipo: movimientosCuentaCorriente.tipo,
        debe: movimientosCuentaCorriente.debe,
        haber: movimientosCuentaCorriente.haber,
        estado: movimientosCuentaCorriente.estado,
        esAdelanto: movimientosCuentaCorriente.esAdelanto,
      })
      .from(movimientosCuentaCorriente)
      .where(inArray(movimientosCuentaCorriente.socioId, socioIds))
      // Mismo orden que la ficha: día calendario argentino y, dentro del día,
      // created_at. DESC porque calcularSaldoYEstado espera la lista como la
      // muestra la tabla (más nuevo primero) y la invierte adentro.
      .orderBy(desc(fechaOperativa), desc(movimientosCuentaCorriente.createdAt)),
  ]);

  if (movs.length === 0) return out;
  const movimientoIds = movs.map((m) => m.id);

  // Comprobante de cada movimiento: por la tabla M:N (facturas fiscales, un
  // ítem puede tocar varios movimientos) y por el vínculo directo
  // facturacion.movimientoId (comprobantes internos y recibos). El directo no
  // pisa un M:N ya resuelto — mismo criterio que la ficha.
  const facturaPorMovimiento = new Map<string, { id: string; estado: string | null }>();
  const rowsMn = await db
    .selectDistinct({
      movimientoId: facturacionItemMovimientos.movimientoId,
      facturacionId: facturacion.id,
      estado: facturacion.estado,
    })
    .from(facturacionItemMovimientos)
    .innerJoin(
      facturacionItems,
      eq(facturacionItems.id, facturacionItemMovimientos.facturacionItemId),
    )
    .innerJoin(facturacion, eq(facturacion.id, facturacionItems.facturacionId))
    .where(inArray(facturacionItemMovimientos.movimientoId, movimientoIds));
  for (const r of rowsMn) {
    facturaPorMovimiento.set(r.movimientoId, { id: r.facturacionId, estado: r.estado });
  }
  const rowsDirectas = await db
    .select({
      id: facturacion.id,
      movimientoId: facturacion.movimientoId,
      estado: facturacion.estado,
    })
    .from(facturacion)
    .where(inArray(facturacion.movimientoId, movimientoIds));
  for (const r of rowsDirectas) {
    if (!r.movimientoId || facturaPorMovimiento.has(r.movimientoId)) continue;
    facturaPorMovimiento.set(r.movimientoId, { id: r.id, estado: r.estado });
  }

  // Agrupar por socio preservando el orden cronológico del query.
  type Mov = (typeof movs)[number];
  const movsPorSocio = new Map<string, Mov[]>();
  for (const id of socioIds) movsPorSocio.set(id, []);
  for (const m of movs) {
    if (!m.socioId) continue;
    movsPorSocio.get(m.socioId)?.push(m);
  }

  for (const socioId of socioIds) {
    const propios = movsPorSocio.get(socioId) ?? [];
    if (propios.length === 0) continue;
    const cobertura = coberturaPorSocio.get(socioId);
    if (!cobertura) continue;

    // Una fila por comprobante (los movimientos sin comprobante, uno cada uno).
    const filas: { base: Mov; miembros: Mov[] }[] = [];
    const grupoPorFactura = new Map<string, { base: Mov; miembros: Mov[] }>();
    for (const m of propios) {
      const facId = facturaPorMovimiento.get(m.id)?.id;
      if (!facId) {
        filas.push({ base: m, miembros: [m] });
        continue;
      }
      const grupo = grupoPorFactura.get(facId);
      if (grupo) {
        grupo.miembros.push(m);
      } else {
        const nuevo = { base: m, miembros: [m] };
        grupoPorFactura.set(facId, nuevo);
        filas.push(nuevo);
      }
    }

    const sumar = (miembros: Mov[], f: (m: Mov) => number) =>
      miembros.reduce((t, x) => t + f(x), 0);

    const conSaldo = calcularSaldoYEstado(
      filas.map(({ base, miembros }) => {
        const montoNc = sumar(miembros, (x) => cobertura.montoNcPorMovimiento.get(x.id) ?? 0);
        const montoRecibo = sumar(
          miembros,
          (x) => cobertura.montoReciboPorMovimiento.get(x.id) ?? 0,
        );
        const comprometido = sumar(miembros, (x) => cobertura.haberComprometido.get(x.id) ?? 0);
        return {
          tipo: base.tipo,
          debe: sumar(miembros, (x) => parseFloat(x.debe ?? '0')).toFixed(2),
          haber: sumar(miembros, (x) => parseFloat(x.haber ?? '0')).toFixed(2),
          // Consolidado: 'pagado' solo si TODOS lo están; si no, manda el
          // primer cargo impago.
          estado: miembros.find((x) => x.estado !== 'pagado')?.estado ?? base.estado,
          montoCubiertoNc: montoNc > 0 ? montoNc.toFixed(2) : null,
          montoCubiertoRecibo: montoRecibo > 0 ? montoRecibo.toFixed(2) : null,
          haberComprometido: comprometido > 0 ? comprometido.toFixed(2) : null,
          esMovimientoNc: miembros.some((x) => cobertura.movimientosDeNc.has(x.id)),
          esAdelanto: base.esAdelanto,
          facturaEstado: facturaPorMovimiento.get(base.id)?.estado ?? null,
        };
      }),
    );

    out.set(
      socioId,
      conSaldo.reduce((t, f) => t + f.pendiente, 0),
    );
  }

  return out;
}
