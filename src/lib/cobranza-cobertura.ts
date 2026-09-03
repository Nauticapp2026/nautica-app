/**
 * Cobertura targeted de los recibos de cobranza (RC-/RI-).
 *
 * Desde 2026-08 cada recibo guarda en el `datos_pago` de su movimiento de pago
 * el detalle `aplicaciones: [{ comprobanteId, monto }]` — a qué comprobante fue
 * cada peso cobrado, incluso en pagos parciales. Esa plata aplica SOLO a los
 * cargos de su comprobante: un pago parcial sobre la factura X no puede
 * "sobrar" hacia comprobantes más viejos vía el pool FIFO genérico. (Las Notas
 * de Crédito no aplican solas a nada — ver src/lib/nc-cobertura.ts.)
 *
 * Este módulo resuelve las dos vistas de esa información:
 *  - `calcularCoberturaTargeted`: por MOVIMIENTO de cuenta corriente (cargo),
 *    para el pool FIFO (reconciliar-cuenta, display de Cuenta Corriente). El
 *    haber de un pago targeted queda "comprometido" por lo aplicado y solo su
 *    excedente (adelanto / saldo a favor) entra al pool genérico.
 *  - `getAplicadoPorComprobante`: por COMPROBANTE, para saber cuánto se cobró
 *    ya de cada uno (aplicaciones de recibos) — lo usa Cobranzas para listar
 *    solo pendientes y calcular el saldo restante de un cobro parcial.
 *
 * Los recibos anteriores a este cambio no tienen `aplicaciones`: su haber
 * sigue entrando entero al pool genérico, como siempre (los comprobantes que
 * cobraron enteros ya quedaron marcados 'pagada' en su momento).
 */

import { and, asc, eq, inArray, like, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { PATRONES_RECIBO_COBRANZA } from '@/lib/recibo-codigos';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  movimientosCuentaCorriente,
} from '@/lib/db/schema';
import { calcularCoberturaNotasCreditoBatch } from '@/lib/nc-cobertura';

export type AplicacionCobranza = { comprobanteId: string; monto: string };

/**
 * Un recibo de cobranza tal como lo necesita el reparto: a qué comprobantes
 * aplicó y cuánto de eso lo financió una nota de crédito (no el haber del
 * recibo). `ncAplicado` es clave para el pool: ver `repartirRecibos`.
 */
type ReciboConAplicaciones = {
  movimientoId: string;
  aplicaciones: AplicacionCobranza[];
  ncAplicado: number;
};

// Recibos de cobranza vigentes del socio que guardaron aplicaciones targeted,
// del más viejo al más nuevo, con el id de su movimiento de pago.
async function getRecibosConAplicaciones(socioId: string): Promise<ReciboConAplicaciones[]> {
  return (await getRecibosConAplicacionesBatch([socioId])).get(socioId) ?? [];
}

/** Igual que `getRecibosConAplicaciones` para varios socios, en una sola query. */
async function getRecibosConAplicacionesBatch(
  socioIds: string[],
): Promise<Map<string, ReciboConAplicaciones[]>> {
  const out = new Map<string, ReciboConAplicaciones[]>();
  for (const id of socioIds) out.set(id, []);
  if (socioIds.length === 0) return out;

  const rows = await db
    .select({
      socioId: facturacion.socioId,
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
        inArray(facturacion.socioId, socioIds),
        eq(facturacion.tipoFactura, 'recibo'),
        eq(facturacion.anulada, false),
        or(...PATRONES_RECIBO_COBRANZA.map((p) => like(facturacion.codigo, p))),
      ),
    )
    .orderBy(asc(facturacion.emision), asc(facturacion.createdAt));

  for (const r of rows) {
    if (!r.movimientoId || !r.socioId) continue;
    const dp = r.datosPago as {
      aplicaciones?: AplicacionCobranza[];
      notasCredito?: { id: string; importe: string | null }[];
    } | null;
    if (!dp?.aplicaciones?.length) continue;
    // Recibos anteriores a 2026-08-26 no registran qué NC usaron: quedan en 0
    // (su comportamiento no cambia).
    const ncAplicado = (dp.notasCredito ?? []).reduce(
      (acc, n) => acc + (parseFloat(n.importe ?? '0') || 0),
      0,
    );
    out.get(r.socioId)?.push({
      movimientoId: r.movimientoId,
      aplicaciones: dp.aplicaciones,
      ncAplicado,
    });
  }
  return out;
}

