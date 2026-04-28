// Helpers de formato de fecha/hora en zona horaria Argentina.
//
// Postgres guarda los timestamps con TZ en UTC; al renderizarlos a la UI
// hay que convertirlos a `America/Argentina/Buenos_Aires`. Argentina está
// fija en UTC-3 (no observa DST), así que el offset es estable.
//
// Regla del proyecto (CLAUDE.md regla 5): cualquier render de fecha/hora
// al usuario tiene que pasar por estos helpers. Si necesitás formato custom
// (ej. nombre del mes en español), pasá el `Intl.DateTimeFormatOptions` que
// quieras y agregá el helper acá.

const TZ_AR = 'America/Argentina/Buenos_Aires';
const LOCALE = 'es-AR';

const PLACEHOLDER = '—';

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

// "DD/MM/YYYY" en hora Argentina.
export function formatArgentinaDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return PLACEHOLDER;
  return d.toLocaleDateString(LOCALE, {
    timeZone: TZ_AR,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// "HH:MM" en hora Argentina (24h).
export function formatArgentinaTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return PLACEHOLDER;
  return d.toLocaleTimeString(LOCALE, {
    timeZone: TZ_AR,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// "DD/MM/YYYY HH:MM" en hora Argentina (24h).
export function formatArgentinaDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return PLACEHOLDER;
  return d.toLocaleString(LOCALE, {
    timeZone: TZ_AR,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// Fecha legible, ej "miércoles 28 de abril de 2026". Útil para headers.
export function formatArgentinaDateLong(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return PLACEHOLDER;
  return d.toLocaleDateString(LOCALE, {
    timeZone: TZ_AR,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
