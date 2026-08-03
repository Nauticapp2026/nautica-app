/**
 * Cobertura targeted de los recibos de cobranza (RC-/CI-).
 *
 * Desde 2026-08 cada recibo guarda en el `datos_pago` de su movimiento de pago
 * el detalle `aplicaciones: [{ comprobanteId, monto }]` — a qué comprobante fue
 * cada peso cobrado, incluso en pagos parciales. Igual que con las Notas de
 * Crédito (ver src/lib/nc-cobertura.ts), esa plata aplica SOLO a los cargos de
 * su comprobante: un pago parcial sobre la factura X no puede "sobrar" hacia
 * comprobantes más viejos vía el pool FIFO genérico.
 *
 * Este módulo resuelve las dos vistas de esa información:
 *  - `calcularCoberturaTargeted`: por MOVIMIENTO de cuenta corriente (cargo),
 *    para el pool FIFO (reconciliar-cuenta, display de Cuenta Corriente). El
 *    haber de un pago targeted queda "comprometido" por lo aplicado y solo su
 *    excedente (adelanto / saldo a favor) entra al pool genérico.
 *  - `getAplicadoPorComprobante`: por COMPROBANTE, para saber cuánto se cobró
 *    ya de cada uno (recibos + NC asociadas) — lo usa Cobranzas para listar
 *    solo pendientes y calcular el saldo restante de un cobro parcial.
 *
 * Los recibos anteriores a este cambio no tienen `aplicaciones`: su haber
 * sigue entrando entero al pool genérico, como siempre (los comprobantes que
 * cobraron enteros ya quedaron marcados 'pagada' en su momento).
 */

import { and, asc, eq, inArray, isNotNull, like, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  movimientosCuentaCorriente,
} from '@/lib/db/schema';
import { calcularCoberturaNotasCredito } from '@/lib/nc-cobertura';

export type AplicacionCobranza = { comprobanteId: string; monto: string };

const TIPOS_NC_ASOCIABLES = [
  'nota_credito_a',
  'nota_credito_b',
  'nota_credito_c',
  'nota_credito_interna',
] as const;

// Recibos de cobranza vigentes del socio que guardaron aplicaciones targeted,
// del más viejo al más nuevo, con el id de su movimiento de pago.
async function getRecibosConAplicaciones(socioId: string): Promise<
  {
    movimientoId: string;
    aplicaciones: AplicacionCobranza[];
  }[]
> {
  const rows = await db
    .select({
      movimientoId: facturacion.movimientoId,
      datosPago: movimientosCuentaCorriente.datosPago,
    })
    .from(facturacion)
    .innerJoin(
      movimientosCuentaCorriente,
      eq(movimientosCuentaCorriente.id, facturacion.movimientoId),
    )
    .where(
      and(
        eq(facturacion.socioId, socioId),
        eq(facturacion.tipoFactura, 'recibo'),
        eq(facturacion.anulada, false),
        or(like(facturacion.codigo, 'RC-%'), like(facturacion.codigo, 'CI-%')),
      ),
    )
    .orderBy(asc(facturacion.emision), asc(facturacion.createdAt));

  const out: { movimientoId: string; aplicaciones: AplicacionCobranza[] }[] = [];
  for (const r of rows) {
    if (!r.movimientoId) continue;
    const dp = r.datosPago as { aplicaciones?: AplicacionCobranza[] } | null;
    if (!dp?.aplicaciones?.length) continue;
    out.push({ movimientoId: r.movimientoId, aplicaciones: dp.aplicaciones });
  }
  return out;
}

/**
 * Cuánto de cada comprobante del socio ya está cubierto puntualmente: suma de
 * las aplicaciones de recibos vigentes + el importe de las NC asociadas a él.
 * Fallback de `getPendientePorComprobante` para comprobantes sin cargos
 * vinculados (no hay de dónde leer estados por cargo).
 */
async function getAplicadoPorComprobante(
  socioId: string,
  guarderiaId: string,
): Promise<Map<string, number>> {
  const aplicado = new Map<string, number>();

  const recibos = await getRecibosConAplicaciones(socioId);
  for (const r of recibos) {
    for (const a of r.aplicaciones) {
      const monto = parseFloat(a.monto || '0');
      if (!(monto > 0)) continue;
      aplicado.set(a.comprobanteId, (aplicado.get(a.comprobanteId) ?? 0) + monto);
    }
  }

  const ncs = await db
    .select({
      facturaOriginalId: facturacion.facturaOriginalId,
      importe: facturacion.importe,
    })
    .from(facturacion)
    .where(
      and(
        eq(facturacion.socioId, socioId),
        eq(facturacion.guarderiaId, guarderiaId),
        inArray(facturacion.tipoFactura, [...TIPOS_NC_ASOCIABLES]),
        isNotNull(facturacion.facturaOriginalId),
        eq(facturacion.anulada, false),
      ),
    );
  for (const n of ncs) {
    if (!n.facturaOriginalId) continue;
    const monto = parseFloat(n.importe ?? '0');
    if (!(monto > 0)) continue;
    aplicado.set(n.facturaOriginalId, (aplicado.get(n.facturaOriginalId) ?? 0) + monto);
  }

  return aplicado;
}