/**
 * Cuánto de cada comprobante del socio ya está cubierto puntualmente: suma de
 * las aplicaciones de recibos vigentes. Fallback de `getPendientePorComprobante`
 * para comprobantes sin cargos vinculados (no hay de dónde leer estados por
 * cargo).
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

  // Las NC ya NO descuentan del pendiente de su factura original: toda nota se
  // aplica a mano en Cobranzas y su valor llega por las `aplicaciones` del
  // recibo que la usó, igual que la plata (decisión del cliente 2026-08-28).

  return aplicado;
}

/**
 * Saldo PENDIENTE de cobro de cada comprobante del socio — lo que Cobranzas
 * muestra y puede aplicar.
 *
 * Con cargos vinculados (link directo `facturacion.movimiento_id` + M:N vía
 * items), el saldo se calcula POR CARGO: un cargo ya `pagado` no debe nada
 * (lo cobró el débito automático Payway o una cobranza previa), y a los demás
 * se les descuenta la cobertura targeted (pagos parciales de recibos; las NC
 * ya no aplican solas — se usan a mano en Cobranzas). Esto cubre el caso del comprobante interno "mixto": un CA- que
 * consolida servicios con y sin débito queda 'pendiente' hasta cobrarse
 * entero, pero su saldo real es solo la parte que Payway no debitó.
 *
 * Sin cargos vinculados (comprobantes legacy o sin items) se cae al cálculo
 * por importe: total − aplicaciones de recibos.
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
export async function calcularCoberturaTargeted(socioId: string): Promise<CoberturaTargeted> {
  const porSocio = await calcularCoberturaTargetedBatch([socioId]);
  return porSocio.get(socioId) ?? coberturaVacia();
}

export type CoberturaTargeted = {
  montoPorMovimiento: Map<string, number>;
  montoNcPorMovimiento: Map<string, number>;
  montoReciboPorMovimiento: Map<string, number>;
  movimientosDeNc: Set<string>;
  haberComprometido: Map<string, number>;
};

function coberturaVacia(): CoberturaTargeted {
  return {
    montoPorMovimiento: new Map(),
    montoNcPorMovimiento: new Map(),
    montoReciboPorMovimiento: new Map(),
    movimientosDeNc: new Set(),
    haberComprometido: new Map(),
  };
}

/**
 * Igual que `calcularCoberturaTargeted` pero resolviendo varios socios con las
 * mismas queries — lo usa el listado de socios (ver `getPoolRestanteBatch`).
 * El criterio por socio es idéntico; solo se agrupa distinto.
 */
export async function calcularCoberturaTargetedBatch(
  socioIds: string[],
): Promise<Map<string, CoberturaTargeted>> {
  const out = new Map<string, CoberturaTargeted>();
  if (socioIds.length === 0) return out;

  const [ncPorSocio, recibosPorSocio] = await Promise.all([
    calcularCoberturaNotasCreditoBatch(socioIds),
    getRecibosConAplicacionesBatch(socioIds),
  ]);

  // Los cargos de cada comprobante se resuelven UNA vez para todos los socios:
  // los ids de comprobante son únicos, así que el mapa comprobante → cargos se
  // puede compartir sin riesgo de cruzar socios.
  const todosLosRecibos = [...recibosPorSocio.values()].flat();
  const movsPorComprobante = new Map<string, Set<string>>();
  const movInfoById = new Map<string, { id: string; debe: string | null; fecha: Date | null }>();

  if (todosLosRecibos.length > 0) {
    const comprobanteIds = [
      ...new Set(todosLosRecibos.flatMap((r) => r.aplicaciones.map((a) => a.comprobanteId))),
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
    if (candidatoIds.length > 0) {
      const movsInfo = await db
        .select({
          id: movimientosCuentaCorriente.id,
          debe: movimientosCuentaCorriente.debe,
          fecha: movimientosCuentaCorriente.fecha,
        })
        .from(movimientosCuentaCorriente)
        .where(inArray(movimientosCuentaCorriente.id, candidatoIds));
      for (const m of movsInfo) movInfoById.set(m.id, m);
    }
  }

  for (const socioId of socioIds) {
    const nc = ncPorSocio.get(socioId);
    const montoNcPorMovimiento = nc?.montoPorMovimiento ?? new Map<string, number>();
    const movimientosDeNc = nc?.movimientosDeNc ?? new Set<string>();
    const recibos = recibosPorSocio.get(socioId) ?? [];

    const { montoReciboPorMovimiento, haberComprometido } = repartirRecibos(
      recibos,
      montoNcPorMovimiento,
      movsPorComprobante,
      movInfoById,
    );

    const montoPorMovimiento = new Map<string, number>();
    for (const [id, monto] of montoNcPorMovimiento) montoPorMovimiento.set(id, monto);
    for (const [id, monto] of montoReciboPorMovimiento) {
      montoPorMovimiento.set(id, (montoPorMovimiento.get(id) ?? 0) + monto);
    }

    out.set(socioId, {
      montoPorMovimiento,
      montoNcPorMovimiento,
      montoReciboPorMovimiento,
      movimientosDeNc,
      haberComprometido,
    });
  }

  return out;
}

/**
 * Reparte las aplicaciones de los recibos de UN socio entre los cargos de cada
 * comprobante, en orden cronológico y arrancando de lo que ya cubrieron las NC.
 */
function repartirRecibos(
  recibos: ReciboConAplicaciones[],
  montoNcPorMovimiento: Map<string, number>,
  movsPorComprobante: Map<string, Set<string>>,
  movInfoById: Map<string, { id: string; debe: string | null; fecha: Date | null }>,
): {
  montoReciboPorMovimiento: Map<string, number>;
  haberComprometido: Map<string, number>;
} {
  const montoReciboPorMovimiento = new Map<string, number>();
  const haberComprometido = new Map<string, number>();

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
    // `haberComprometido` mide cuánto del HABER del recibo quedó atado a cargos
    // puntuales: el pool genérico suma `haber − comprometido`. Lo aplicado se
    // financia con efectivo + saldo a favor + notas de crédito, pero el crédito
    // de una NC nunca entró al pool (su asiento está en `movimientosDeNc`), así
    // que incluirlo acá lo descontaba DOS veces y el saldo a favor quedaba corto
    // por el importe de la nota (reporte del cliente 2026-08-31: la card decía
    // $2,50 donde el libro daba $3,00, la diferencia era una NC de $0,50).
    const comprometidoDelHaber = Math.max(0, comprometido - r.ncAplicado);
    if (comprometidoDelHaber > 0) {
      haberComprometido.set(
        r.movimientoId,
        (haberComprometido.get(r.movimientoId) ?? 0) + comprometidoDelHaber,
      );
    }
  }

  return { montoReciboPorMovimiento, haberComprometido };
}
