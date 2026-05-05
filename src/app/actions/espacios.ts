'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  areas,
  espacios,
  lados as ladosTable,
  marinas,
  memberships,
  naves,
  pisos as pisosTable,
  servicios,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { calcularProporcionalMes, ensureMonthlyMovimiento } from '@/lib/movimientos-mensuales';

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

const ESTADOS_ESPACIO = ['disponible', 'ocupado', 'reservado'] as const;
type EstadoEspacio = (typeof ESTADOS_ESPACIO)[number];

export type UpdateEspacioInput = {
  id: string;
  ocupanteId: string | null;
  nomenclatura: string;
  estado: EstadoEspacio;
  servicioId: string | null;
  eslora: number | null;
  manga: number | null;
  puntual: number | null;
};

export async function updateEspacioAction(input: UpdateEspacioInput): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar espacios.' };

  if (!input.nomenclatura.trim()) return { error: 'La nomenclatura es obligatoria.' };
  if (!ESTADOS_ESPACIO.includes(input.estado)) return { error: 'Estado inválido.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: espacios.id })
    .from(espacios)
    .where(and(eq(espacios.id, input.id), eq(espacios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!current) return { error: 'Espacio no encontrado.' };

  // Validar que el ocupante (si se asocia) sea miembro de la guardería.
  if (input.ocupanteId) {
    const [m] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, input.ocupanteId),
          eq(memberships.guarderiaId, guarderiaId),
          eq(memberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!m) return { error: 'El cliente seleccionado no es miembro de esta guardería.' };
  }

  // Validar que el servicio pertenezca a la guardería.
  let tarifaPrecio: string | null = null;
  let servicioNombre: string | null = null;
  let servicioPrecioNum = 0;
  if (input.servicioId) {
    const [s] = await db
      .select({ id: servicios.id, nombre: servicios.nombre, precio: servicios.precio })
      .from(servicios)
      .where(and(eq(servicios.id, input.servicioId), eq(servicios.guarderiaId, guarderiaId)))
      .limit(1);
    if (!s) return { error: 'La tarifa seleccionada no existe.' };
    tarifaPrecio = s.precio ?? null;
    servicioNombre = s.nombre;
    servicioPrecioNum = s.precio != null ? Number(s.precio) : 0;
  }

  await db
    .update(espacios)
    .set({
      ocupanteId: input.ocupanteId,
      servicioId: input.servicioId,
      nomenclatura: input.nomenclatura.trim(),
      estado: input.estado,
      eslora: input.eslora != null ? input.eslora.toFixed(2) : null,
      manga: input.manga != null ? input.manga.toFixed(2) : null,
      puntual: input.puntual != null ? input.puntual.toFixed(2) : null,
      tarifa: tarifaPrecio,
    })
    .where(eq(espacios.id, input.id));

  // Si hay ocupante + servicio, garantizamos el movimiento mensual del mes
  // corriente. Los movimientos históricos no se tocan (por decisión del usuario).
  if (input.ocupanteId && input.servicioId && servicioNombre) {
    try {
      const { importe, diasRestantes, diasMes, esProporcional } =
        calcularProporcionalMes(servicioPrecioNum);
      const concepto = esProporcional
        ? `${servicioNombre} (proporcional ${diasRestantes}/${diasMes} días)`
        : servicioNombre;
      await ensureMonthlyMovimiento({
        socioId: input.ocupanteId,
        servicioId: input.servicioId,
        precio: importe,
        concepto,
      });
    } catch (err) {
      // No bloqueamos el save del espacio si falla el movimiento.
      console.error('[ensureMonthlyMovimiento] error', err);
    }
  }

  revalidatePath('/espacios');
  return {};
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

export async function addPisoAction(ladoId: string): Promise<{ error?: string; pisoId?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden agregar pisos.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [lado] = await db
    .select({ id: ladosTable.id, areaId: ladosTable.areaId, naveId: ladosTable.naveId })
    .from(ladosTable)
    .where(and(eq(ladosTable.id, ladoId), eq(ladosTable.guarderiaId, guarderiaId)))
    .limit(1);
  if (!lado) return { error: 'Lado no encontrado.' };

  const pisosLado = await db
    .select({ id: pisosTable.id, orden: pisosTable.orden })
    .from(pisosTable)
    .where(eq(pisosTable.ladoId, ladoId))
    .orderBy(desc(pisosTable.orden));
  if (pisosLado.length === 0) {
    return { error: 'El lado no tiene pisos previos para usar como referencia.' };
  }

  const ultimoPiso = pisosLado[0];
  const nuevoOrden = (ultimoPiso.orden ?? 0) + 1;

  const espaciosUltimoPiso = await db
    .select({ id: espacios.id })
    .from(espacios)
    .where(eq(espacios.pisoId, ultimoPiso.id));
  const cantEspacios = espaciosUltimoPiso.length;

  // Continuar la secuencia numérica del lado para no colisionar con nomenclaturas existentes.
  const espaciosLado = await db
    .select({ nomenclatura: espacios.nomenclatura })
    .from(espacios)
    .where(eq(espacios.ladoId, ladoId));
  const maxNum = espaciosLado.reduce((acc, e) => {
    const n = Number(e.nomenclatura);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);

  const [piso] = await db
    .insert(pisosTable)
    .values({
      areaId: lado.areaId,
      ladoId: lado.id,
      nombre: `Piso ${pisosLado.length + 1}`,
      orden: nuevoOrden,
    })
    .returning({ id: pisosTable.id });

  if (cantEspacios > 0) {
    const rows = [];
    for (let k = 0; k < cantEspacios; k++) {
      rows.push({
        guarderiaId,
        areaId: lado.areaId,
        naveId: lado.naveId,
        ladoId: lado.id,
        pisoId: piso.id,
        nomenclatura: String(maxNum + 1 + k),
        estado: 'disponible' as const,
      });
    }
    await db.insert(espacios).values(rows);
  }

  revalidatePath('/espacios');
  return { pisoId: piso.id };
}

export async function moveEspacioToPisoAction(
  espacioId: string,
  targetPisoId: string,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden mover espacios.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [espacio] = await db
    .select({
      id: espacios.id,
      naveId: espacios.naveId,
      pisoId: espacios.pisoId,
    })
    .from(espacios)
    .where(and(eq(espacios.id, espacioId), eq(espacios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!espacio) return { error: 'Espacio no encontrado.' };

  if (espacio.pisoId === targetPisoId) return {};

  // Validar que el piso destino pertenezca a un lado de la misma nave (y guardería).
  const [destino] = await db
    .select({
      pisoId: pisosTable.id,
      ladoId: ladosTable.id,
      naveId: ladosTable.naveId,
      areaId: ladosTable.areaId,
    })
    .from(pisosTable)
    .innerJoin(ladosTable, eq(ladosTable.id, pisosTable.ladoId))
    .where(and(eq(pisosTable.id, targetPisoId), eq(ladosTable.guarderiaId, guarderiaId)))
    .limit(1);
  if (!destino) return { error: 'Piso destino no encontrado.' };

  if (!espacio.naveId || destino.naveId !== espacio.naveId) {
    return { error: 'Solo se puede mover el espacio a otro piso de la misma nave.' };
  }

  await db
    .update(espacios)
    .set({
      pisoId: destino.pisoId,
      ladoId: destino.ladoId,
      areaId: destino.areaId,
    })
    .where(eq(espacios.id, espacioId));

  revalidatePath('/espacios');
  return {};
}
