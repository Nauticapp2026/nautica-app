/**
 * Constantes de Cuentas a pagar y del Circuito de pagos: tipos de comprobante, estados,
 * alícuotas y formatos de los números. Módulo plano (sin 'use server' ni acceso a la base):
 * lo usan el navegador y el servidor.
 */

import type { Opcion } from '@/lib/catalogos-club';

// ─── Tipos de comprobante ───────────────────────────────────────────────────

export type TipoComprobanteCp = {
  /** Código oficial de ARCA (los no legales usan X1 / T1; el anticipo, 'ANT'). */
  value: string;
  label: string;
  /** Letra del comprobante: A, B, C, M, E o X (no legal). */
  letra: string;
  /** +1 suma (factura, nota de débito); −1 resta (nota de crédito, anticipo). */
  signo: 1 | -1;
  legal: boolean;
};

export const TIPOS_COMPROBANTE: TipoComprobanteCp[] = [
  { value: '001', label: 'Factura A', letra: 'A', signo: 1, legal: true },
  { value: '002', label: 'Nota de Débito A', letra: 'A', signo: 1, legal: true },
  { value: '003', label: 'Nota de Crédito A', letra: 'A', signo: -1, legal: true },
  { value: '006', label: 'Factura B', letra: 'B', signo: 1, legal: true },
  { value: '007', label: 'Nota de Débito B', letra: 'B', signo: 1, legal: true },
  { value: '008', label: 'Nota de Crédito B', letra: 'B', signo: -1, legal: true },
  { value: '011', label: 'Factura C', letra: 'C', signo: 1, legal: true },
  { value: '012', label: 'Nota de Débito C', letra: 'C', signo: 1, legal: true },
  { value: '013', label: 'Nota de Crédito C', letra: 'C', signo: -1, legal: true },
  { value: '051', label: 'Factura M', letra: 'M', signo: 1, legal: true },
  { value: '052', label: 'Nota de Débito M', letra: 'M', signo: 1, legal: true },
  { value: '053', label: 'Nota de Crédito M', letra: 'M', signo: -1, legal: true },
  { value: '019', label: 'Factura E (exportación)', letra: 'E', signo: 1, legal: true },
  { value: '020', label: 'Nota de Débito E', letra: 'E', signo: 1, legal: true },
  { value: '021', label: 'Nota de Crédito E', letra: 'E', signo: -1, legal: true },
  // No legales: no tienen código de ARCA, solo hay movimientos positivos (suman, como una factura)
  // y negativos (restan, como una nota de crédito).
  { value: 'X1', label: 'Movimiento positivo (no legal)', letra: 'X', signo: 1, legal: false },
  { value: 'T1', label: 'Movimiento negativo (no legal)', letra: 'T', signo: -1, legal: false },
];

/** Lo que genera el Circuito de pagos al pagar un anticipo: no se elige a mano. */
export const TIPO_ANTICIPO: TipoComprobanteCp = {
  value: 'ANT',
  label: 'Anticipo a proveedor',
  letra: 'X',
  signo: -1,
  legal: false,
};

export function tipoComprobante(value: string | null | undefined): TipoComprobanteCp | null {
  if (value === TIPO_ANTICIPO.value) return TIPO_ANTICIPO;
  return TIPOS_COMPROBANTE.find((t) => t.value === value) ?? null;
}

/** Texto para mostrar: "001 · Factura A". */
export function labelTipoComprobante(value: string | null | undefined): string {
  const t = tipoComprobante(value);
  if (!t) return value ?? '—';
  return t.value === TIPO_ANTICIPO.value ? t.label : `${t.value} · ${t.label}`;
}

/** Opciones del desplegable de carga: "Factura A – 001". */
export const OPCIONES_TIPO_COMPROBANTE: Opcion[] = TIPOS_COMPROBANTE.map((t) => ({
  value: t.value,
  label: `${t.label} – ${t.value}`,
}));

/** +1 o −1 según el tipo (un tipo desconocido se toma como positivo). */
export const signoDe = (tipo: string | null | undefined): 1 | -1 =>
  tipoComprobante(tipo)?.signo ?? 1;