/**
 * Saldo PENDIENTE de cobro de cada comprobante del socio — lo que Cobranzas
 * muestra y puede aplicar.
 *
 * Con cargos vinculados (link directo `facturacion.movimiento_id` + M:N vía
 * items), el saldo se calcula POR CARGO: un cargo ya `pagado` no debe nada
 * (lo cobró el débito automático Payway o una cobranza previa), y a los demás
 * se les descuenta la cobertura targeted (NC de su factura + pagos parciales
 * de recibos). Esto cubre el caso del comprobante interno "mixto": un CA- que
 * consolida servicios con y sin débito queda 'pendiente' hasta cobrarse
 * entero, pero su saldo real es solo la parte que Payway no debitó.
 *
 * Sin cargos vinculados (comprobantes legacy o sin items) se cae al cálculo
 * por importe: total − aplicaciones de recibos − NC asociadas.
 */
export async function getPendientePorComprobante(
  socioId: string,
  guarderiaId: string,
  comprobantes: { id: string; importe: string | null }[],
): Promise<Map<string, number>> {
  const pendiente = new Map<string, number>();
  if (comprobantes.length === 0) return pendiente;

  const ids = comprobantes.map((c) => c.id);

  const [{ montoPorMovimiento }, items, directos] = await Promise.all([
    calcularCoberturaTargeted(socioId),
    db
      .select({ id: facturacionItems.id, facturacionId: facturacionItems.facturacionId })
      .from(facturacionItems)
      .where(inArray(facturacionItems.facturacionId, ids)),
    db
      .select({ id: facturacion.id, movimientoId: facturacion.movimientoId })
      .from(facturacion)
      .where(inArray(facturacion.id, ids)),
  ]);

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

  const movsPorComprobante = new Map<string, Set<string>>();
  for (const d of directos) {
    const s = new Set<string>();
    if (d.movimientoId) s.add(d.movimientoId);
    movsPorComprobante.set(d.id, s);
  }
  for (const l of links) {
    const facId = itemToFac.get(l.facturacionItemId);
    if (facId) movsPorComprobante.get(facId)?.add(l.movimientoId);
  }

  const cargoIds = [...new Set([...movsPorComprobante.values()].flatMap((s) => [...s]))];
  const cargos = cargoIds.length
    ? await db
        .select({
          id: movimientosCuentaCorriente.id,
          debe: movimientosCuentaCorriente.debe,
          estado: movimientosCuentaCorriente.estado,
        })
        .from(movimientosCuentaCorriente)
        .where(inArray(movimientosCuentaCorriente.id, cargoIds))
    : [];
  const cargoById = new Map(cargos.map((c) => [c.id, c]));

  // Fallback por importe, solo para los comprobantes sin ningún cargo vinculado.
  let aplicadoFallback: Map<string, number> | null = null;

  for (const c of comprobantes) {
    const movIds = [...(movsPorComprobante.get(c.id) ?? [])];
    const cargosDeEste = movIds
      .map((id) => cargoById.get(id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .filter((m) => parseFloat(m.debe ?? '0') > 0);

    if (cargosDeEste.length > 0) {
      let resto = 0;
      for (const m of cargosDeEste) {
        if (m.estado === 'pagado') continue;
        const debe = parseFloat(m.debe ?? '0');
        resto += Math.max(0, debe - (montoPorMovimiento.get(m.id) ?? 0));
      }
      pendiente.set(c.id, resto);
    } else {
      if (!aplicadoFallback) {
        aplicadoFallback = await getAplicadoPorComprobante(socioId, guarderiaId);
      }
      const importe = parseFloat(c.importe ?? '0');
      pendiente.set(c.id, importe - (aplicadoFallback.get(c.id) ?? 0));
    }
  }

  return pendiente;
}

/**
 * Cobertura targeted (NC asociadas + recibos con aplicaciones) repartida a
 * nivel de MOVIMIENTO de cuenta corriente, para el pool FIFO.
 *
 * - `montoPorMovimiento`: total targeted (NC + recibos) que cubre cada cargo.
 * - `montoNcPorMovimiento` / `montoReciboPorMovimiento`: el desglose por
 *   origen — el display los necesita separados ("Anulado (NC)" vs "Cobrado").
 * - `movimientosDeNc`: asientos-crédito de NC targeted; se excluyen ENTEROS
 *   del pool genérico.
 * - `haberComprometido`: por movimiento de PAGO targeted, cuánto de su haber
 *   ya está aplicado a comprobantes puntuales. El pool genérico debe sumar
 *   solo `haber − comprometido` (el excedente es adelanto / saldo a favor).
 */
export async function calcularCoberturaTargeted(socioId: string): Promise<{
  montoPorMovimiento: Map<string, number>;
  montoNcPorMovimiento: Map<string, number>;
  montoReciboPorMovimiento: Map<string, number>;
  movimientosDeNc: Set<string>;
  haberComprometido: Map<string, number>;
}> {
  const { montoPorMovimiento: montoNcPorMovimiento, movimientosDeNc } =
    await calcularCoberturaNotasCredito(socioId);

  const montoReciboPorMovimiento = new Map<string, number>();
  const haberComprometido = new Map<string, number>();

  const recibos = await getRecibosConAplicaciones(socioId);

  if (recibos.length > 0) {
    // Cargos de cada comprobante aplicado, por las dos vías de vínculo
    // (directo facturacion.movimientoId + M:N vía items) — mismo criterio que
    // nc-cobertura y el resto del sistema.
    const comprobanteIds = [
      ...new Set(recibos.flatMap((r) => r.aplicaciones.map((a) => a.comprobanteId))),
    ];

    const facs = await db
      .select({ id: facturacion.id, movimientoId: facturacion.movimientoId })
      .from(facturacion)
      .where(inArray(facturacion.id, comprobanteIds));

    const items = await db
      .select({ id: facturacionItems.id, facturacionId: facturacionItems.facturacionId })
      .from(facturacionItems)
      .where(inArray(facturacionItems.facturacionId, comprobanteIds));
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

    const movsPorComprobante = new Map<string, Set<string>>();
    for (const f of facs) {
      const s = new Set<string>();
      if (f.movimientoId) s.add(f.movimientoId);
      movsPorComprobante.set(f.id, s);
    }
    for (const l of links) {
      const facId = itemToFac.get(l.facturacionItemId);
      if (facId) movsPorComprobante.get(facId)?.add(l.movimientoId);
    }

    const candidatoIds = [...new Set([...movsPorComprobante.values()].flatMap((s) => [...s]))];
    const movsInfo = candidatoIds.length
      ? await db
          .select({
            id: movimientosCuentaCorriente.id,
            debe: movimientosCuentaCorriente.debe,
            fecha: movimientosCuentaCorriente.fecha,
          })
          .from(movimientosCuentaCorriente)
          .where(inArray(movimientosCuentaCorriente.id, candidatoIds))
      : [];
    const movInfoById = new Map(movsInfo.map((m) => [m.id, m]));

    // Cubierto acumulado por cargo (NC primero — tienen prioridad, ya estaban
    // aplicadas — y encima los recibos en orden cronológico).
    const cubierto = new Map<string, number>(montoNcPorMovimiento);

    for (const r of recibos) {
      let comprometido = 0;
      for (const a of r.aplicaciones) {
        let disponible = parseFloat(a.monto || '0');
        if (!(disponible > 0)) continue;
        const movIds = movsPorComprobante.get(a.comprobanteId) ?? new Set<string>();
        const ordenados = [...movIds]
          .map((id) => movInfoById.get(id))
          .filter((m): m is NonNullable<typeof m> => Boolean(m))
          .sort((x, y) => (x.fecha && y.fecha ? x.fecha.getTime() - y.fecha.getTime() : 0));
        for (const m of ordenados) {
          if (disponible <= 0.001) break;
          const debe = parseFloat(m.debe ?? '0');
          if (debe <= 0) continue;
          const ya = cubierto.get(m.id) ?? 0;
          const restante = debe - ya;
          if (restante <= 0.001) continue;
          const aplicar = Math.min(disponible, restante);
          cubierto.set(m.id, ya + aplicar);
          montoReciboPorMovimiento.set(m.id, (montoReciboPorMovimiento.get(m.id) ?? 0) + aplicar);
          comprometido += aplicar;
          disponible -= aplicar;
        }
      }
      if (comprometido > 0) {
        haberComprometido.set(
          r.movimientoId,
          (haberComprometido.get(r.movimientoId) ?? 0) + comprometido,
        );
      }
    }
  }

  const montoPorMovimiento = new Map<string, number>();
  for (const [id, monto] of montoNcPorMovimiento) montoPorMovimiento.set(id, monto);
  for (const [id, monto] of montoReciboPorMovimiento) {
    montoPorMovimiento.set(id, (montoPorMovimiento.get(id) ?? 0) + monto);
  }

  return {
    montoPorMovimiento,
    montoNcPorMovimiento,
    montoReciboPorMovimiento,
    movimientosDeNc,
    haberComprometido,
  };
}
