/**
 * Consultas de Cuentas a pagar (solo servidor). Todas reciben el `guarderia_id` del admin
 * actual y filtran por él. Los importes salen como `number` (la base los guarda como numeric)
 * y los comprobantes con signo: factura y nota de débito positivas; nota de crédito y anticipo
 * negativos.
 *
 * El saldo de un comprobante no se guarda: es el total menos lo que aplicaron los pagos
 * vigentes (no anulados) del Circuito de pagos.
 */

import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { firmarArchivos } from '@/lib/archivos-privados';
import { db } from '@/lib/db';
import {
  cpComprobantes,
  cpComprobantesHistorial,
  cpPagoAplicaciones,
  cpPagos,
  profiles,
  proveedorCuentasBancarias,
  proveedores,
  type LineaIvaCp,
  type PercepcionIibbCp,
} from '@/lib/db/schema';

import { codigoCp, labelTipoComprobante, redondear, signoDe } from './constantes';

/** "Nombre Apellido" de un perfil (o su email si no cargó el nombre). */
export function nombrePersona(
  nombre: string | null,
  apellido: string | null,
  email: string | null,
): string | null {
  const n = [nombre, apellido].filter(Boolean).join(' ').trim();
  return n || email || null;
}

export async function nombreDeUsuario(uid: string | null): Promise<string | null> {
  if (!uid) return null;
  const [p] = await db
    .select({ nombre: profiles.nombre, apellido: profiles.apellido, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, uid))
    .limit(1);
  return p ? nombrePersona(p.nombre, p.apellido, p.email) : null;
}

const num = (v: string | number | null | undefined): number => (v == null ? 0 : Number(v));

/** Lo aplicado por pagos vigentes a cada comprobante (id → importe positivo). */
export async function aplicadoPorComprobante(
  gId: string,
  ids?: string[],
): Promise<Map<string, number>> {
  if (ids && ids.length === 0) return new Map();
  const filas = await db
    .select({
      comprobanteId: cpPagoAplicaciones.comprobanteId,
      aplicado: sql<string>`sum(${cpPagoAplicaciones.montoAplicado})`,
    })
    .from(cpPagoAplicaciones)
    .innerJoin(cpPagos, eq(cpPagos.id, cpPagoAplicaciones.pagoId))
    .where(
      and(
        eq(cpPagoAplicaciones.guarderiaId, gId),
        eq(cpPagos.estado, 'pagado'),
        ids ? inArray(cpPagoAplicaciones.comprobanteId, ids) : undefined,
      ),
    )
    .groupBy(cpPagoAplicaciones.comprobanteId);
  return new Map(filas.map((f) => [f.comprobanteId, num(f.aplicado)]));
}

// ─── Lista ──────────────────────────────────────────────────────────────────

export type FilaComprobante = {
  id: string;
  numero: number;
  codigo: string;
  origen: string;
  proveedorId: string;
  proveedorCodigo: string;
  cuit: string | null;
  razonSocial: string;
  fechaEmision: string;
  tipo: string;
  tipoLabel: string;
  puntoVenta: string | null;
  numeroComprobante: string | null;
  /** Fecha de ingreso al sistema (fecha de contabilización). */
  fechaIngreso: string;
  fechaVencimiento: string | null;
  moneda: string;
  /** Importes con signo (FC/ND +, NC/anticipo −). */
  neto: number;
  iva: number;
  percepcionesIibb: number;
  otrosTributos: number;
  monotributo: number;
  total: number;
  estado: string;
  /** 'Pendiente' | 'Pagado' | '—' (anulado). */
  estadoPago: string;
  fechaPago: string | null;
  concepto: string | null;
  /** Lo que falta pagar, con signo; 0 si está pagado o anulado. */
  saldo: number;
  adjuntoNombre: string | null;
  adjuntoUrl: string | null;
};

