/**
 * Cálculo de la apertura de importes de un comprobante. Lo usan el formulario (para mostrar
 * el total en vivo) y el servidor (para recalcularlo y validar: nunca se confía en el total
 * que manda el navegador). Módulo plano, sin acceso a la base.
 */

import type { LineaIvaCp, PercepcionIibbCp } from '@/lib/db/schema';

import { ALICUOTAS_IVA, esTipoC, redondear } from './constantes';

export type ImportesCp = {
  lineasIva: LineaIvaCp[];
  netoNoGravado: number;
  exento: number;
  otrosTributos: number;
  percepcionesIibb: PercepcionIibbCp[];
  monotributo: number;
};

export type TotalesCp = {
  netoGravado: number;
  iva: number;
  netoNoGravado: number;
  exento: number;
  otrosTributos: number;
  percepcionesIibbTotal: number;
  monotributo: number;
  /** Neto = gravado + no gravado + exento (la "base" sin impuestos). */
  neto: number;
  total: number;
};

/** IVA que corresponde a una línea (neto × alícuota), redondeado a centavos. */
export const ivaDeLinea = (neto: number, alicuota: number): number =>
  redondear((neto * alicuota) / 100);

/**
 * Suma de la apertura. Un comprobante C (factura, nota de débito o de crédito C) solo lleva
 * el monto de monotributo: los demás importes se ignoran. Al revés, en el resto de los tipos
 * el monotributo no aplica y se ignora.
 */
export function calcularTotales(tipoComprobante: string, i: ImportesCp): TotalesCp {
  if (esTipoC(tipoComprobante)) {
    const monotributo = redondear(i.monotributo);
    return {
      netoGravado: 0,
      iva: 0,
      netoNoGravado: 0,
      exento: 0,
      otrosTributos: 0,
      percepcionesIibbTotal: 0,
      monotributo,
      neto: 0,
      total: monotributo,
    };
  }
  const netoGravado = redondear(i.lineasIva.reduce((s, l) => s + l.neto, 0));
  const iva = redondear(i.lineasIva.reduce((s, l) => s + l.iva, 0));
  const percepcionesIibbTotal = redondear(i.percepcionesIibb.reduce((s, p) => s + p.monto, 0));
  const netoNoGravado = redondear(i.netoNoGravado);
  const exento = redondear(i.exento);
  const otrosTributos = redondear(i.otrosTributos);
  return {
    netoGravado,
    iva,
    netoNoGravado,
    exento,
    otrosTributos,
    percepcionesIibbTotal,
    monotributo: 0,
    neto: redondear(netoGravado + netoNoGravado + exento),
    total: redondear(
      netoGravado + iva + netoNoGravado + exento + otrosTributos + percepcionesIibbTotal,
    ),
  };
}

/** Primer problema de la apertura (mensaje listo para mostrar) o null si está bien. */
export function validarImportes(tipoComprobante: string, i: ImportesCp): string | null {
  const valores = [
    i.netoNoGravado,
    i.exento,
    i.otrosTributos,
    i.monotributo,
    ...i.lineasIva.flatMap((l) => [l.neto, l.iva]),
    ...i.percepcionesIibb.map((p) => p.monto),
  ];
  if (valores.some((v) => !Number.isFinite(v) || v < 0)) {
    return 'Los importes no pueden ser negativos (las notas de crédito se cargan en positivo).';
  }
  if (esTipoC(tipoComprobante)) {
    if (!(i.monotributo > 0)) return 'Completá el monto de monotributo.';
    return null;
  }
  for (const l of i.lineasIva) {
    if (!ALICUOTAS_IVA.includes(l.alicuota)) return 'Elegí una alícuota de IVA válida.';
    // El IVA puede diferir unos centavos del cálculo (redondeo del emisor); más de $1 es un error.
    if (Math.abs(l.iva - ivaDeLinea(l.neto, l.alicuota)) > 1) {
      return `El IVA de una línea no corresponde a la alícuota del ${l.alicuota}% sobre el neto gravado.`;
    }
  }
  for (const p of i.percepcionesIibb) {
    if (!p.jurisdiccion.trim())
      return 'Elegí la jurisdicción de cada percepción de Ingresos Brutos.';
  }
  const t = calcularTotales(tipoComprobante, i);
  if (!(t.total > 0)) return 'El importe total tiene que ser mayor a cero.';
  return null;
}

/**
 * Lee un importe escrito por una persona: "1.234,50", "1234,5" o "1234.50". Con coma, los
 * puntos son miles; sin coma, un único punto seguido de 1 o 2 dígitos es el decimal. Vacío o
 * ilegible = 0 (el formulario lo valida aparte donde el importe es obligatorio).
 */
export function parseImporte(texto: string): number {
  const t = texto.trim().replace(/\s/g, '');
  if (!t) return 0;
  let limpio: string;
  if (t.includes(',')) limpio = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+\.\d{1,2}$/.test(t)) limpio = t;
  else limpio = t.replace(/\./g, '');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}