/** Factura, nota de crédito o nota de débito C: solo ellas llevan monotributo. */
export const esTipoC = (tipo: string | null | undefined): boolean =>
  tipoComprobante(tipo)?.letra === 'C';

// ─── Estados ────────────────────────────────────────────────────────────────

export type EstadoCp = 'H' | 'A' | 'P' | 'X';

export const ESTADOS_CP: { value: EstadoCp; label: string; detalle: string; clase: string }[] = [
  {
    value: 'H',
    label: 'H · Ingresado',
    detalle: 'Cargado, todavía no autorizado para pagar',
    clase: 'bg-gray-100 text-gray-700',
  },
  {
    value: 'A',
    label: 'A · Autorizado',
    detalle: 'Listo para ser pagado',
    clase: 'bg-teal-50 text-[#175861]',
  },
  {
    value: 'P',
    label: 'P · Pagado',
    detalle: 'Cancelado por completo',
    clase: 'bg-green-50 text-green-700',
  },
  {
    value: 'X',
    label: 'X · Anulado',
    detalle: 'Anulado',
    clase: 'bg-red-50 text-red-700',
  },
];

export const labelEstadoCp = (e: string): string =>
  ESTADOS_CP.find((x) => x.value === e)?.label ?? e;

export const claseEstadoCp = (e: string): string =>
  ESTADOS_CP.find((x) => x.value === e)?.clase ?? 'bg-gray-100 text-gray-700';

// ─── Monedas, alícuotas, formatos ───────────────────────────────────────────

export const MONEDAS_CP: Opcion[] = [
  { value: 'PES', label: 'PES · Pesos' },
  { value: 'DOL', label: 'DOL · Dólares' },
];

export const labelMonedaCp = (m: string): string => (m === 'DOL' ? 'USD' : '$');

export const ALICUOTAS_IVA: number[] = [0, 2.5, 5, 10.5, 21, 27];

/** Código visible del comprobante (Next Number): CP-000123. */
export const codigoCp = (n: number): string => `CP-${String(n).padStart(6, '0')}`;
/** Código visible de la orden de pago (Next Number): OP-000123. */
export const codigoOp = (n: number): string => `OP-${String(n).padStart(6, '0')}`;

/** Punto de venta (5 dígitos) y número (8 dígitos) con ceros a la izquierda. */
export const formatoPuntoVenta = (v: string): string => v.replace(/\D/g, '').padStart(5, '0');
export const formatoNumeroComprobante = (v: string): string =>
  v.replace(/\D/g, '').padStart(8, '0');

/** "00005-00001234", o '—' si no tiene (anticipos). */
export function numeroCompleto(pv: string | null, nro: string | null): string {
  if (!pv && !nro) return '—';
  return `${pv ?? ''}-${nro ?? ''}`;
}

/** Fecha de vencimiento a partir de la emisión y la condición de pago ("30 días", "Contado"). */
export function vencimientoSegunCondicion(
  emisionYmd: string,
  condicionPago: string | null | undefined,
): string | null {
  if (!emisionYmd || !condicionPago) return null;
  const c = condicionPago.toLowerCase();
  let dias: number | null = null;
  if (c.includes('contado')) dias = 0;
  else {
    const m = c.match(/(\d{1,3})\s*d[ií]as?/);
    if (m) dias = Number(m[1]);
  }
  if (dias === null) return null;
  const d = new Date(`${emisionYmd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Importe con separador de miles y coma: "1.234,50". */
export function formatoImporte(n: number): string {
  // Un cero con signo (-0, de multiplicar por -1) no se muestra como "-0,00".
  if (Math.abs(n) < 0.005) n = 0;
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "$ 1.234,50" / "USD 1.234,50" (con el signo delante si es negativo). */
export function formatoMoneda(n: number, moneda: string): string {
  const base = `${labelMonedaCp(moneda)} ${formatoImporte(Math.abs(n))}`;
  return n < 0 ? `-${base}` : base;
}

/** Redondeo a centavos (evita 0,1 + 0,2 = 0,30000000000000004). */
export const redondear = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
