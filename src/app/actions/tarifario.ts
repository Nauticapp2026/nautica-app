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

const MEDIDAS = [
  'hasta_16',
  'hasta_18',
  'hasta_19',
  'hasta_21',
  'hasta_23',
  'hasta_25',
  'hasta_29',
  'hasta_32',
  'hasta_35',
  'hasta_40',
  'hasta_42',
  'hasta_44',
  'hasta_46',
  'hasta_50',
  'hasta_55',
  'hasta_60',
  'hasta_65',
  'hasta_70',
  'hasta_74',
  'hasta_86',
  'hasta_105',
] as const;
type Medida = (typeof MEDIDAS)[number];

const LOCACIONES = ['camas', 'amarra'] as const;
type Locacion = (typeof LOCACIONES)[number];

const UNIDADES = ['metros', 'pies'] as const;
type UnidadMetraje = (typeof UNIDADES)[number];

export type TarifaInputBase = {
  nombre: string;
  precio: number;
};

export type TarifaCuotaMensualInput = TarifaInputBase & {
  tipo: 'cuota_mensual';
  medida: Medida | null;
};

export type TarifaServiciosInput = TarifaInputBase & {
  tipo: 'servicios';
};

export type TarifaEspaciosInput = TarifaInputBase & {
  tipo: 'espacios';
  locacion: Locacion;
  unidadMetraje: UnidadMetraje;
  eslora: number | null;
  manga: number | null;
  puntual: number | null;
  clases: string;
};

export type CreateTarifaData = TarifaCuotaMensualInput | TarifaServiciosInput | TarifaEspaciosInput;

export type UpdateTarifaData = CreateTarifaData & { id: string; estado: Estado };

export type AjusteMasivoData =
  | { tipo: 'porcentaje'; valor: number }
  | { tipo: 'monto'; valor: number };

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
}

function validar(data: CreateTarifaData): string | null {
  if (!data.nombre.trim()) return 'El concepto es obligatorio.';
  if (!TIPOS.includes(data.tipo)) return 'Categoría inválida.';
  if (!Number.isFinite(data.precio) || data.precio < 0) {
    return 'El precio debe ser un número mayor o igual a 0.';
  }
  if (data.tipo === 'cuota_mensual' && data.medida && !MEDIDAS.includes(data.medida)) {
    return 'Medida inválida.';
  }
  if (data.tipo === 'espacios') {
    if (!LOCACIONES.includes(data.locacion)) return 'Locación inválida.';
    if (!UNIDADES.includes(data.unidadMetraje)) return 'Unidad de metraje inválida.';
    for (const [k, v] of Object.entries({
      eslora: data.eslora,
      manga: data.manga,
      puntual: data.puntual,
    })) {
      if (v != null && (!Number.isFinite(v) || v < 0)) {
        return `El valor de ${k} debe ser ≥ 0.`;
      }
    }
  }
  return null;
}

function buildValues(data: CreateTarifaData) {
  const base = {
    nombre: data.nombre.trim(),
    tipo: data.tipo,
    precio: data.precio.toFixed(2),
  };

  if (data.tipo === 'cuota_mensual') {
    return { ...base, medida: data.medida };
  }
  if (data.tipo === 'espacios') {
    return {
      ...base,
      locacion: data.locacion,
      unidadMetraje: data.unidadMetraje,
      eslora: data.eslora != null ? data.eslora.toFixed(2) : null,
      manga: data.manga != null ? data.manga.toFixed(2) : null,
      puntual: data.puntual != null ? data.puntual.toFixed(2) : null,
      clases: data.clases.trim() || null,
    };
  }
  return base;
}

export async function createTarifaAction(
  data: CreateTarifaData,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden crear tarifas.' };

  const err = validar(data);
  if (err) return { error: err };

  const [row] = await db
    .insert(servicios)
    .values({
      guarderiaId: ctx.activeMembership.guarderiaId,
      estado: 'activo',
      ...buildValues(data),
    })
    .returning({ id: servicios.id });

  revalidatePath('/tarifario');
  return { id: row.id };
}

export async function updateTarifaAction(data: UpdateTarifaData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar tarifas.' };

  const err = validar(data);
  if (err) return { error: err };
  if (!ESTADOS.includes(data.estado)) return { error: 'Estado inválido.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: servicios.id })
    .from(servicios)
    .where(and(eq(servicios.id, data.id), eq(servicios.guarderiaId, guarderiaId)))
    .limit(1);

  if (!current) return { error: 'Tarifa no encontrada.' };

  // Limpieza: cuando el tipo es "servicios" o cambia de tipo, reseteamos los campos
  // que no aplican a ese tipo para que no queden datos colgados.
  const base = buildValues(data);
  const extras =
    data.tipo === 'cuota_mensual'
      ? {
          locacion: null,
          unidadMetraje: null,
          eslora: null,
          manga: null,
          puntual: null,
          clases: null,
        }
      : data.tipo === 'espacios'
        ? { medida: null }
        : {
            medida: null,
            locacion: null,
            unidadMetraje: null,
            eslora: null,
            manga: null,
            puntual: null,
            clases: null,
          };

  await db
    .update(servicios)
    .set({
      ...base,
      ...extras,
      estado: data.estado,
      updatedAt: new Date(),
    })
    .where(eq(servicios.id, data.id));

  revalidatePath('/tarifario');
  return {};
}

export async function ajusteMasivoTarifasAction(
  data: AjusteMasivoData,
): Promise<{ error?: string; afectadas?: number }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden ajustar tarifas.' };

  if (!Number.isFinite(data.valor) || data.valor < 0) {
    return { error: 'El valor debe ser un número mayor o igual a 0.' };
  }

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const rows = await db
    .select({ id: servicios.id, precio: servicios.precio })
    .from(servicios)
    .where(eq(servicios.guarderiaId, guarderiaId));

  let afectadas = 0;
  const now = new Date();

  for (const row of rows) {
    const actual = row.precio != null ? Number(row.precio) : 0;
    // porcentaje: incrementa el precio actual en X%.
    // monto: reemplaza el precio por el valor indicado.
    const nuevo = data.tipo === 'porcentaje' ? actual * (1 + data.valor / 100) : data.valor;

    await db
      .update(servicios)
      .set({ precio: nuevo.toFixed(2), updatedAt: now })
      .where(eq(servicios.id, row.id));
    afectadas++;
  }

  revalidatePath('/tarifario');
  return { afectadas };
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
