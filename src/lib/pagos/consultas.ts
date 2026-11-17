/**
 * Consultas del Circuito de pagos (solo servidor). Todas reciben el `guarderia_id` del admin
 * actual y filtran por él.
 */

import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { aplicadoPorComprobante, nombreDeUsuario } from '@/lib/cuentas-a-pagar/consultas';
import {
  codigoCp,
  codigoOp,
  labelTipoComprobante,
  numeroCompleto,
  redondear,
  signoDe,
} from '@/lib/cuentas-a-pagar/constantes';
import { db } from '@/lib/db';
import {
  cpComprobantes,
  cpPagoAplicaciones,
  cpPagoMedios,
  cpPagos,
  proveedores,
} from '@/lib/db/schema';

import { labelMedio, resumenDatosMedio, type MedioPago } from './medios';

const num = (v: string | number | null | undefined): number => (v == null ? 0 : Number(v));

// ─── Cuenta corriente del proveedor (para elegir qué pagar) ─────────────────

export type FilaCuentaCorriente = {
  id: string;
  codigo: string;
  origen: string;
  tipoLabel: string;
  numeroCompleto: string;
  fechaEmision: string;
  fechaVencimiento: string | null;
  estado: string;
  moneda: string;
  /** +1 factura / nota de débito, −1 nota de crédito / anticipo. */
  signo: 1 | -1;
  /** Total original del comprobante (positivo). */
  totalOriginal: number;
  /** Lo que falta (positivo); el signo está en `signo`. */
  saldo: number;
};

/**
 * Comprobantes del proveedor que todavía tienen saldo (facturas, notas de crédito y de débito
 * y anticipos), en la moneda indicada. Solo los que están en estado A se pueden pagar; los que
 * están en H se muestran, pero bloqueados.
 */
export async function cuentaCorrienteProveedor(
  gId: string,
  proveedorId: string,
  moneda: string,
): Promise<FilaCuentaCorriente[]> {
  const filas = await db
    .select()
    .from(cpComprobantes)
    .where(
      and(
        eq(cpComprobantes.guarderiaId, gId),
        eq(cpComprobantes.proveedorId, proveedorId),
        eq(cpComprobantes.moneda, moneda),
        inArray(cpComprobantes.estado, ['H', 'A']),
      ),
    )
    .orderBy(asc(cpComprobantes.fechaEmision), asc(cpComprobantes.numero));
  const aplicado = await aplicadoPorComprobante(
    gId,
    filas.map((f) => f.id),
  );
  return filas
    .map((c) => ({
      id: c.id,
      codigo: codigoCp(c.numero),
      origen: c.origen,
      tipoLabel: labelTipoComprobante(c.tipoComprobante),
      numeroCompleto: numeroCompleto(c.puntoVenta, c.numeroComprobante),
      fechaEmision: c.fechaEmision,
      fechaVencimiento: c.fechaVencimiento,
      estado: c.estado,
      moneda: c.moneda,
      signo: signoDe(c.tipoComprobante),
      totalOriginal: num(c.total),
      saldo: redondear(num(c.total) - (aplicado.get(c.id) ?? 0)),
    }))
    .filter((f) => f.saldo > 0);
}

// ─── Pagos efectuados (lista) ───────────────────────────────────────────────

export type FilaPago = {
  id: string;
  numero: number;
  codigo: string;
  tipo: string;
  fechaPago: string;
  proveedorCodigo: string;
  cuit: string | null;
  razonSocial: string;
  /** "Factura A 00005-00001234, Nota de Crédito A 00005-00000012" (vacío en un anticipo). */
  comprobantes: string;
  moneda: string;
  montoPagado: number;
  /** "Transferencia bancaria, Cheque propio". */
  formas: string;
  estado: string;
  /** Fecha de anulación (aaaa-mm-dd, hora argentina) o null. */
  fechaAnulacion: string | null;
};

export async function listarPagos(gId: string): Promise<FilaPago[]> {
  const pagos = await db
    .select({
      p: cpPagos,
      provCodigo: proveedores.codigo,
      provCuit: proveedores.cuit,
      provNombre: proveedores.nombre,
    })
    .from(cpPagos)
    .innerJoin(proveedores, eq(proveedores.id, cpPagos.proveedorId))
    .where(and(eq(cpPagos.guarderiaId, gId), eq(proveedores.guarderiaId, gId)))
    .orderBy(desc(cpPagos.numero));
  if (pagos.length === 0) return [];
  const ids = pagos.map((x) => x.p.id);

  const [aplicaciones, medios] = await Promise.all([
    db
      .select({
        pagoId: cpPagoAplicaciones.pagoId,
        numero: cpComprobantes.numero,
        tipo: cpComprobantes.tipoComprobante,
        pv: cpComprobantes.puntoVenta,
        nro: cpComprobantes.numeroComprobante,
        origen: cpComprobantes.origen,
      })
      .from(cpPagoAplicaciones)
      .innerJoin(cpComprobantes, eq(cpComprobantes.id, cpPagoAplicaciones.comprobanteId))
      .where(and(eq(cpPagoAplicaciones.guarderiaId, gId), inArray(cpPagoAplicaciones.pagoId, ids))),
    db
      .select({ pagoId: cpPagoMedios.pagoId, medio: cpPagoMedios.medio, orden: cpPagoMedios.orden })
      .from(cpPagoMedios)
      .where(and(eq(cpPagoMedios.guarderiaId, gId), inArray(cpPagoMedios.pagoId, ids)))
      .orderBy(asc(cpPagoMedios.orden)),
  ]);

  return pagos.map(({ p, provCodigo, provCuit, provNombre }) => ({
    id: p.id,
    numero: p.numero,
    codigo: codigoOp(p.numero),
    tipo: p.tipo,
    fechaPago: p.fechaPago,
    proveedorCodigo: provCodigo ?? '',
    cuit: provCuit,
    razonSocial: provNombre,
    comprobantes: aplicaciones
      .filter((a) => a.pagoId === p.id)
      .map((a) =>
        a.origen === 'anticipo'
          ? `Anticipo ${codigoCp(a.numero)}`
          : `${labelTipoComprobante(a.tipo)} ${numeroCompleto(a.pv, a.nro)}`,
      )
      .join(', '),
    moneda: p.moneda,
    montoPagado: num(p.montoPagado),
    formas: [
      ...new Set(medios.filter((m) => m.pagoId === p.id).map((m) => labelMedio(m.medio))),
    ].join(', '),
    estado: p.estado,
    fechaAnulacion: p.anuladoAt ? p.anuladoAt.toISOString() : null,
  }));
}

