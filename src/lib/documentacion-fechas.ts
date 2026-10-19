/**
 * Cálculos de fecha de la documentación con vencimiento (seguro y certificado náutico).
 *
 * Módulo plano y SIN acceso a la base: lo usan tanto el servidor (dashboard y cron, en
 * `documentacion-vencimientos.ts`) como la ficha del socio en el navegador. Todo trabaja
 * con el día calendario argentino en formato 'YYYY-MM-DD'.
 */

/** Con cuántos días de anticipación se avisa un vencimiento. */
export const DIAS_AVISO_VENCIMIENTO = 7;

/** Días de calendario entre dos 'YYYY-MM-DD' (positivo = `ymd` es posterior a `desde`). */
export function diasEntre(ymd: string, desde: string): number {
  const a = Date.parse(`${ymd}T12:00:00.000Z`);
  const b = Date.parse(`${desde}T12:00:00.000Z`);
  return Math.round((a - b) / 86_400_000);
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
export function fechaLegible(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

/** ¿Es un 'YYYY-MM-DD' que existe en el calendario? (rechaza 2026-02-31, por ejemplo). */
export function esFechaYmdValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(`${valor}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

export type EstadoVencimiento = 'vencido' | 'por_vencer' | 'vigente';

/** Estado de un vencimiento respecto de hoy (`hoy` = 'YYYY-MM-DD' argentino). */
export function estadoVencimiento(ymd: string, hoy: string): EstadoVencimiento {
  const dias = diasEntre(ymd, hoy);
  if (dias < 0) return 'vencido';
  if (dias <= DIAS_AVISO_VENCIMIENTO) return 'por_vencer';
  return 'vigente';
}

/** Texto corto: "Vence hoy", "Vence mañana", "Vence en 5 días", "Venció hace 3 días". */
export function textoVencimiento(ymd: string, hoy: string): string {
  const dias = diasEntre(ymd, hoy);
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  if (dias > 1) return `Vence en ${dias} días`;
  if (dias === -1) return 'Venció ayer';
  return `Venció hace ${-dias} días`;
}
