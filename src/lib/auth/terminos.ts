import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { terminosAceptaciones, terminosVersiones } from '@/lib/db/schema';

export type VersionTerminos = {
  id: string;
  version: number;
  contenido: string;
  publicadoEn: Date;
};

/**
 * Devuelve la versión vigente de los T&C (la de mayor `version`). Si todavía
 * no hay ninguna publicada, devuelve null — caso de borde improbable, la
 * migración 0042 inserta la versión 1 al correr.
 */
export async function getVersionVigente(): Promise<VersionTerminos | null> {
  const [row] = await db
    .select({
      id: terminosVersiones.id,
      version: terminosVersiones.version,
      contenido: terminosVersiones.contenido,
      publicadoEn: terminosVersiones.publicadoEn,
    })
    .from(terminosVersiones)
    .orderBy(desc(terminosVersiones.version))
    .limit(1);
  return row ?? null;
}

/**
 * Última versión que un usuario aceptó. null si nunca aceptó nada.
 */
export async function getUltimaVersionAceptada(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ version: terminosAceptaciones.version })
    .from(terminosAceptaciones)
    .where(eq(terminosAceptaciones.userId, userId))
    .orderBy(desc(terminosAceptaciones.version))
    .limit(1);
  return row?.version ?? null;
}

/**
 * True si el user ya aceptó la versión vigente (o si no hay versiones
 * publicadas — fallback seguro para no bloquear). Pensado para usar en
 * middleware/page guards.
 */
export async function yaAceptoVersionVigente(userId: string): Promise<boolean> {
  const vigente = await getVersionVigente();
  if (!vigente) return true; // no hay nada que aceptar
  const [row] = await db
    .select({ id: terminosAceptaciones.id })
    .from(terminosAceptaciones)
    .where(
      and(
        eq(terminosAceptaciones.userId, userId),
        eq(terminosAceptaciones.version, vigente.version),
      ),
    )
    .limit(1);
  return Boolean(row);
}
