// Turnos de envío para las notificaciones programadas.
//
// Módulo plano a propósito: estos valores los usan el formulario ('use client')
// y el server action ('use server'), y ninguno de esos dos archivos puede
// exportar constantes que cruce el otro (un 'use server' solo exporta async
// functions; un valor exportado desde 'use client' llega al server como
// module-reference y explota en runtime). Ver CLAUDE.md.

export const TURNOS = ['manana', 'tarde', 'noche'] as const;
export type Turno = (typeof TURNOS)[number];

// Hora Argentina en la que sale cada turno. Tienen que coincidir con las
// corridas del cron en vercel.json (11/17/23 UTC = 08/14/20 ART).
export const TURNO_HORA_AR: Record<Turno, number> = {
  manana: 8,
  tarde: 14,
  noche: 20,
};

export const TURNO_LABELS: Record<Turno, string> = {
  manana: 'Mañana (8:00)',
  tarde: 'Tarde (14:00)',
  noche: 'Noche (20:00)',
};

/**
 * Convierte un día elegido por el usuario ('YYYY-MM-DD') + turno al instante
 * real de envío. Argentina es UTC-3 fijo (no tiene horario de verano), así que
 * el offset se puede escribir literal y no hace falta una librería de TZ.
 */
export function momentoDelTurno(ymd: string, turno: Turno): Date {
  const hora = String(TURNO_HORA_AR[turno]).padStart(2, '0');
  return new Date(`${ymd}T${hora}:00:00.000-03:00`);
}