export async function listarComprobantes(gId: string): Promise<FilaComprobante[]> {
  const [filas, aplicado] = await Promise.all([
    db
      .select({
        c: cpComprobantes,
        provCodigo: proveedores.codigo,
        provCuit: proveedores.cuit,
        provNombre: proveedores.nombre,
      })
      .from(cpComprobantes)
      .innerJoin(proveedores, eq(proveedores.id, cpComprobantes.proveedorId))
      .where(and(eq(cpComprobantes.guarderiaId, gId), eq(proveedores.guarderiaId, gId)))
      .orderBy(desc(cpComprobantes.numero)),
    aplicadoPorComprobante(gId),
  ]);

  const urls = await firmarArchivos(filas.map((f) => f.c.adjuntoPath));

  return filas.map(({ c, provCodigo, provCuit, provNombre }) => {
    const signo = signoDe(c.tipoComprobante);
    const total = num(c.total);
    const anulado = c.estado === 'X';
    const pendiente = anulado ? 0 : redondear(total - (aplicado.get(c.id) ?? 0));
    return {
      id: c.id,
      numero: c.numero,
      codigo: codigoCp(c.numero),
      origen: c.origen,
      proveedorId: c.proveedorId,
      proveedorCodigo: provCodigo ?? '',
      cuit: provCuit,
      razonSocial: provNombre,
      fechaEmision: c.fechaEmision,
      tipo: c.tipoComprobante,
      tipoLabel: labelTipoComprobante(c.tipoComprobante),
      puntoVenta: c.puntoVenta,
      numeroComprobante: c.numeroComprobante,
      fechaIngreso: c.fechaContabilizacion,
      fechaVencimiento: c.fechaVencimiento,
      moneda: c.moneda,
      neto: signo * redondear(num(c.netoGravado) + num(c.netoNoGravado) + num(c.exento)),
      iva: signo * num(c.iva),
      percepcionesIibb: signo * num(c.percepcionesIibbTotal),
      otrosTributos: signo * num(c.otrosTributos),
      monotributo: signo * num(c.monotributo),
      total: signo * total,
      estado: c.estado,
      estadoPago: anulado ? '—' : c.estado === 'P' ? 'Pagado' : 'Pendiente',
      fechaPago: c.estado === 'P' ? c.fechaPago : null,
      concepto: c.concepto,
      saldo: signo * pendiente,
      adjuntoNombre: c.adjuntoNombre,
      adjuntoUrl: c.adjuntoPath ? (urls.get(c.adjuntoPath) ?? null) : null,
    };
  });
}

// ─── Detalle ────────────────────────────────────────────────────────────────

export type DetalleComprobante = {
  id: string;
  numero: number;
  codigo: string;
  origen: string;
  estado: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorCodigo: string;
  proveedorCuit: string | null;
  condicionIvaProveedor: string | null;
  fechaEmision: string;
  tipoComprobante: string;
  puntoVenta: string;
  numeroComprobante: string;
  fechaContabilizacion: string;
  fechaVencimiento: string | null;
  condicionPago: string | null;
  moneda: string;
  tipoCambio: number | null;
  concepto: string | null;
  instrumentoPago: string | null;
  lineasIva: LineaIvaCp[];
  percepcionesIibb: PercepcionIibbCp[];
  netoNoGravado: number;
  exento: number;
  otrosTributos: number;
  monotributo: number;
  total: number;
  observaciones: string | null;
  /** Total con signo y lo que falta pagar (con signo). */
  totalConSigno: number;
  saldo: number;
  /** Cuánto ya se aplicó con pagos vigentes (positivo). */
  aplicado: number;
  adjuntoNombre: string | null;
  adjuntoUrl: string | null;
  autorizadoPor: string | null;
  autorizadoAt: string | null;
  fechaPago: string | null;
  anuladoAt: string | null;
  historial: {
    desde: string | null;
    hasta: string;
    usuario: string | null;
    detalle: string | null;
    fecha: string;
  }[];
};

