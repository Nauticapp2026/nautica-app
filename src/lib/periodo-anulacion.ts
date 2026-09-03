/**
 * Hasta cuándo se puede anular un recibo de cobranza.
 *
 * Pedido del cliente (2026-09-02): "para que el club no genere anulaciones de
 * recibos de manera indiscriminada, por lo general las empresas ponen un límite
 * de tiempo". El club elige la ventana en Configuración.
 *
 * Módulo plano: lo usan el selector ('use client'), el server action que anula
 * ('use server') y la tabla de Cobranzas para deshabilitar el botón.
 *
 * Todo se compara en **día calendario argentino**, no en UTC: un recibo emitido
 * el 1° a las 00:30 de Argentina es del día 1 acá y del 31 en UTC. Mezclarlo
 * correría el límite un día en los bordes de mes.
 */

const TZ_AR = 'America/Argentina/Buenos_Aires';

export const PERIODOS_ANULACION = [
  'misma_semana',
  'mismo_mes',
  'mes_anterior',
  'sin_limite',
] as const;
export type PeriodoAnulacion = (typeof PERIODOS_ANULACION)[number];

export const PERIODO_ANULACION_DEFAULT: PeriodoAnulacion = 'sin_limite';

export const PERIODO_ANULACION_OPCIONES: Array<{
  value: PeriodoAnulacion;
  label: string;
  detalle: string;
}> = [
  {
    value: 'misma_semana',
    label: 'Misma semana',
    detalle: 'Solo recibos de la semana en curso (de lunes a domingo).',
  },
  {
    value: 'mismo_mes',
    label: 'Mismo mes',
    detalle: 'Solo recibos del mes en curso. Al cambiar de mes, los del mes anterior se cierran.',
  },
  {
    value: 'mes_anterior',
    label: 'Mes anterior',
    detalle:
      'Recibos del mes en curso y del anterior. Ejemplo: en agosto se puede anular julio, pero no junio.',
  },
  {
    value: 'sin_limite',
    label: 'Sin restricciones',
    detalle: 'Se puede anular cualquier recibo, sin importar la fecha.',
  },
];

export function esPeriodoAnulacion(v: unknown): v is PeriodoAnulacion {
  return typeof v === 'string' && (PERIODOS_ANULACION as readonly string[]).includes(v);
}

/** Partes del día calendario argentino de una fecha. */
function partesArg(fecha: Date): { anio: number; mes: number; dia: number } {
  // en-CA da YYYY-MM-DD.
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_AR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
  const [anio, mes, dia] = ymd.split('-').map(Number);
  return { anio, mes, dia };
}

/**
 * Lunes de la semana de `fecha`, como 'YYYY-MM-DD' del calendario argentino.
 * La semana arranca el lunes, que es la convención acá.
 */
function lunesDeLaSemanaArg(fecha: Date): string {
  const { anio, mes, dia } = partesArg(fecha);
  // Se opera al mediodía UTC para que sumar/restar días no cruce el límite del
  // día por el offset (mismo criterio que fechaCalendariaArg en lib/dates).
  const base = new Date(Date.UTC(anio, mes - 1, dia, 12));
  // getUTCDay: 0 = domingo. Con lunes como inicio, el domingo retrocede 6.
  const dow = base.getUTCDay();
  const retroceso = dow === 0 ? 6 : dow - 1;
  base.setUTCDate(base.getUTCDate() - retroceso);
  return base.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' del día calendario argentino. */
function ymdArg(fecha: Date): string {
  const { anio, mes, dia } = partesArg(fecha);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * ¿Se puede anular un recibo emitido en `emision`, con el período `periodo`?
 *
 * `ahora` es inyectable para poder testear los bordes (fin de mes, fin de año)
 * sin depender del reloj.
 */
export function puedeAnularRecibo(
  emision: Date | string | null | undefined,
  periodo: PeriodoAnulacion,
  ahora: Date = new Date(),
): boolean {
  if (periodo === 'sin_limite') return true;
  // Sin fecha de emisión no hay con qué comparar: se permite, para no trabar un
  // recibo por un dato faltante.
  if (!emision) return true;

  const fecha = typeof emision === 'string' ? new Date(emision) : emision;
  if (Number.isNaN(fecha.getTime())) return true;

  if (periodo === 'misma_semana') {
    return lunesDeLaSemanaArg(fecha) === lunesDeLaSemanaArg(ahora);
  }

  const rec = partesArg(fecha);
  const hoy = partesArg(ahora);
  const mesesRec = rec.anio * 12 + (rec.mes - 1);
  const mesesHoy = hoy.anio * 12 + (hoy.mes - 1);

  // Un recibo con fecha futura (carga adelantada) nunca queda fuera de la
  // ventana por "viejo".
  if (mesesRec >= mesesHoy) return true;
  if (periodo === 'mismo_mes') return false;
  // 'mes_anterior': el mes en curso y el inmediato anterior.
  return mesesHoy - mesesRec <= 1;
}

/** Mensaje para cuando el período bloquea la anulación. */
export function motivoBloqueoAnulacion(periodo: PeriodoAnulacion): string {
  const opcion = PERIODO_ANULACION_OPCIONES.find((o) => o.value === periodo);
  return `Este recibo quedó fuera del período de anulación que configuró el club (${opcion?.label ?? periodo}). ${opcion?.detalle ?? ''}`.trim();
}

/** Se exporta solo para los tests de borde. */
export const _internos = { lunesDeLaSemanaArg, ymdArg, partesArg };
