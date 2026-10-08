/**
 * Instrumentos de Tesorería: las "cajas" por las que entra y sale la plata del
 * club. Son los mismos valores que las formas de cobranza (TIPOS_COBRANZA en
 * cobranza-formas.tsx) más `debito_automatico` (cobros Payway, que no pasan
 * por el formulario de cobranza): así un recibo cobrado en efectivo y un retiro
 * de efectivo cargado a mano caen en la misma caja.
 *
 * Módulo plano, sin 'use server': lo importan el server action, la página y el
 * cliente.
 */

export const INSTRUMENTOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'efectivo_usd', label: 'Efectivo (dólares)' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'debito_automatico', label: 'Débito automático' },
  { value: 'otro', label: 'Otro' },
] as const;

export type Instrumento = (typeof INSTRUMENTOS)[number]['value'];

export const INSTRUMENTO_VALUES: string[] = INSTRUMENTOS.map((i) => i.value);

const LABELS: Record<string, string> = Object.fromEntries(
  INSTRUMENTOS.map((i) => [i.value, i.label]),
);

export function labelInstrumento(value: string | null | undefined): string {
  if (!value) return 'Otro';
  return LABELS[value] ?? value;
}

/** Normaliza lo que viene de un recibo (forma de pago o medio_pago) a un instrumento. */
export function instrumentoDesde(value: string | null | undefined): Instrumento {
  if (value && INSTRUMENTO_VALUES.includes(value)) return value as Instrumento;
  return 'otro';
}

export type TipoMovimientoTesoreria = 'ingreso' | 'egreso';
