import { and, eq, lt } from 'drizzle-orm';

import { db } from '@/lib/db';
import { tareas } from '@/lib/db/schema';

const MS_24H = 24 * 60 * 60 * 1000;

/**
 * Borra las tareas en estado `guardada` cuya última actualización tenga más de
 * 24 hs. `guardada` es el estado terminal del flujo operativo: pasadas 24 hs ya
 * no aportan nada y se eliminan para que no se acumulen.
 *
 * Solo toca `guardada` (las de `lavado` u otros estados no se tocan). Idempotente.
 * Devuelve la cantidad de tareas borradas.
 */
export async function limpiarTareasGuardadas(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MS_24H);

  const borradas = await db
    .delete(tareas)
    .where(and(eq(tareas.estado, 'guardada'), lt(tareas.updatedAt, cutoff)))
    .returning({ id: tareas.id });

  return borradas.length;
}
