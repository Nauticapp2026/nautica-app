'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, gt, gte, isNotNull, isNull, lt, lte, ne, not, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  espacios,
  profiles,
  servicios,
  serviciosAjustesProgramados,
  serviciosHistorial,
  socioServicios,
  socioServiciosCancelados,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { todayArg } from '@/lib/dates';

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

const TIPOS = [
  'espacio_guarda',
  'cuota_social',
  'membresia',
  'expensas_ordinarias',
  'expensas_extraordinarias',
  'servicio_extra',
] as const;
type Tipo = (typeof TIPOS)[number];

const TIPOS_COBRO = ['fijo', 'variable'] as const;
type TipoCobro = (typeof TIPOS_COBRO)[number];

const PERIODOS_VARIABLE = ['diaria', 'mensual'] as const;
type PeriodoTarifaVariable = (typeof PERIODOS_VARIABLE)[number];

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

const ALICUOTAS_IVA = [0, 10.5, 21] as const;
type AlicuotaIva = (typeof ALICUOTAS_IVA)[number];

const PLAZOS_PAGO = [0, 5, 10, 15, 20, 30] as const;
type PlazoPagoDias = (typeof PLAZOS_PAGO)[number];

const POLITICAS_BAJA_ANTICIPADA = ['mes_completo', 'proporcional'] as const;
type PoliticaBajaAnticipada = (typeof POLITICAS_BAJA_ANTICIPADA)[number];

export type TarifaInputBase = {
  nombre: string;
  tipoCobro: TipoCobro;
  // Solo aplica a Variable ('diaria' = el precio es por día); para Fijo se
  // fuerza a null server-side sea lo que sea que mande el cliente.
  tarifaVariable: PeriodoTarifaVariable | null;
  precio: number;
  alicuotaIva: AlicuotaIva;
  plazoPagoDias: PlazoPagoDias;
  // NULL = sin política definida (checkbox destildado). Solo aplica a Fijo;
  // para Variable se fuerza a null server-side sea lo que sea que mande el
  // cliente.
  politicaBajaAnticipada: PoliticaBajaAnticipada | null;
  vigenciaDesde: string;
  vigenciaHasta: string;
};

export type TarifaEspacioGuardaInput = TarifaInputBase & {
  tipo: 'espacio_guarda';
  locacion: Locacion;
  unidadMetraje: UnidadMetraje;
  eslora: number | null;
  manga: number | null;
  puntual: number | null;
};

export type TarifaBaseInput = TarifaInputBase & {
  tipo:
    | 'cuota_social'
    | 'membresia'
    | 'expensas_ordinarias'
    | 'expensas_extraordinarias'
    | 'servicio_extra';
};

export type CreateTarifaData = TarifaEspacioGuardaInput | TarifaBaseInput;

export type UpdateTarifaData = CreateTarifaData & { id: string; estado: Estado };

