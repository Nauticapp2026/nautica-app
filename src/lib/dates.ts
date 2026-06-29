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

// Convierte una fecha-calendario 'YYYY-MM-DD' (el día tal cual lo eligió el
// usuario) a un Date que, al renderizarse en hora Argentina (UTC-3), cae SIEMPRE
// en ese mismo día. Se ancla al mediodía UTC para que el offset nunca cruce el
// límite del día. Usar esto en vez de `new Date('YYYY-MM-DD')` (que es medianoche
// UTC y en ART retrocede un día) al guardar fechas elegidas por el usuario.
export function fechaCalendariaArg(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

// "YYYY-MM-DD" del día de hoy en hora Argentina. Útil para comparar contra
// fechas-calendario elegidas por el usuario (ej. ¿la vigencia es futura?).
export function todayArg(now: Date = new Date()): string {
  // en-CA produce el formato ISO YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_AR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// "YYYY-MM-DD" en hora Argentina de un timestamp dado (null si no hay valor).
export function argYmd(value: string | Date | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_AR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// Suma `dias` a una fecha-calendario "YYYY-MM-DD" y devuelve otra "YYYY-MM-DD".
// Se ancla al mediodía UTC para que el corrimiento de días nunca cruce el
// límite por el offset.
export function addDiasYmd(ymd: string, dias: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

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

// Igual que formatArgentinaDateTime pero sin aplicar conversión de TZ.
// Usar cuando el timestamp fue guardado como naive (hora AR interpretada como
// UTC por Postgres), para no restar 3 h extra al mostrar.
export function formatNaiveDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return PLACEHOLDER;
  return d.toLocaleString(LOCALE, {
    timeZone: 'UTC',
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
