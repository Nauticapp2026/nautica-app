/**
 * Medios de pago del Circuito de pagos (órdenes de pago a proveedores) y los datos que pide
 * cada uno. Una sola definición alimenta el formulario (qué campos mostrar) y el servidor
 * (qué es obligatorio y qué se guarda). Módulo plano, sin 'use server'.
 */

import { parseImporte } from '@/lib/cuentas-a-pagar/calculos';
import type { CampoInstrumento } from '@/lib/tesoreria/datos-instrumento';

export type MedioPago = 'transferencia' | 'cheque_propio' | 'cheque_terceros' | 'efectivo';

export const MEDIOS_PAGO: { value: MedioPago; label: string }[] = [
  { value: 'transferencia', label: 'Transferencia bancaria' },
  { value: 'cheque_propio', label: 'Cheque propio' },
  { value: 'cheque_terceros', label: 'Cheque de terceros' },
  { value: 'efectivo', label: 'Caja efectivo' },
];

export const MEDIOS_VALUES: string[] = MEDIOS_PAGO.map((m) => m.value);

/**
 * Instrumento de Tesorería en el que se registra el egreso de un medio de pago. Los dos cheques
 * (propio y de terceros) salen de la caja "Cheque"; el efectivo de un pago en dólares va a la
 * caja de efectivo en dólares.
 */
export function instrumentoDeMedio(medio: string, moneda: string): string {
  if (medio === 'cheque_propio' || medio === 'cheque_terceros') return 'cheque';
  if (medio === 'efectivo') return moneda === 'DOL' ? 'efectivo_usd' : 'efectivo';
  return 'transferencia';
}

export const labelMedio = (v: string): string => MEDIOS_PAGO.find((m) => m.value === v)?.label ?? v;

export const CAMPOS_MEDIO: Record<MedioPago, CampoInstrumento[]> = {
  transferencia: [
    {
      key: 'cuentaOrigen',
      label: 'Cuenta bancaria de origen (propia)',
      placeholder: 'Banco · Nº de cuenta o CBU',
      requerido: true,
    },
    {
      key: 'cbuAlias',
      label: 'CBU / Alias de destino',
      placeholder: 'CBU o alias del proveedor',
      requerido: true,
    },
    {
      key: 'nroReferencia',
      label: 'Nº de referencia / transacción',
      placeholder: 'Número',
      requerido: true,
    },
    {
      key: 'gastoBancario',
      label: 'Gasto bancario asociado',
      tipo: 'decimal',
      placeholder: '0,00',
      requerido: false,
    },
  ],
  cheque_propio: [
    { key: 'bancoEmisor', label: 'Banco emisor', placeholder: 'Banco', requerido: true },
    { key: 'numeroCheque', label: 'Número de cheque', placeholder: 'Número', requerido: true },
    { key: 'fechaEmision', label: 'Fecha de emisión', tipo: 'date', requerido: true },
    {
      key: 'fechaVencimiento',
      label: 'Fecha de vencimiento (pago diferido)',
      tipo: 'date',
      requerido: false,
    },
  ],
  cheque_terceros: [
    {
      key: 'idCheque',
      label: 'ID del cheque en cartera (para endoso)',
      placeholder: 'ID del cheque',
      requerido: true,
    },
    { key: 'bancoOriginal', label: 'Banco original', placeholder: 'Banco', requerido: true },
    { key: 'numeroCheque', label: 'Número de cheque', placeholder: 'Número', requerido: true },
    { key: 'fechaVencimiento', label: 'Fecha de vencimiento', tipo: 'date', requerido: true },
  ],
  efectivo: [],
};

/** Deja solo las claves que el medio conoce, recortadas y sin vacíos. */
export function limpiarDatosMedio(
  medio: MedioPago,
  datos: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const campo of CAMPOS_MEDIO[medio]) {
    const v = datos[campo.key];
    const txt = typeof v === 'string' ? v.trim().slice(0, 120) : '';
    if (txt) out[campo.key] = txt;
  }
  return out;
}

/** Primer problema de los datos de un medio, o null si está todo bien. */
export function validarDatosMedio(medio: MedioPago, datos: Record<string, string>): string | null {
  for (const campo of CAMPOS_MEDIO[medio]) {
    const v = datos[campo.key] ?? '';
    if (campo.requerido && !v) return `Completá "${campo.label}" (${labelMedio(medio)}).`;
    if (!v) continue;
    if (campo.tipo === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return `"${campo.label}" tiene que ser una fecha válida.`;
    }
    if (campo.tipo === 'decimal' && !(parseImporte(v) >= 0)) {
      return `"${campo.label}" tiene que ser un importe válido.`;
    }
  }
  if (medio === 'cheque_propio') {
    const e = datos.fechaEmision;
    const v = datos.fechaVencimiento;
    if (e && v && v < e) return 'El vencimiento del cheque no puede ser anterior a su emisión.';
  }
  return null;
}

/** "Cheque 1234 · Banco Galicia": una línea para la consulta y el Excel. */
export function resumenDatosMedio(medio: MedioPago, datos: Record<string, string> | null): string {
  if (!datos) return '';
  const partes: string[] = [];
  for (const campo of CAMPOS_MEDIO[medio]) {
    const v = datos[campo.key];
    if (!v) continue;
    if (campo.tipo === 'date') {
      const [y, m, d] = v.split('-');
      partes.push(`${campo.label.split(' (')[0]} ${d}/${m}/${y}`);
    } else if (campo.key === 'numeroCheque') partes.push(`Cheque ${v}`);
    else if (campo.key === 'nroReferencia') partes.push(`Ref. ${v}`);
    else if (campo.key === 'gastoBancario') partes.push(`Gasto bancario ${v}`);
    else partes.push(v);
  }
  return partes.join(' · ');
}