export type AjusteMasivoData =
  | {
      tipo: 'porcentaje';
      direccion: 'aumento' | 'descuento';
      valor: number;
      categoria: Tipo | 'todos';
      vigenciaDesde: string;
    }
  | { tipo: 'monto'; valor: number; categoria: Tipo | 'todos'; vigenciaDesde: string };

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo'
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validar(data: CreateTarifaData): string | null {
  if (!data.nombre.trim()) return 'El concepto es obligatorio.';
  if (!TIPOS.includes(data.tipo)) return 'Categoría inválida.';
  if (!TIPOS_COBRO.includes(data.tipoCobro)) return 'Tipo de cobro inválido.';
  if (data.tarifaVariable !== null && !PERIODOS_VARIABLE.includes(data.tarifaVariable)) {
    return 'Tipo de tarifa variable inválido.';
  }
  if (!(PLAZOS_PAGO as readonly number[]).includes(data.plazoPagoDias)) {
    return 'Plazo de pago inválido.';
  }
  if (
    data.politicaBajaAnticipada !== null &&
    !POLITICAS_BAJA_ANTICIPADA.includes(data.politicaBajaAnticipada)
  ) {
    return 'Política de baja anticipada inválida.';
  }
  if (!Number.isFinite(data.precio) || data.precio < 0) {
    return 'El precio debe ser un número mayor o igual a 0.';
  }
  if (!(ALICUOTAS_IVA as readonly number[]).includes(data.alicuotaIva)) {
    return 'Alícuota de IVA inválida.';
  }
  if (!data.vigenciaDesde || !DATE_RE.test(data.vigenciaDesde)) {
    return 'La fecha de inicio de vigencia es obligatoria.';
  }
  if (!data.vigenciaHasta || !DATE_RE.test(data.vigenciaHasta)) {
    return 'La fecha de vencimiento es obligatoria.';
  }
  if (data.vigenciaDesde > data.vigenciaHasta) {
    return 'La fecha de inicio debe ser anterior o igual al vencimiento.';
  }
  if (data.tipo === 'espacio_guarda') {
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

async function checkVigenciaOverlap(
  guarderiaId: string,
  data: CreateTarifaData,
  excludeId?: string,
): Promise<string | null> {
  const medidaCondition = isNull(servicios.medida);

  const conditions = and(
    eq(servicios.guarderiaId, guarderiaId),
    eq(servicios.nombre, data.nombre.trim()),
    eq(servicios.tipo, data.tipo),
    medidaCondition,
    // Overlap: NOT (existing.hasta < new.desde OR existing.desde > new.hasta)
    not(
      or(
        lt(servicios.vigenciaHasta, data.vigenciaDesde),
        gt(servicios.vigenciaDesde, data.vigenciaHasta),
      )!,
    ),
    ...(excludeId ? [ne(servicios.id, excludeId)] : []),
  );

  const [existing] = await db
    .select({
      id: servicios.id,
      vigenciaDesde: servicios.vigenciaDesde,
      vigenciaHasta: servicios.vigenciaHasta,
    })
    .from(servicios)
    .where(conditions)
    .limit(1);

  if (existing) {
    return `Ya existe una tarifa de "${data.nombre.trim()}" con fechas superpuestas (${existing.vigenciaDesde} – ${existing.vigenciaHasta}).`;
  }
  return null;
}

function buildValues(data: CreateTarifaData) {
  const base = {
    nombre: data.nombre.trim(),
    tipo: data.tipo,
    tipoCobro: data.tipoCobro,
    // Solo tiene sentido para Variable; si el cliente no lo manda, las
    // Variables se comportan como hasta ahora (precio por mes).
    tarifaVariable: data.tipoCobro === 'variable' ? (data.tarifaVariable ?? 'mensual') : null,
    precio: data.precio.toFixed(2),
    alicuotaIva: data.alicuotaIva.toFixed(2),
    plazoPagoDias: data.plazoPagoDias,
    // Solo tiene sentido para Fijo — un servicio Variable no se "cancela
    // antes de tiempo", se cobra una vez y listo.
    politicaBajaAnticipada: data.tipoCobro === 'variable' ? null : data.politicaBajaAnticipada,
    vigenciaDesde: data.vigenciaDesde,
    vigenciaHasta: data.vigenciaHasta,
  };

  if (data.tipo === 'espacio_guarda') {
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

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const overlapErr = await checkVigenciaOverlap(guarderiaId, data);
  if (overlapErr) return { error: overlapErr };

  const [row] = await db
    .insert(servicios)
    .values({
      guarderiaId,
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
    .select({ id: servicios.id, estado: servicios.estado })
    .from(servicios)
    .where(and(eq(servicios.id, data.id), eq(servicios.guarderiaId, guarderiaId)))
    .limit(1);

  if (!current) return { error: 'Tarifa no encontrada.' };

  // Si la tarifa está pausada, editar (precio, vigencia, etc.) NO debe des-pausarla.
  // El estado pausado solo se cambia con Pausar/Reactivar (botones dedicados).
  const estadoFinal = current.estado === 'pausado' ? 'pausado' : data.estado;

  // Misma regla que pausar: no se puede inactivar si hay socios con el
  // servicio contratado (quedarían sin facturarse/cobrarse en silencio).
  if (current.estado === 'activo' && estadoFinal === 'inactivo') {
    const n = await contarSociosConServicio(data.id);
    if (n > 0) {
      return {
        error: `No se puede inactivar: ${n} socio${n === 1 ? '' : 's'} ${
          n === 1 ? 'tiene' : 'tienen'
        } este servicio contratado. Cancelalo en esos socios antes de inactivar la tarifa.`,
      };
    }
  }

  const overlapErr = await checkVigenciaOverlap(guarderiaId, data, data.id);
  if (overlapErr) return { error: overlapErr };

  // Limpieza: cuando el tipo es "servicios" o cambia de tipo, reseteamos los campos
  // que no aplican a ese tipo para que no queden datos colgados.
  const base = buildValues(data);
  // Si no es espacio_guarda, limpiar los campos espaciales.
  const extras =
    data.tipo === 'espacio_guarda'
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
        estado: estadoFinal,
        updatedAt: new Date(),
      })
      .where(eq(servicios.id, data.id));
  });

  revalidatePath('/tarifario');
  return {};
}

export async function ajusteMasivoTarifasAction(
  data: AjusteMasivoData,
): Promise<{ error?: string; afectadas?: number; programado?: boolean }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden ajustar tarifas.' };

  if (!Number.isFinite(data.valor) || data.valor < 0) {
    return { error: 'El valor debe ser un número mayor o igual a 0.' };
  }
  if (data.tipo === 'porcentaje') {
    if (data.direccion !== 'aumento' && data.direccion !== 'descuento') {
      return { error: 'Acción inválida.' };
    }
    if (data.direccion === 'descuento' && data.valor > 100) {
      return { error: 'El descuento no puede ser mayor a 100%.' };
    }
  }
  if (data.categoria !== 'todos' && !TIPOS.includes(data.categoria)) {
    return { error: 'Categoría inválida.' };
  }
  if (!data.vigenciaDesde || !DATE_RE.test(data.vigenciaDesde)) {
    return { error: 'La fecha de vigencia es obligatoria.' };
  }

  const guarderiaId = ctx.activeMembership.guarderiaId;
  const origen: Origen = data.tipo === 'porcentaje' ? 'masivo_porcentaje' : 'masivo_monto';
  // Si la vigencia es a futuro, no tocamos el precio ahora: agendamos el cambio
  // y el cron diario lo aplica el día indicado.
  const esFuturo = data.vigenciaDesde > todayArg();

  // Precio nuevo "congelado" para cada servicio según su precio actual.
  const calcularNuevo = (actual: number): number => {
    if (data.tipo === 'porcentaje') {
      const factor = data.direccion === 'aumento' ? 1 + data.valor / 100 : 1 - data.valor / 100;
      return Math.max(0, actual * factor);
    }
    return data.valor;
  };

  const afectadas = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: servicios.id, precio: servicios.precio })
      .from(servicios)
      .where(
        and(
          eq(servicios.guarderiaId, guarderiaId),
          data.categoria !== 'todos' ? eq(servicios.tipo, data.categoria) : undefined,
        ),
      );

    if (esFuturo) {
      let count = 0;
      for (const row of rows) {
        const actual = row.precio != null ? Number(row.precio) : 0;
        const nuevo = calcularNuevo(actual);
        // Último gana: borramos el pendiente previo de este servicio antes de
        // insertar el nuevo (índice único parcial sobre servicio_id sin aplicar).
        await tx
          .delete(serviciosAjustesProgramados)
          .where(
            and(
              eq(serviciosAjustesProgramados.servicioId, row.id),
              eq(serviciosAjustesProgramados.aplicado, false),
            ),
          );
        await tx.insert(serviciosAjustesProgramados).values({
          servicioId: row.id,
          guarderiaId,
          precioNuevo: nuevo.toFixed(2),
          origen,
          fechaAplicacion: data.vigenciaDesde,
          createdBy: ctx.profile.id,
        });
        count++;
      }
      return count;
    }

    // Vigencia hoy o pasada: aplicar el cambio de precio en el acto.
    await setOrigenGUC(tx, origen, ctx.profile.id);
    let count = 0;
    const now = new Date();
    for (const row of rows) {
      const actual = row.precio != null ? Number(row.precio) : 0;
      const nuevo = calcularNuevo(actual);
      await tx
        .update(servicios)
        .set({ precio: nuevo.toFixed(2), vigenciaDesde: data.vigenciaDesde, updatedAt: now })
        .where(eq(servicios.id, row.id));
      count++;
    }
    return count;
  });

  revalidatePath('/tarifario');
  return { afectadas, programado: esFuturo };
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

