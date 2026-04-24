'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  areas,
  espacios,
  lados as ladosTable,
  marinas,
  naves,
  pisos as pisosTable,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';

export type CreateAreaInput =
  | {
      tipo: 'marina';
      nombre: string;
      cantidadPeines: number;
      cantidadAmarras: number;
    }
  | {
      tipo: 'nave';
      nombre: string;
      lados: { nombre: string; cantidadPisos: number; cantidadCamas: number }[];
    };

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
}

/**
 * Distribuye `total` entre `n` buckets de forma que todos tengan
 * Math.floor(total/n) y el último concentre el sobrante. Requiere n >= 1.
 * Ejemplo: 103 / 4 → [25, 25, 25, 28]
 */
function distribuir(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const resto = total - base * n;
  const arr = new Array(n).fill(base) as number[];
  arr[n - 1] += resto;
  return arr;
}

export async function createAreaAction(
  input: CreateAreaInput,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden crear áreas.' };

  const nombre = input.nombre.trim();
  if (!nombre) return { error: 'El nombre del área es obligatorio.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  if (input.tipo === 'marina') {
    if (!Number.isInteger(input.cantidadPeines) || input.cantidadPeines < 1) {
      return { error: 'La cantidad de peines debe ser mayor o igual a 1.' };
    }
    if (!Number.isInteger(input.cantidadAmarras) || input.cantidadAmarras < 0) {
      return { error: 'La cantidad de amarras debe ser mayor o igual a 0.' };
    }

    const [area] = await db
      .insert(areas)
      .values({ guarderiaId, nombre })
      .returning({ id: areas.id });

    const reparto = distribuir(input.cantidadAmarras, input.cantidadPeines);

    for (let i = 0; i < input.cantidadPeines; i++) {
      const [marina] = await db
        .insert(marinas)
        .values({ guarderiaId, areaId: area.id, nombre: `Peine ${i + 1}`, orden: i })
        .returning({ id: marinas.id });

      const cant = reparto[i];
      if (cant <= 0) continue;

      const rows = [];
      for (let j = 1; j <= cant; j++) {
        rows.push({
          guarderiaId,
          areaId: area.id,
          marinaId: marina.id,
          nomenclatura: String(j),
          estado: 'disponible' as const,
        });
      }
      await db.insert(espacios).values(rows);
    }

    revalidatePath('/espacios');
    return { id: area.id };
  }

  // Nave
  if (!input.lados || input.lados.length === 0) {
    return { error: 'La nave debe tener al menos un lado.' };
  }
  for (const l of input.lados) {
    if (!l.nombre.trim()) return { error: 'El nombre del lado es obligatorio.' };
    if (!Number.isInteger(l.cantidadPisos) || l.cantidadPisos < 1) {
      return { error: `La cantidad de pisos del lado "${l.nombre}" debe ser ≥ 1.` };
    }
    if (!Number.isInteger(l.cantidadCamas) || l.cantidadCamas < 0) {
      return { error: `La cantidad de camas del lado "${l.nombre}" debe ser ≥ 0.` };
    }
  }

  const [area] = await db.insert(areas).values({ guarderiaId, nombre }).returning({ id: areas.id });

  const [nave] = await db
    .insert(naves)
    .values({ guarderiaId, areaId: area.id, nombre, orden: 0 })
    .returning({ id: naves.id });

  for (const l of input.lados) {
    const [lado] = await db
      .insert(ladosTable)
      .values({
        guarderiaId,
        areaId: area.id,
        naveId: nave.id,
        nombre: l.nombre.trim(),
        cantidadPisos: l.cantidadPisos,
        espaciosTotal: l.cantidadCamas,
      })
      .returning({ id: ladosTable.id });

    const reparto = distribuir(l.cantidadCamas, l.cantidadPisos);
    let numeracion = 1;

    for (let i = 0; i < l.cantidadPisos; i++) {
      const [piso] = await db
        .insert(pisosTable)
        .values({
          areaId: area.id,
          ladoId: lado.id,
          nombre: `Piso ${i + 1}`,
          orden: i,
        })
        .returning({ id: pisosTable.id });

      const cant = reparto[i];
      if (cant <= 0) continue;

      const rows = [];
      for (let k = 0; k < cant; k++, numeracion++) {
        rows.push({
          guarderiaId,
          areaId: area.id,
          naveId: nave.id,
          ladoId: lado.id,
          pisoId: piso.id,
          nomenclatura: String(numeracion),
          estado: 'disponible' as const,
        });
      }
      await db.insert(espacios).values(rows);
    }
  }

  revalidatePath('/espacios');
  return { id: area.id };
}

export async function deleteEspacioAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar espacios.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: espacios.id })
    .from(espacios)
    .where(and(eq(espacios.id, id), eq(espacios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!current) return { error: 'Espacio no encontrado.' };

  await db.delete(espacios).where(eq(espacios.id, id));
  revalidatePath('/espacios');
  return {};
}

export async function deleteAreaAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar áreas.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [area] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, id), eq(areas.guarderiaId, guarderiaId)))
    .limit(1);
  if (!area) return { error: 'Área no encontrada.' };

  // Cascade manual: espacios → pisos → lados → naves → marinas → area.
  await db.delete(espacios).where(eq(espacios.areaId, id));

  const ladosArea = await db
    .select({ id: ladosTable.id })
    .from(ladosTable)
    .where(eq(ladosTable.areaId, id));
  const ladoIds = ladosArea.map((l) => l.id);
  if (ladoIds.length > 0) {
    await db.delete(pisosTable).where(inArray(pisosTable.ladoId, ladoIds));
    await db.delete(ladosTable).where(inArray(ladosTable.id, ladoIds));
  }

  await db.delete(naves).where(eq(naves.areaId, id));
  await db.delete(marinas).where(eq(marinas.areaId, id));
  await db.delete(areas).where(eq(areas.id, id));

  revalidatePath('/espacios');
  return {};
}
