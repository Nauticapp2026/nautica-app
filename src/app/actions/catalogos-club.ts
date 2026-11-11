'use server';

import { and, eq, sql } from 'drizzle-orm';

import { TIPOS_CATALOGO } from '@/lib/catalogos-club';
import { contextoAdmin, esError } from '@/lib/auth/contexto-admin';
import { db } from '@/lib/db';
import { legajoCatalogo } from '@/lib/db/schema';

/**
 * Agrega un valor a una lista desplegable del club (puesto, banco, marca, rubro…). Si ya
 * existe, con otras mayúsculas, devuelve el existente. Devuelve el valor tal como quedó guardado.
 */
export async function agregarCatalogoAction(
  tipo: string,
  valor: string,
): Promise<{ error?: string; valor?: string }> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };
  if (!(TIPOS_CATALOGO as string[]).includes(tipo)) return { error: 'Lista inválida.' };

  const limpio = valor.trim().replace(/\s+/g, ' ');
  if (limpio.length < 2) return { error: 'Escribí al menos 2 letras.' };
  if (limpio.length > 80) return { error: 'Puede tener hasta 80 caracteres.' };

  const [existente] = await db
    .select({ valor: legajoCatalogo.valor })
    .from(legajoCatalogo)
    .where(
      and(
        eq(legajoCatalogo.guarderiaId, c.gId),
        eq(legajoCatalogo.tipo, tipo),
        sql`lower(${legajoCatalogo.valor}) = lower(${limpio})`,
      ),
    )
    .limit(1);
  if (existente) return { valor: existente.valor };

  try {
    await db
      .insert(legajoCatalogo)
      .values({ guarderiaId: c.gId, tipo, valor: limpio, createdBy: c.userId })
      .onConflictDoNothing();
  } catch {
    return { error: 'No se pudo agregar a la lista.' };
  }
  return { valor: limpio };
}
