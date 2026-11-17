/**
 * Columnas y filas de la exportación de Pagos efectuados (Excel, PDF y CSV). Módulo plano:
 * lo usa la pantalla del navegador.
 */

import { formatoImporte } from '@/lib/cuentas-a-pagar/constantes';
import { formatArgentinaDate } from '@/lib/dates';
import { fechaLegible } from '@/lib/documentacion-fechas';

import type { FilaPago } from './consultas';

export const estadoPagoLabel = (e: string): string => (e === 'anulado' ? 'Anulado' : 'Pagado');

export const COLUMNAS_PAGOS = [
  'Fecha de pago',
  'Nro. de proveedor',
  'CUIT',
  'Razón social',
  'Nros. de comprobantes cancelados',
  'Moneda',
  'Monto pagado',
  'Forma de pago (instrumentos)',
  'Nro. de orden de pago',
  'Estado del pago',
  'Fecha de anulación',
];

export const filaPago = (f: FilaPago): string[] => [
  fechaLegible(f.fechaPago),
  f.proveedorCodigo,
  f.cuit ?? '',
  f.razonSocial,
  f.tipo === 'anticipo' ? 'Anticipo a proveedor' : f.comprobantes,
  f.moneda === 'DOL' ? 'USD' : 'ARS',
  formatoImporte(f.montoPagado),
  f.formas,
  f.codigo,
  estadoPagoLabel(f.estado),
  f.fechaAnulacion ? formatArgentinaDate(f.fechaAnulacion) : '',
];
