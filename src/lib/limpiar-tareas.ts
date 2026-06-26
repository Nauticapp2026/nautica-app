import { and, eq, lt } from 'drizzle-orm';

import { db } from '@/lib/db';
import { tareas } from '@/lib/db/schema';

/**
 * Inicio del día en curso en hora Argentina (UTC-3, sin DST), como Date en UTC.
 * La medianoche de Argentina equivale a las 03:00 UTC del mismo día.
 */
function inicioDeHoyArg(now: Date): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(now); // "YYYY-MM-DD" del día AR
  return new Date(`${ymd}T03:00:00.000Z`);
}

/**
 * Borra las tareas en estado `guardada` de días anteriores al día en curso
 * (hora Argentina). `guardada` es el estado terminal: a las 00:00 ya no aportan
 * y se eliminan para que no se acumulen. La UI las oculta a la medianoche; este
 * cron las borra físicamente a la mañana siguiente.
 *
 * Solo toca `guardada` (las de `lavado` u otros estados no se tocan). Idempotente.
 * Devuelve la cantidad de tareas borradas.
 */
export async function limpiarTareasGuardadas(now: Date = new Date()): Promise<number> {
  const cutoff = inicioDeHoyArg(now);

  const borradas = await db
    .delete(tareas)
    .where(and(eq(tareas.estado, 'guardada'), lt(tareas.updatedAt, cutoff)))
    .returning({ id: tareas.id });

  return borradas.length;
}
