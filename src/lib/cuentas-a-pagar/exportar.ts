/**
 * Columnas y filas de la exportación de Cuentas a pagar (Excel, PDF y CSV). Módulo plano:
 * lo usa la pantalla del navegador. Las filas salen tal cual se ven en la tabla (importes con
 * signo, fechas dd/mm/aaaa).
 */

import { fechaLegible } from '@/lib/documentacion-fechas';

import { formatoImporte, labelEstadoCp, numeroCompleto } from './constantes';
import type { FilaComprobante } from './consultas';

const importe = (n: number): string => formatoImporte(n);
const fecha = (f: string | null): string => (f ? fechaLegible(f) : '');

/** Excel y CSV: todas las columnas. */
export const COLUMNAS_COMPLETAS = [
  'Adjunto',
  'Nº interno',
  'Nro. de proveedor',
  'CUIT',
  'Razón social',
  'Fecha de comprobante',
  'Tipo de comprobante',
  'Fecha de ingreso',
  'Nro. de comprobante',
  'Moneda',
  'Monto neto',
  'IVA',
  'Percepciones IIBB',
  'Otros impuestos',
  'Monotributo',
  'Monto bruto',
  'Estado de pago',
  'Fecha de pago',
  'Imputación contable',
  'Estado del comprobante',
  'Saldo a pagar',
];

export const filaCompleta = (f: FilaComprobante): string[] => [
  f.adjuntoNombre ? 'Sí' : 'No',
  f.codigo,
  f.proveedorCodigo,
  f.cuit ?? '',
  f.razonSocial,
  fecha(f.fechaEmision),
  f.tipoLabel,
  fecha(f.fechaIngreso),
  numeroCompleto(f.puntoVenta, f.numeroComprobante),
  f.moneda === 'DOL' ? 'USD' : 'ARS',
  importe(f.neto),
  importe(f.iva),
  importe(f.percepcionesIibb),
  importe(f.otrosTributos),
  importe(f.monotributo),
  importe(f.total),
  f.estadoPago,
  fecha(f.fechaPago),
  f.concepto ?? '',
  labelEstadoCp(f.estado),
  importe(f.saldo),
];

/** PDF: las columnas que entran legibles en una hoja apaisada. */
export const COLUMNAS_PDF = [
  'Nº',
  'Proveedor',
  'CUIT',
  'F. comprob.',
  'Tipo',
  'Nro. comprobante',
  'Neto',
  'IVA',
  'Perc. IIBB',
  'Otros',
  'Monotrib.',
  'Bruto',
  'Estado',
  'F. pago',
  'Saldo',
];

export const filaPdf = (f: FilaComprobante): string[] => [
  f.codigo,
  `${f.proveedorCodigo} ${f.razonSocial}`.trim(),
  f.cuit ?? '',
  fecha(f.fechaEmision),
  f.tipoLabel,
  numeroCompleto(f.puntoVenta, f.numeroComprobante),
  importe(f.neto),
  importe(f.iva),
  importe(f.percepcionesIibb),
  importe(f.otrosTributos),
  importe(f.monotributo),
  importe(f.total),
  `${f.estado} · ${f.estadoPago}`,
  fecha(f.fechaPago),
  importe(f.saldo),
];