// Cuenta cuántos socios DISTINTOS tienen contratada la tarifa: los que tienen
// un contrato vigente en `socio_servicios` (Cargar Servicio) o un espacio
// asignado con ese servicio, excluyendo a los que ya lo cancelaron
// (socio_servicios_cancelados). Antes se inferían los contratos "Cargar
// Servicio" por la existencia de un movimiento en cuenta corriente, pero
// desde que "Cargar Servicio" ya no crea un movimiento al contratar (el cron
// lo crea cuando corresponde facturar), un contrato recién cargado no tenía
// todavía ningún movimiento — hay que leer `socio_servicios` directamente.
async function contarSociosConServicio(servicioId: string): Promise<number> {
  const hoy = todayArg();
  const [contratos, esps, cancelados] = await Promise.all([
    db
      .selectDistinct({ socio: socioServicios.socioId })
      .from(socioServicios)
      .where(
        and(
          eq(socioServicios.servicioId, servicioId),
          lte(socioServicios.fechaInicio, hoy),
          or(isNull(socioServicios.fechaBaja), gte(socioServicios.fechaBaja, hoy)),
        ),
      ),
    db
      .selectDistinct({ socio: espacios.ocupanteId })
      .from(espacios)
      .where(and(eq(espacios.servicioId, servicioId), isNotNull(espacios.ocupanteId))),
    db
      .select({ socio: socioServiciosCancelados.socioId })
      .from(socioServiciosCancelados)
      .where(eq(socioServiciosCancelados.servicioId, servicioId)),
  ]);

  const cancelSet = new Set(cancelados.map((c) => c.socio));
  const socios = new Set<string>();
  for (const c of contratos) if (!cancelSet.has(c.socio)) socios.add(c.socio);
  for (const e of esps) if (e.socio && !cancelSet.has(e.socio)) socios.add(e.socio);
  return socios.size;
}

