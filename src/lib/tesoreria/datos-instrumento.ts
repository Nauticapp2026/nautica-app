/**
 * Datos adicionales que pide cada instrumento al cargar un movimiento manual
 * de Tesorería (pedido del cliente 2026-10-13: "si elijo transferencia,
 * tarjeta, cheque, etc. se deben habilitar los campos requeridos").
 *
 * Las claves son las mismas que usa Cobranzas en `datos_pago.formas[].datos`
 * (banco, nroOperacion, ultimos4, numeroCheque, cuotas, usd, tc, ...) para
 * que un recibo y un movimiento manual del mismo instrumento se lean igual.
 *
 * Una sola definición alimenta el formulario (qué campos mostrar) y el server
 * action (qué es obligatorio y qué claves se guardan). Módulo plano, sin
 * 'use server'.
 */

import type { Instrumento } from './instrumentos';

export type CampoInstrumento = {
  key: string;
  label: string;
  tipo?: 'text' | 'date' | 'decimal' | 'select';
  placeholder?: string;
  requerido: boolean;
  opciones?: { value: string; label: string }[];
};

const CUOTAS = [1, 2, 3, 6, 9, 12, 18, 24].map((n) => ({
  value: String(n),
  label: n === 1 ? 'Contado' : `${n} cuotas`,
}));

export const CAMPOS_INSTRUMENTO: Record<Instrumento, CampoInstrumento[]> = {
  efectivo: [],
  efectivo_usd: [
    {
      key: 'usd',
      label: 'Monto en dólares',
      tipo: 'decimal',
      placeholder: '0,00',
      requerido: true,
    },
    { key: 'tc', label: 'Tipo de cambio', tipo: 'decimal', placeholder: '0,00', requerido: true },
  ],
  transferencia: [
    { key: 'banco', label: 'Banco', placeholder: 'Banco', requerido: true },
    { key: 'titular', label: 'Nombre del titular', placeholder: 'Nombre', requerido: true },
    { key: 'fecha', label: 'Fecha de transferencia', tipo: 'date', requerido: true },
    {
      key: 'nroOperacion',
      label: 'Nº de operación / ref.',
      placeholder: 'Número',
      requerido: true,
    },
  ],
  tarjeta_debito: [
    { key: 'tarjeta', label: 'Tarjeta', placeholder: 'Visa, Mastercard…', requerido: true },
    { key: 'banco', label: 'Banco', placeholder: 'Banco', requerido: false },
    { key: 'ultimos4', label: 'Últimos 4 dígitos', placeholder: '1234', requerido: true },
    { key: 'nroTransaccion', label: 'Nº de transacción', placeholder: 'Número', requerido: true },
  ],
  tarjeta_credito: [
    { key: 'tarjeta', label: 'Tarjeta', placeholder: 'Visa, Mastercard…', requerido: true },
    { key: 'banco', label: 'Banco', placeholder: 'Banco', requerido: false },
    { key: 'ultimos4', label: 'Últimos 4 dígitos', placeholder: '1234', requerido: true },
    { key: 'cuotas', label: 'Cuotas', tipo: 'select', requerido: true, opciones: CUOTAS },
    { key: 'nroTransaccion', label: 'Nº de transacción', placeholder: 'Número', requerido: true },
  ],
  mercado_pago: [
    {
      key: 'pagador',
      label: 'Nombre / Email de la cuenta',
      placeholder: 'Nombre o email',
      requerido: true,
    },
    { key: 'nroOperacion', label: 'Nº de operación', placeholder: 'Número', requerido: true },
  ],
  cheque: [
    { key: 'numeroCheque', label: 'Número de cheque', placeholder: 'Número', requerido: true },
    { key: 'banco', label: 'Banco emisor', placeholder: 'Banco', requerido: true },
    { key: 'titular', label: 'Nombre del titular', placeholder: 'Nombre', requerido: true },
    {
      key: 'tipoCheque',
      label: 'Tipo de cheque',
      tipo: 'select',
      requerido: true,
      opciones: [
        { value: 'al_dia', label: 'Al día' },
        { value: 'diferido', label: 'Diferido' },
      ],
    },
    { key: 'fechaCobro', label: 'Fecha de cobro', tipo: 'date', requerido: false },
  ],
  debito_automatico: [
    { key: 'banco', label: 'Banco / Entidad', placeholder: 'Banco', requerido: true },
    { key: 'cbuAlias', label: 'CBU / Alias', placeholder: 'CBU / Alias', requerido: true },
  ],
  otro: [
    {
      key: 'descripcion',
      label: 'Descripción del medio',
      placeholder: 'Con qué se pagó o cobró',
      requerido: true,
    },
  ],
};

export function numeroDecimal(v: string | undefined): number {
  if (!v) return NaN;
  return Number(v.replace(/\./g, '').replace(',', '.'));
}

/**
 * Deja solo las claves que el instrumento conoce, recortadas y sin vacíos.
 * Lo que no está en el catálogo se descarta (no se guarda basura del form).
 */
export function limpiarDatosInstrumento(
  instrumento: Instrumento,
  datos: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const campo of CAMPOS_INSTRUMENTO[instrumento]) {
    const v = datos[campo.key];
    const txt = typeof v === 'string' ? v.trim().slice(0, 120) : '';
    if (txt) out[campo.key] = txt;
  }
  return out;
}

/** Mensaje de error del primer problema, o null si está todo bien. */
export function validarDatosInstrumento(
  instrumento: Instrumento,
  datos: Record<string, string>,
): string | null {
  for (const campo of CAMPOS_INSTRUMENTO[instrumento]) {
    const v = datos[campo.key] ?? '';
    if (campo.requerido && !v) return `Completá "${campo.label}".`;
    if (!v) continue;
    if (campo.tipo === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return `"${campo.label}" tiene que ser una fecha válida.`;
    }
    if (campo.tipo === 'decimal' && !(numeroDecimal(v) > 0)) {
      return `"${campo.label}" tiene que ser mayor a cero.`;
    }
    if (campo.tipo === 'select' && !campo.opciones?.some((o) => o.value === v)) {
      return `Elegí una opción válida en "${campo.label}".`;
    }
    if (campo.key === 'ultimos4' && !/^\d{4}$/.test(v)) {
      return 'Los últimos 4 dígitos de la tarjeta tienen que ser 4 números.';
    }
  }
  return null;
}

/** "Banco Galicia · Op. 1234 · 06/10/2026": una línea para la tabla y el Excel. */
export function resumenDatosInstrumento(
  instrumento: Instrumento,
  datos: Record<string, string> | null | undefined,
): string {
  if (!datos) return '';
  const partes: string[] = [];
  for (const campo of CAMPOS_INSTRUMENTO[instrumento]) {
    const v = datos[campo.key];
    if (!v) continue;
    if (campo.tipo === 'select') {
      partes.push(campo.opciones?.find((o) => o.value === v)?.label ?? v);
    } else if (campo.tipo === 'date') {
      const [y, m, d] = v.split('-');
      partes.push(`${campo.label} ${d}/${m}/${y}`);
    } else if (campo.key === 'ultimos4') {
      partes.push(`••${v}`);
    } else if (campo.key === 'usd') {
      partes.push(`USD ${v}`);
    } else if (campo.key === 'tc') {
      partes.push(`TC ${v}`);
    } else if (campo.key === 'nroOperacion' || campo.key === 'nroTransaccion') {
      partes.push(`Op. ${v}`);
    } else if (campo.key === 'numeroCheque') {
      partes.push(`Cheque ${v}`);
    } else {
      partes.push(v);
    }
  }
  return partes.join(' · ');
}
