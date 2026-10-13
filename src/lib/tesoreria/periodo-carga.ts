/**
 * Hasta qué fecha hacia atrás se puede cargar un movimiento manual de
 * Tesorería. Pedido del cliente (2026-10-13): "debe existir un parámetro de
 * tiempo para no ingresar movimientos con fecha anterior; el límite lo
 * configura la compañía. Tampoco se deben permitir fechas posteriores a hoy".
 *
 * Es el mismo criterio que el período de anulación de recibos
 * (lib/periodo-anulacion.ts), con una opción más, "solo hoy", que es lo que
 * usa un libro de caja estricto. El club lo elige en Mi perfil → Datos
 * Impositivos. El tope hacia adelante no se configura: nunca se carga con
 * fecha futura.
 *
 * Se trabaja con días calendario argentinos como 'YYYY-MM-DD' (la fecha del
 * movimiento es un `date`, sin hora). Módulo plano, sin 'use server'.
 */

export const PERIODOS_CARGA = [
  'solo_hoy',
  'misma_semana',
  'mismo_mes',
  'mes_anterior',
  'sin_limite',
] as const;
export type PeriodoCarga = (typeof PERIODOS_CARGA)[number];

export const PERIODO_CARGA_DEFAULT: PeriodoCarga = 'sin_limite';

export const PERIODO_CARGA_OPCIONES: Array<{
  value: PeriodoCarga;
  label: string;
  detalle: string;
}> = [
  {
    value: 'solo_hoy',
    label: 'Solo hoy',
    detalle: 'Los movimientos se cargan con la fecha del día.',
  },
  {
    value: 'misma_semana',
    label: 'Misma semana',
    detalle: 'Hasta el lunes de la semana en curso.',
  },
  { value: 'mismo_mes', label: 'Mismo mes', detalle: 'Hasta el 1° del mes en curso.' },
  {
    value: 'mes_anterior',
    label: 'Mes anterior',
    detalle: 'Hasta el 1° del mes anterior. En agosto se puede cargar julio, pero no junio.',
  },
  {
    value: 'sin_limite',
    label: 'Sin restricciones',
    detalle: 'Cualquier fecha pasada. Nunca una fecha futura.',
  },
];

export function esPeriodoCarga(v: unknown): v is PeriodoCarga {
  return typeof v === 'string' && (PERIODOS_CARGA as readonly string[]).includes(v);
}

export function labelPeriodoCarga(periodo: PeriodoCarga): string {
  return PERIODO_CARGA_OPCIONES.find((o) => o.value === periodo)?.label ?? periodo;
}

function aYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Se opera al mediodía UTC para que sumar/restar días no cruce el día. */
function desdeYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/**
 * Primera fecha admitida ('YYYY-MM-DD') para el período, dado el día de hoy
 * en Argentina. `null` = sin piso.
 */
export function fechaMinimaCarga(periodo: PeriodoCarga, hoy: string): string | null {
  if (periodo === 'sin_limite') return null;
  if (periodo === 'solo_hoy') return hoy;
  const base = desdeYmd(hoy);
  if (periodo === 'misma_semana') {
    // getUTCDay: 0 = domingo. Semana de lunes a domingo.
    const dow = base.getUTCDay();
    base.setUTCDate(base.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    return aYmd(base);
  }
  base.setUTCDate(1);
  if (periodo === 'mes_anterior') base.setUTCMonth(base.getUTCMonth() - 1);
  return aYmd(base);
}

/** Mensaje de error si la fecha no se puede usar, o null si está bien. */
export function validarFechaCarga(
  fecha: string,
  periodo: PeriodoCarga,
  hoy: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Fecha inválida.';
  if (fecha > hoy) return 'No se pueden cargar movimientos con fecha posterior a hoy.';
  const minimo = fechaMinimaCarga(periodo, hoy);
  if (minimo && fecha < minimo) {
    const [y, m, d] = minimo.split('-');
    return `El club solo permite cargar movimientos desde el ${d}/${m}/${y} (${labelPeriodoCarga(periodo)}). Cambiá el período en Mi perfil → Datos Impositivos si hace falta.`;
  }
  return null;
}