export type SocioConServicio = { id: string; nombre: string | null; apellido: string | null };

/**
 * Socios con un Servicio Contratado VIGENTE de esta tarifa, para mostrar el
 * detalle (nombre/apellido) antes de pausar — `contarSociosConServicio`
 * hace básicamente la misma consulta pero solo devuelve un total (y suma
 * también los de Espacio de guarda) para el bloqueo de inactivar.
 */
export async function getSociosConServicioAction(
  servicioId: string,
): Promise<{ error?: string; socios?: SocioConServicio[] }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden ver esta información.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [tarifa] = await db
    .select({ id: servicios.id })
    .from(servicios)
    .where(and(eq(servicios.id, servicioId), eq(servicios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!tarifa) return { error: 'Tarifa no encontrada.' };

  const hoy = todayArg();
  const rows = await db
    .selectDistinct({
      id: profiles.id,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
    })
    .from(socioServicios)
    .innerJoin(profiles, eq(profiles.id, socioServicios.socioId))
    .where(
      and(
        eq(socioServicios.servicioId, servicioId),
        eq(socioServicios.guarderiaId, guarderiaId),
        lte(socioServicios.fechaInicio, hoy),
        or(isNull(socioServicios.fechaBaja), gte(socioServicios.fechaBaja, hoy)),
      ),
    )
    .orderBy(profiles.nombre, profiles.apellido);

  return { socios: rows };
}

export async function pausarTarifaAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden pausar tarifas.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: servicios.id, estado: servicios.estado })
    .from(servicios)
    .where(and(eq(servicios.id, id), eq(servicios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!current) return { error: 'Tarifa no encontrada.' };
  if (current.estado === 'pausado') return { error: 'La tarifa ya está pausada.' };

  // Pausar ya no se bloquea por tener socios con el servicio contratado: a
  // esos socios no les afecta (siguen facturándose igual), solo deja de
  // poder contratarse de nuevo mientras esté pausada. El admin ya vio el
  // listado (getSociosConServicioAction) antes de confirmar, desde la UI.
  await db
    .update(servicios)
    .set({ estado: 'pausado', updatedAt: new Date() })
    .where(eq(servicios.id, id));
  revalidatePath('/tarifario');
  return {};
}

export async function reactivarTarifaAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden reactivar tarifas.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: servicios.id })
    .from(servicios)
    .where(and(eq(servicios.id, id), eq(servicios.guarderiaId, guarderiaId)))
    .limit(1);
  if (!current) return { error: 'Tarifa no encontrada.' };

  await db
    .update(servicios)
    .set({ estado: 'activo', updatedAt: new Date() })
    .where(eq(servicios.id, id));
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
