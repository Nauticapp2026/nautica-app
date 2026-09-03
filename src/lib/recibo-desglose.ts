/**
 * Desglose "En concepto de" de un recibo de cobranza (RC-/RI-): qué comprobantes
 * cobró, cuánto le aplicó a cada uno y el detalle de cargos de cada comprobante.
 *
 * Vive acá porque lo consumen dos vistas que tienen que decir lo MISMO: la
 * página imprimible del recibo y el mail que se le manda al socio. Estaban
 * duplicadas y divergían.
 *
 * Sobre los importes del detalle: cuando el recibo cubrió el comprobante solo en
 * parte, los cargos NO llevan importe. El importe de un cargo es su total, no lo
 * que este recibo pagó, así que mostrarlo al lado de una aplicación parcial hace
 * que el sub-detalle contradiga el monto cobrado que figura arriba (el cliente
 * reportó exactamente eso: "el detalle no corresponde con lo que pagamos sobre
 * cada comprobante"). Prorratear tampoco sirve: inventaría cifras que no están
 * en ningún asiento. Con la aplicación entera sí se muestran, que es el caso
 * donde el total del cargo y lo cobrado coinciden.
 */

import { and, asc, eq, inArray, ne } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  movimientosCuentaCorriente,
} from '@/lib/db/schema';

export type AplicacionRecibo = { comprobanteId: string; monto: string };

export type DetalleCargo = { concepto: string | null; importe: string | null };

export type ComprobanteCobrado = {
  codigo: string | null;
  tipoFactura: string | null;
  /** Total del comprobante. */
  importe: string | null;
  /** Lo que este recibo le aplicó. `null` en recibos viejos sin aplicaciones. */
  montoAplicado: string | null;
  /** true si lo aplicado es menor al total del comprobante. */
  parcial: boolean;
  detalle: DetalleCargo[];
};

/**
 * Formas de pago y aplicaciones targeted guardadas en el movimiento de pago del
 * recibo. `aplicaciones` es `null` en recibos anteriores a 2026-08 (no las
 * guardaban) — quien lo consuma debe distinguir ese caso del array vacío.
 */
export async function getDatosPagoRecibo(movimientoId: string): Promise<{
  formas: { tipo: string; monto: string }[];
  aplicaciones: AplicacionRecibo[] | null;
}> {
  const [mov] = await db
    .select({ datosPago: movimientosCuentaCorriente.datosPago })
    .from(movimientosCuentaCorriente)
    .where(eq(movimientosCuentaCorriente.id, movimientoId))
    .limit(1);
  const dp = mov?.datosPago as {
    formas?: { tipo: string; monto: string }[];
    aplicaciones?: AplicacionRecibo[];
  } | null;
  return {
    formas: dp?.formas?.length ? dp.formas : [],
    aplicaciones: dp?.aplicaciones ?? null,
  };
}

/**
 * Los comprobantes que cobró el recibo, con lo aplicado a cada uno y su detalle
 * de cargos. `comprobanteIds` es `facturacion.cobranza_comprobante_ids`.
 */
export async function getComprobantesCobrados(
  guarderiaId: string,
  comprobanteIds: string[],
  aplicaciones: AplicacionRecibo[] | null,
): Promise<ComprobanteCobrado[]> {
  if (comprobanteIds.length === 0) return [];

  const aplicadoPorComprobante = new Map(
    (aplicaciones ?? []).map((a) => [a.comprobanteId, a.monto]),
  );

  const cobrados = await db
    .select({
      id: facturacion.id,
      codigo: facturacion.codigo,
      tipoFactura: facturacion.tipoFactura,
      importe: facturacion.importe,
      descripcion: facturacion.descripcion,
    })
    .from(facturacion)
    .where(and(inArray(facturacion.id, comprobanteIds), eq(facturacion.guarderiaId, guarderiaId)))
    .orderBy(asc(facturacion.emision));
  if (cobrados.length === 0) return [];

  // Detalle de cada comprobante: sus cargos (concepto + importe) vía
  // facturacion_items → movimientos. Sin ítems (ej. una ND con vínculo directo)
  // se cae a la descripción del comprobante.
  const itemRows = await db
    .select({
      facturacionId: facturacionItems.facturacionId,
      importe: facturacionItems.importe,
      concepto: movimientosCuentaCorriente.concepto,
    })
    .from(facturacionItems)
    .innerJoin(
      facturacionItemMovimientos,
      eq(facturacionItemMovimientos.facturacionItemId, facturacionItems.id),
    )
    .innerJoin(
      movimientosCuentaCorriente,
      eq(movimientosCuentaCorriente.id, facturacionItemMovimientos.movimientoId),
    )
    .where(
      inArray(
        facturacionItems.facturacionId,
        cobrados.map((c) => c.id),
      ),
    );

  const detallePorComprobante = new Map<string, DetalleCargo[]>();
  for (const it of itemRows) {
    if (!detallePorComprobante.has(it.facturacionId))
      detallePorComprobante.set(it.facturacionId, []);
    detallePorComprobante.get(it.facturacionId)!.push({
      concepto: it.concepto,
      importe: it.importe,
    });
  }

  return cobrados.map((c) => {
    const montoAplicado = aplicadoPorComprobante.get(c.id) ?? null;
    const parcial =
      montoAplicado != null && parseFloat(montoAplicado) < parseFloat(c.importe ?? '0') - 0.005;
    const detalle =
      detallePorComprobante.get(c.id) ??
      (c.descripcion ? [{ concepto: c.descripcion, importe: null }] : []);
    return {
      codigo: c.codigo,
      tipoFactura: c.tipoFactura,
      importe: c.importe,
      montoAplicado,
      parcial,
      // Aplicación parcial: los cargos van sin importe (ver nota del módulo).
      detalle: parcial ? detalle.map((d) => ({ concepto: d.concepto, importe: null })) : detalle,
    };
  });
}

/**
 * Heurística SOLO para recibos viejos (sin `cobranza_comprobante_ids` ni
 * `aplicaciones`): lista las facturas del socio de la más antigua a la más nueva
 * hasta cubrir el importe del recibo. No sabe cuánto se aplicó a cada una, así
 * que devuelve `montoAplicado: null` y detalle vacío — nunca inventa un reparto.
 */
export async function getComprobantesCobradosLegacy(
  guarderiaId: string,
  socioId: string,
  importeRecibo: string | null,
): Promise<ComprobanteCobrado[]> {
  const facturasSocio = await db
    .select({
      codigo: facturacion.codigo,
      tipoFactura: facturacion.tipoFactura,
      importe: facturacion.importe,
    })
    .from(facturacion)
    .where(
      and(
        eq(facturacion.socioId, socioId),
        eq(facturacion.guarderiaId, guarderiaId),
        ne(facturacion.tipoFactura, 'recibo'),
        inArray(facturacion.tipoFactura, ['factura_a', 'factura_b', 'factura_c']),
      ),
    )
    .orderBy(asc(facturacion.emision));

  const total = parseFloat(importeRecibo ?? '0');
  const out: ComprobanteCobrado[] = [];
  let acumulado = 0;
  for (const f of facturasSocio) {
    if (acumulado >= total - 0.001) break;
    out.push({
      codigo: f.codigo,
      tipoFactura: f.tipoFactura,
      importe: f.importe,
      montoAplicado: null,
      parcial: false,
      detalle: [],
    });
    acumulado += parseFloat(f.importe ?? '0');
  }
  return out;
}