// ─── Detalle de una orden de pago ───────────────────────────────────────────

export type DetallePago = {
  id: string;
  numero: number;
  codigo: string;
  tipo: string;
  fechaPago: string;
  estado: string;
  moneda: string;
  tipoCambio: number | null;
  proveedor: { id: string; codigo: string; nombre: string; cuit: string | null };
  montoComprobantes: number;
  montoPagado: number;
  observaciones: string | null;
  creadoPor: string | null;
  anuladoAt: string | null;
  anuladoPor: string | null;
  aplicaciones: {
    comprobanteId: string;
    codigo: string;
    origen: string;
    tipoLabel: string;
    numeroCompleto: string;
    signo: 1 | -1;
    saldoPrevio: number;
    montoAplicado: number;
    descuentoAjuste: number;
  }[];
  medios: {
    medio: MedioPago;
    label: string;
    monto: number;
    datos: Record<string, string>;
    detalle: string;
  }[];
};

export async function obtenerPago(gId: string, id: string): Promise<DetallePago | null> {
  const [fila] = await db
    .select({
      p: cpPagos,
      provCodigo: proveedores.codigo,
      provCuit: proveedores.cuit,
      provNombre: proveedores.nombre,
    })
    .from(cpPagos)
    .innerJoin(proveedores, eq(proveedores.id, cpPagos.proveedorId))
    .where(and(eq(cpPagos.id, id), eq(cpPagos.guarderiaId, gId), eq(proveedores.guarderiaId, gId)))
    .limit(1);
  if (!fila) return null;
  const p = fila.p;

  const [aplicaciones, medios, creadoPor, anuladoPor] = await Promise.all([
    db
      .select({
        a: cpPagoAplicaciones,
        numero: cpComprobantes.numero,
        origen: cpComprobantes.origen,
        tipo: cpComprobantes.tipoComprobante,
        pv: cpComprobantes.puntoVenta,
        nro: cpComprobantes.numeroComprobante,
      })
      .from(cpPagoAplicaciones)
      .innerJoin(cpComprobantes, eq(cpComprobantes.id, cpPagoAplicaciones.comprobanteId))
      .where(and(eq(cpPagoAplicaciones.pagoId, p.id), eq(cpPagoAplicaciones.guarderiaId, gId))),
    db
      .select()
      .from(cpPagoMedios)
      .where(and(eq(cpPagoMedios.pagoId, p.id), eq(cpPagoMedios.guarderiaId, gId)))
      .orderBy(asc(cpPagoMedios.orden)),
    nombreDeUsuario(p.createdBy),
    nombreDeUsuario(p.anuladoPor),
  ]);

  return {
    id: p.id,
    numero: p.numero,
    codigo: codigoOp(p.numero),
    tipo: p.tipo,
    fechaPago: p.fechaPago,
    estado: p.estado,
    moneda: p.moneda,
    tipoCambio: p.tipoCambio ? num(p.tipoCambio) : null,
    proveedor: {
      id: p.proveedorId,
      codigo: fila.provCodigo ?? '',
      nombre: fila.provNombre,
      cuit: fila.provCuit,
    },
    montoComprobantes: num(p.montoComprobantes),
    montoPagado: num(p.montoPagado),
    observaciones: p.observaciones,
    creadoPor,
    anuladoAt: p.anuladoAt ? p.anuladoAt.toISOString() : null,
    anuladoPor,
    aplicaciones: aplicaciones.map(({ a, numero, origen, tipo, pv, nro }) => ({
      comprobanteId: a.comprobanteId,
      codigo: codigoCp(numero),
      origen,
      tipoLabel: labelTipoComprobante(tipo),
      numeroCompleto: numeroCompleto(pv, nro),
      signo: signoDe(tipo),
      saldoPrevio: num(a.saldoPrevio),
      montoAplicado: num(a.montoAplicado),
      descuentoAjuste: num(a.descuentoAjuste),
    })),
    medios: medios.map((m) => ({
      medio: m.medio as MedioPago,
      label: labelMedio(m.medio),
      monto: num(m.monto),
      datos: m.datos ?? {},
      detalle: resumenDatosMedio(m.medio as MedioPago, m.datos ?? {}),
    })),
  };
}
