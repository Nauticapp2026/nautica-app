/**
 * Acceso común del legajo del personal (solo servidor).
 *
 * El rol de administrador y el `guarderia_id` salen de `contextoAdmin` (lib/auth); los
 * adjuntos, de `archivos-privados`. Acá queda lo propio del legajo: ningún id de legajo que
 * venga del cliente se usa sin comprobar que pertenece al club (`empleadoDelClub`).
 */

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { empleados } from '@/lib/db/schema';

/** El legajo (completo) si pertenece al club; null si no existe o es de otro club. */
export async function empleadoDelClub(id: string, gId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [e] = await db
    .select()
    .from(empleados)
    .where(and(eq(empleados.id, id), eq(empleados.guarderiaId, gId)))
    .limit(1);
  return e ?? null;
}
