/**
 * Fechas de mantenimiento preventivo e insumos. Funciones puras, sin acceso a la base.
 * Trabajan con fechas 'YYYY-MM-DD' (calendario argentino, sin hora).
 */

import { addDiasYmd } from '@/lib/dates';

/** Suma meses a una fecha 'YYYY-MM-DD'. Si el día no existe en el mes destino, queda el último día. */
export function addMesesYmd(ymd: string, meses: number): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7)) - 1;
  const d = Number(ymd.slice(8, 10));
  const idx = y * 12 + m + meses;
  const anio = Math.floor(idx / 12);
  const mes = idx % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/**
 * Fecha del próximo mantenimiento a partir de la última vez que se hizo. Las frecuencias en
 * horas de uso no se pueden pasar a una fecha (no se lleva el horómetro): devuelven null y la
 * fecha se agenda a mano.
 */
export function proximaFecha(
  desde: string,
  tipo: string | null,
  valor: number | null,
): string | null {
  if (!valor || valor < 1) return null;
  if (tipo === 'dias') return addDiasYmd(desde, valor);
  if (tipo === 'meses') return addMesesYmd(desde, valor);
  return null;
}

/** Días que faltan para una fecha (negativo = ya pasó). */
export function diasHasta(fecha: string, hoy: string): number {
  const a = Date.UTC(
    Number(hoy.slice(0, 4)),
    Number(hoy.slice(5, 7)) - 1,
    Number(hoy.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(fecha.slice(0, 4)),
    Number(fecha.slice(5, 7)) - 1,
    Number(fecha.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

export type EstadoPlazo = 'vencido' | 'proximo' | 'ok' | 'sin_fecha';

/** Semáforo de un mantenimiento: vencido, próximo (hasta 7 días) o en fecha. */
export function estadoPlazo(fecha: string | null, hoy: string): EstadoPlazo {
  if (!fecha) return 'sin_fecha';
  const d = diasHasta(fecha, hoy);
  if (d < 0) return 'vencido';
  if (d <= 7) return 'proximo';
  return 'ok';
}
