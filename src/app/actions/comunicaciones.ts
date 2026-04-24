'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { comunicaciones } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';

const TIPOS = ['socios', 'publica'] as const;
type Tipo = (typeof TIPOS)[number];

const CATEGORIAS = ['informacion', 'anuncio', 'evento', 'mantenimiento', 'alerta'] as const;
type Categoria = (typeof CATEGORIAS)[number];

export type ComunicacionInput = {
  titulo: string;
  texto: string;
  tipo: Tipo;
  categoria: Categoria;
  publicar: boolean;
};

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
}

function validar(input: ComunicacionInput): string | null {
  if (!input.titulo.trim()) return 'El título es obligatorio.';
  if (!TIPOS.includes(input.tipo)) return 'Tipo de comunicación inválido.';
  if (!CATEGORIAS.includes(input.categoria)) return 'Categoría inválida.';
  return null;
}

export async function createComunicacionAction(
  input: ComunicacionInput,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden crear comunicaciones.' };

  const err = validar(input);
  if (err) return { error: err };

  const [row] = await db
    .insert(comunicaciones)
    .values({
      guarderiaId: ctx.activeMembership.guarderiaId,
      autorId: ctx.profile.id,
      titulo: input.titulo.trim(),
      texto: input.texto.trim() || null,
      tipo: input.tipo,
      categoria: input.categoria,
      publicar: input.publicar,
      fecha: new Date(),
    })
    .returning({ id: comunicaciones.id });

  revalidatePath('/comunicaciones');
  revalidatePath('/dashboard');
  return { id: row.id };
}

export async function updateComunicacionAction(
  id: string,
  input: ComunicacionInput,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar comunicaciones.' };

  const err = validar(input);
  if (err) return { error: err };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: comunicaciones.id })
    .from(comunicaciones)
    .where(and(eq(comunicaciones.id, id), eq(comunicaciones.guarderiaId, guarderiaId)))
    .limit(1);

  if (!current) return { error: 'Comunicación no encontrada.' };

  await db
    .update(comunicaciones)
    .set({
      titulo: input.titulo.trim(),
      texto: input.texto.trim() || null,
      tipo: input.tipo,
      categoria: input.categoria,
      publicar: input.publicar,
      updatedAt: new Date(),
    })
    .where(eq(comunicaciones.id, id));

  revalidatePath('/comunicaciones');
  revalidatePath('/dashboard');
  return {};
}