export async function obtenerComprobante(
  gId: string,
  id: string,
): Promise<DetalleComprobante | null> {
  const [fila] = await db
    .select({
      c: cpComprobantes,
      provCodigo: proveedores.codigo,
      provCuit: proveedores.cuit,
      provNombre: proveedores.nombre,
    })
    .from(cpComprobantes)
    .innerJoin(proveedores, eq(proveedores.id, cpComprobantes.proveedorId))
    .where(
      and(
        eq(cpComprobantes.id, id),
        eq(cpComprobantes.guarderiaId, gId),
        eq(proveedores.guarderiaId, gId),
      ),
    )
    .limit(1);
  if (!fila) return null;
  const c = fila.c;

  const [aplicadoMap, historial, urls] = await Promise.all([
    aplicadoPorComprobante(gId, [c.id]),
    db
      .select({
        desde: cpComprobantesHistorial.estadoDesde,
        hasta: cpComprobantesHistorial.estadoHasta,
        detalle: cpComprobantesHistorial.detalle,
        fecha: cpComprobantesHistorial.createdAt,
        nombre: profiles.nombre,
        apellido: profiles.apellido,
        email: profiles.email,
      })
      .from(cpComprobantesHistorial)
      .leftJoin(profiles, eq(profiles.id, cpComprobantesHistorial.usuarioId))
      .where(
        and(
          eq(cpComprobantesHistorial.comprobanteId, c.id),
          eq(cpComprobantesHistorial.guarderiaId, gId),
        ),
      )
      .orderBy(asc(cpComprobantesHistorial.createdAt)),
    firmarArchivos([c.adjuntoPath]),
  ]);

  const autorizador = await nombreDeUsuario(c.autorizadoPor);

  const signo = signoDe(c.tipoComprobante);
  const aplicado = aplicadoMap.get(c.id) ?? 0;
  const total = num(c.total);
  return {
    id: c.id,
    numero: c.numero,
    codigo: codigoCp(c.numero),
    origen: c.origen,
    estado: c.estado,
    proveedorId: c.proveedorId,
    proveedorNombre: fila.provNombre,
    proveedorCodigo: fila.provCodigo ?? '',
    proveedorCuit: fila.provCuit,
    condicionIvaProveedor: c.condicionIvaProveedor,
    fechaEmision: c.fechaEmision,
    tipoComprobante: c.tipoComprobante,
    puntoVenta: c.puntoVenta ?? '',
    numeroComprobante: c.numeroComprobante ?? '',
    fechaContabilizacion: c.fechaContabilizacion,
    fechaVencimiento: c.fechaVencimiento,
    condicionPago: c.condicionPago,
    moneda: c.moneda,
    tipoCambio: c.tipoCambio ? num(c.tipoCambio) : null,
    concepto: c.concepto,
    instrumentoPago: c.instrumentoPago,
    lineasIva: c.lineasIva ?? [],
    percepcionesIibb: c.percepcionesIibb ?? [],
    netoNoGravado: num(c.netoNoGravado),
    exento: num(c.exento),
    otrosTributos: num(c.otrosTributos),
    monotributo: num(c.monotributo),
    total,
    observaciones: c.observaciones,
    totalConSigno: signo * total,
    saldo: c.estado === 'X' ? 0 : signo * redondear(total - aplicado),
    aplicado,
    adjuntoNombre: c.adjuntoNombre,
    adjuntoUrl: c.adjuntoPath ? (urls.get(c.adjuntoPath) ?? null) : null,
    autorizadoPor: autorizador,
    autorizadoAt: c.autorizadoAt ? c.autorizadoAt.toISOString() : null,
    fechaPago: c.fechaPago,
    anuladoAt: c.anuladoAt ? c.anuladoAt.toISOString() : null,
    historial: historial.map((h) => ({
      desde: h.desde,
      hasta: h.hasta,
      usuario: nombrePersona(h.nombre, h.apellido, h.email),
      detalle: h.detalle,
      fecha: h.fecha.toISOString(),
    })),
  };
}

// ─── Proveedores para el selector ───────────────────────────────────────────

export type ProveedorSelector = {
  id: string;
  codigo: string;
  nombre: string;
  cuit: string | null;
  /** Valor del enum (responsable_inscripto, monotributo…); el rótulo se arma en pantalla. */
  condicionIva: string | null;
  condicionPago: string | null;
  formaPago: string | null;
  cuentasContables: string[];
  moneda: string;
  cuentasBancarias: { banco: string | null; cbu: string | null; alias: string | null }[];
};

/**
 * Proveedores del club para el selector. Los inactivos no se ofrecen para cargar comprobantes
 * nuevos, pero sí para pagar (pueden tener deuda pendiente). Solo se puede operar con un
 * proveedor que exista en el Maestro de Proveedores.
 */
export async function proveedoresParaSelector(
  gId: string,
  incluirInactivos = false,
): Promise<ProveedorSelector[]> {
  const [provs, cuentas] = await Promise.all([
    db
      .select()
      .from(proveedores)
      .where(
        and(
          eq(proveedores.guarderiaId, gId),
          incluirInactivos ? undefined : ne(proveedores.estado, 'inactivo'),
        ),
      )
      .orderBy(asc(proveedores.nombre)),
    db
      .select({
        proveedorId: proveedorCuentasBancarias.proveedorId,
        banco: proveedorCuentasBancarias.banco,
        cbu: proveedorCuentasBancarias.cbu,
        alias: proveedorCuentasBancarias.alias,
      })
      .from(proveedorCuentasBancarias)
      .where(eq(proveedorCuentasBancarias.guarderiaId, gId)),
  ]);
  return provs.map((p) => ({
    id: p.id,
    codigo: p.codigo ?? '',
    nombre: p.nombre,
    cuit: p.cuit,
    condicionIva: p.condicionIva,
    condicionPago: p.condicionPago,
    formaPago: p.formaPago,
    cuentasContables: p.cuentasContables ?? [],
    moneda: p.moneda,
    cuentasBancarias: cuentas
      .filter((c) => c.proveedorId === p.id)
      .map((c) => ({ banco: c.banco, cbu: c.cbu, alias: c.alias })),
  }));
}
