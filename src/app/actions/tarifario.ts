'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { profiles, servicios, serviciosHistorial } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';

type Origen = 'manual' | 'masivo_porcentaje' | 'masivo_monto';

// Setea los GUCs que el trigger `_on_servicio_precio_change` lee para
// armar la fila del historial. Tiene que ejecutarse dentro de la misma
// transacción que el UPDATE para que `is_local=true` lo aísle del pool.
async function setOrigenGUC(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  origen: Origen,
  usuarioId: string,
) {
  await tx.execute(sql`SELECT set_config('app.origen_cambio', ${origen}, true)`);
  await tx.execute(sql`SELECT set_config('app.usuario_id', ${usuarioId}, true)`);
}

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
};

export type CreateTarifaData = TarifaCuotaMensualInput | TarifaServiciosInput | TarifaEspaciosInput;

export type UpdateTarifaData = CreateTarifaData & { id: string; estado: Estado };

export type AjusteMasivoData =
  | { tipo: 'porcentaje'; direccion: 'aumento' | 'descuento'; valor: number }
  | { tipo: 'monto'; valor: number };

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo'
  );
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
          };

  await db.transaction(async (tx) => {
    await setOrigenGUC(tx, 'manual', ctx.profile.id);
    await tx
      .update(servicios)
      .set({
        ...base,
        ...extras,
        estado: data.estado,
        updatedAt: new Date(),
      })
      .where(eq(servicios.id, data.id));
  });

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
  if (data.tipo === 'porcentaje') {
    if (data.direccion !== 'aumento' && data.direccion !== 'descuento') {
      return { error: 'Dirección inválida.' };
    }
    if (data.direccion === 'descuento' && data.valor > 100) {
      return { error: 'El descuento no puede ser mayor a 100%.' };
    }
  }

  const guarderiaId = ctx.activeMembership.guarderiaId;
  const origen: Origen = data.tipo === 'porcentaje' ? 'masivo_porcentaje' : 'masivo_monto';

  const afectadas = await db.transaction(async (tx) => {
    await setOrigenGUC(tx, origen, ctx.profile.id);

    const rows = await tx
      .select({ id: servicios.id, precio: servicios.precio })
      .from(servicios)
      .where(eq(servicios.guarderiaId, guarderiaId));

    let count = 0;
    const now = new Date();

    for (const row of rows) {
      const actual = row.precio != null ? Number(row.precio) : 0;
      // porcentaje: aplica X% como aumento (+) o descuento (-) sobre el actual.
      // monto: reemplaza el precio por el valor indicado.
      let nuevo: number;
      if (data.tipo === 'porcentaje') {
        const factor = data.direccion === 'aumento' ? 1 + data.valor / 100 : 1 - data.valor / 100;
        nuevo = Math.max(0, actual * factor);
      } else {
        nuevo = data.valor;
      }

      await tx
        .update(servicios)
        .set({ precio: nuevo.toFixed(2), updatedAt: now })
        .where(eq(servicios.id, row.id));
      count++;
    }

    return count;
  });

  revalidatePath('/tarifario');
  return { afectadas };
}

export type HistorialEntry = {
  id: string;
  precioAnterior: number | null;
  precioNuevo: number | null;
  origen: Origen;
  usuarioNombre: string | null;
  createdAt: string;
};

export async function getHistorialTarifaAction(
  servicioId: string,
): Promise<{ error?: string; entries?: HistorialEntry[] }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden ver el historial.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [tarifa] = await db
    .select({ id: servicios.id })
    .from(servicios)
    .where(and(eq(servicios.id, servicioId), eq(servicios.guarderiaId, guarderiaId)))
    .limit(1);

  if (!tarifa) return { error: 'Tarifa no encontrada.' };

  const rows = await db
    .select({
      id: serviciosHistorial.id,
      precioAnterior: serviciosHistorial.precioAnterior,
      precioNuevo: serviciosHistorial.precioNuevo,
      origen: serviciosHistorial.origen,
      createdAt: serviciosHistorial.createdAt,
      usuarioNombre: profiles.nombre,
      usuarioApellido: profiles.apellido,
      usuarioEmail: profiles.email,
    })
    .from(serviciosHistorial)
    .leftJoin(profiles, eq(profiles.id, serviciosHistorial.usuarioId))
    .where(eq(serviciosHistorial.servicioId, servicioId))
    .orderBy(desc(serviciosHistorial.createdAt))
    .limit(20);

  const entries: HistorialEntry[] = rows.map((r) => {
    const fullName = [r.usuarioNombre, r.usuarioApellido].filter(Boolean).join(' ').trim();
    return {
      id: r.id,
      precioAnterior: r.precioAnterior != null ? Number(r.precioAnterior) : null,
      precioNuevo: r.precioNuevo != null ? Number(r.precioNuevo) : null,
      origen: r.origen as Origen,
      usuarioNombre: fullName || r.usuarioEmail || null,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return { entries };
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
