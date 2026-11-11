/**
 * Listas desplegables del club (solo servidor): las sugerencias base más lo que el club fue
 * agregando. Cada módulo suma después lo que ya usan sus propios registros, para que una
 * opción vieja no desaparezca de la lista.
 */

import { eq } from 'drizzle-orm';

import {
  CATALOGO_BASE,
  TIPOS_CATALOGO,
  unirOpciones,
  type CatalogosDisponibles,
} from '@/lib/catalogos-club';
import { db } from '@/lib/db';
import { legajoCatalogo } from '@/lib/db/schema';

export async function catalogosBaseDelClub(gId: string): Promise<CatalogosDisponibles> {
  const propios = await db
    .select({ tipo: legajoCatalogo.tipo, valor: legajoCatalogo.valor })
    .from(legajoCatalogo)
    .where(eq(legajoCatalogo.guarderiaId, gId));
  const out = {} as CatalogosDisponibles;
  for (const t of TIPOS_CATALOGO) {
    out[t] = unirOpciones(
      CATALOGO_BASE[t],
      propios.filter((p) => p.tipo === t).map((p) => p.valor),
    );
  }
  return out;
}
