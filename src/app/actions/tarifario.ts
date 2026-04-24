'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { servicios } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';

const TIPOS = ['cuota_mensual', 'servicios', 'espacios'] as const;
type Tipo = (typeof TIPOS)[number];

const ESTADOS = ['activo', 'inactivo'] as const;
type Estado = (typeof ESTADOS)[number];

export type CreateTarifaData = {
  nombre: string;
  tipo: Tipo;
  precio: number;
};

export type UpdateTarifaData = {
  id: string;
  nombre: string;
  tipo: Tipo;
  precio: number;
  estado: Estado;
};

export type AjusteMasivoData =
  | { tipo: 'porcentaje'; valor: number }
  | { tipo: 'monto'; valor: number };

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
}

function validateCommon(data: { nombre: string; tipo: string; precio: number }): string | null {
  if (!data.nombre.trim()) return 'El concepto es obligatorio.';
  if (!TIPOS.includes(data.tipo as Tipo)) return 'Categoría inválida.';
  if (!Number.isFinite(data.precio) || data.precio < 0) {
    return 'El precio debe ser un número mayor o igual a 0.';
  }
  return null;
}

export async function createTarifaAction(
  data: CreateTarifaData,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden crear tarifas.' };

  const err = validateCommon(data);
  if (err) return { error: err };

  const [row] = await db
    .insert(servicios)
    .values({
      guarderiaId: ctx.activeMembership.guarderiaId,
      nombre: data.nombre.trim(),
      tipo: data.tipo,
      precio: data.precio.toFixed(2),
      estado: 'activo',
    })
    .returning({ id: servicios.id });

  revalidatePath('/tarifario');
  return { id: row.id };
}

export async function updateTarifaAction(data: UpdateTarifaData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar tarifas.' };

  const err = validateCommon(data);
  if (err) return { error: err };
  if (!ESTADOS.includes(data.estado)) return { error: 'Estado inválido.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: servicios.id })
    .from(servicios)
    .where(and(eq(servicios.id, data.id), eq(servicios.guarderiaId, guarderiaId)))
    .limit(1);

  if (!current) return { error: 'Tarifa no encontrada.' };

  await db
    .update(servicios)
    .set({
      nombre: data.nombre.trim(),
      tipo: data.tipo,
      precio: data.precio.toFixed(2),
      estado: data.estado,
      updatedAt: new Date(),
    })
    .where(eq(servicios.id, data.id));

  revalidatePath('/tarifario');
  return {};
}

export async function deleteTarifaAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar tarifas.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: servicios.id })
    .from(servicios)
    .where(and(eq(servicios.id, id), eq(servicios.guarderiaId, guarderiaId)))
    .limit(1);

  if (!current) return { error: 'Tarifa no encontrada.' };

  await db.delete(servicios).where(eq(servicios.id, id));
  revalidatePath('/tarifario');
  return {};
}
