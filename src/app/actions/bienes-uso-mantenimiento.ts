'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { borrarArchivo, subirArchivo, validarArchivo } from '@/lib/archivos-privados';
import { contextoAdmin, esError } from '@/lib/auth/contexto-admin';
import { db } from '@/lib/db';
import {
  bienUsoFallas,
  bienUsoInspecciones,
  bienUsoInsumos,
  bienUsoIntervenciones,
  bienUsoPlanes,
  bienesUso,
  proveedores,
} from '@/lib/db/schema';
import { FRECUENCIAS, RESULTADOS_INSPECCION } from '@/lib/bienes-uso/constantes';
import { proximaFecha } from '@/lib/bienes-uso/mantenimiento';
import {
  enumOpc,
  enumReq,
  primerError,
  textoOpc,
  textoReq,
  uuid,
  uuidOpc,
  ymdOpc,
  ymdReq,
} from '@/lib/esquemas-comunes';
import { MONEDAS } from '@/lib/proveedores/constantes';

export type ResultadoMantenimiento = { error?: string };

const VALORES = (l: { value: string }[]) => l.map((o) => o.value);

function revalidar(bienId: string) {
  revalidatePath('/bienes-de-uso');
  revalidatePath(`/bienes-de-uso/${bienId}`);
}

/** Admin del club + el bien (solo si pertenece al club). */
async function conBien(bienId: string) {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error } as const;
  if (!uuid.safeParse(bienId).success) return { error: 'No encontramos ese bien de uso.' } as const;
  const [b] = await db
    .select({ id: bienesUso.id })
    .from(bienesUso)
    .where(and(eq(bienesUso.id, bienId), eq(bienesUso.guarderiaId, c.gId)))
    .limit(1);
  if (!b) return { error: 'No encontramos ese bien de uso.' } as const;
  return { c, b } as const;
}

const importe = (msg: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number({ message: msg }).min(0, msg).max(9_999_999_999_999, msg).nullable(),
  );

// ─── Planes de mantenimiento preventivo ─────────────────────────────────────

const planSchema = z.object({
  id: uuidOpc,
  descripcion: textoReq(200, 'Escribí qué se revisa en este plan.'),
  frecuenciaTipo: enumReq(
    VALORES(FRECUENCIAS),
    'Elegí si la frecuencia es en días, meses u horas.',
  ),
  frecuenciaValor: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? NaN : Number(v)),
    z
      .number({ message: 'Escribí cada cuánto se revisa.' })
      .int('La frecuencia tiene que ser un número entero.')
      .min(1, 'La frecuencia tiene que ser mayor a cero.')
      .max(100000, 'La frecuencia es demasiado grande.'),
  ),
  proximaFecha: ymdOpc('La fecha del próximo mantenimiento no es válida.'),
  ultimaFecha: ymdOpc('La fecha del último mantenimiento no es válida.'),
  activo: z.boolean().default(true),
  notas: textoOpc(500),
});

/** Alta o edición de un plan preventivo (`id` presente = edición). */
export async function guardarPlanAction(
  bienId: string,
  input: z.input<typeof planSchema>,
): Promise<ResultadoMantenimiento> {
  const r = await conBien(bienId);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { id, ...d } = parsed.data;

  // Si no se agendó la próxima fecha pero hay última y frecuencia en días o meses, se calcula.
  const proxima =
    d.proximaFecha ??
    (d.ultimaFecha ? proximaFecha(d.ultimaFecha, d.frecuenciaTipo, d.frecuenciaValor) : null);
  const datos = { ...d, proximaFecha: proxima };

  try {
    if (id) {
      const upd = await db
        .update(bienUsoPlanes)
        .set(datos)
        .where(
          and(
            eq(bienUsoPlanes.id, id),
            eq(bienUsoPlanes.bienId, b.id),
            eq(bienUsoPlanes.guarderiaId, c.gId),
          ),
        )
        .returning({ id: bienUsoPlanes.id });
      if (upd.length === 0) return { error: 'No encontramos ese plan.' };
    } else {
      await db.insert(bienUsoPlanes).values({ ...datos, bienId: b.id, guarderiaId: c.gId });
    }
  } catch {
    return { error: 'No se pudo guardar el plan de mantenimiento.' };
  }
  revalidar(b.id);
  return {};
}

export async function eliminarPlanAction(
  bienId: string,
  planId: string,
): Promise<ResultadoMantenimiento> {
  const r = await conBien(bienId);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;
  if (!uuid.safeParse(planId).success) return { error: 'Dato inválido.' };
  await db
    .delete(bienUsoPlanes)
    .where(
      and(
        eq(bienUsoPlanes.id, planId),
        eq(bienUsoPlanes.bienId, b.id),
        eq(bienUsoPlanes.guarderiaId, c.gId),
      ),
    );
  revalidar(b.id);
  return {};
}

// ─── Intervenciones (reparaciones y mantenimientos hechos) ──────────────────

const intervencionSchema = z.object({
  id: uuidOpc,
  fecha: ymdReq('La fecha de la intervención no es válida.'),
  tipo: textoOpc(80),
  descripcion: textoOpc(1000),
  repuestos: textoOpc(1000),
  proveedorId: uuidOpc,
  costo: importe('El costo no es válido.'),
  moneda: enumReq(VALORES(MONEDAS), 'Elegí una moneda de la lista.'),
  planId: uuidOpc,
});

/**
 * Registra una intervención (reparación o mantenimiento): fecha, tipo, repuestos, quién la hizo
 * y el costo. Si se indica el plan preventivo que cumple, el plan pasa a figurar con esa
 * fecha como último mantenimiento y se agenda el siguiente (cuando la frecuencia es en días
 * o meses). Campos del FormData: `bienId`, `id` (si edita), los de arriba y `file` (opcional).
 */
export async function guardarIntervencionAction(
  formData: FormData,
): Promise<ResultadoMantenimiento> {
  const r = await conBien(String(formData.get('bienId') ?? ''));
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const parsed = intervencionSchema.safeParse({
    id: formData.get('id') ?? '',
    fecha: formData.get('fecha') ?? '',
    tipo: formData.get('tipo') ?? '',
    descripcion: formData.get('descripcion') ?? '',
    repuestos: formData.get('repuestos') ?? '',
    proveedorId: formData.get('proveedorId') ?? '',
    costo: formData.get('costo') ?? '',
    moneda: String(formData.get('moneda') ?? 'ARS'),
    planId: formData.get('planId') ?? '',
  });
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { id, ...d } = parsed.data;
  if (!d.tipo && !d.descripcion) {
    return { error: 'Indicá el tipo de intervención o describí qué se hizo.' };
  }

  // El proveedor y el plan tienen que ser de este club / de este bien.
  if (d.proveedorId) {
    const [p] = await db
      .select({ id: proveedores.id })
      .from(proveedores)
      .where(and(eq(proveedores.id, d.proveedorId), eq(proveedores.guarderiaId, c.gId)))
      .limit(1);
    if (!p) return { error: 'Ese proveedor no es de este club.' };
  }
  let plan: typeof bienUsoPlanes.$inferSelect | null = null;
  if (d.planId) {
    const [p] = await db
      .select()
      .from(bienUsoPlanes)
      .where(
        and(
          eq(bienUsoPlanes.id, d.planId),
          eq(bienUsoPlanes.bienId, b.id),
          eq(bienUsoPlanes.guarderiaId, c.gId),
        ),
      )
      .limit(1);
    if (!p) return { error: 'Ese plan de mantenimiento no es de este bien.' };
    plan = p;
  }

  const archivo = await validarArchivo(formData.get('file'));
  if (archivo && 'error' in archivo) return { error: archivo.error };
  let path: string | null = null;
  if (archivo) {
    const sub = await subirArchivo('bienes', c.gId, b.id, archivo);
    if ('error' in sub) return { error: sub.error };
    path = sub.path;
  }
  const costo = d.costo === null ? null : d.costo.toFixed(2);
  const archivoCampos =
    path && archivo && !('error' in archivo)
      ? { archivoPath: path, archivoNombre: archivo.nombre }
      : {};

  let anterior: string | null = null;
  try {
    await db.transaction(async (tx) => {
      if (id) {
        const [previo] = await tx
          .select({ path: bienUsoIntervenciones.archivoPath })
          .from(bienUsoIntervenciones)
          .where(
            and(
              eq(bienUsoIntervenciones.id, id),
              eq(bienUsoIntervenciones.bienId, b.id),
              eq(bienUsoIntervenciones.guarderiaId, c.gId),
            ),
          )
          .limit(1);
        if (!previo) throw new Error('NO_ENCONTRADA');
        anterior = previo.path;
        await tx
          .update(bienUsoIntervenciones)
          .set({ ...d, costo, ...archivoCampos })
          .where(eq(bienUsoIntervenciones.id, id));
      } else {
        await tx.insert(bienUsoIntervenciones).values({
          ...d,
          costo,
          ...archivoCampos,
          bienId: b.id,
          guarderiaId: c.gId,
          createdBy: c.userId,
        });
      }
      // El plan cumplido pasa a tener esta fecha como último mantenimiento.
      if (plan && (!plan.ultimaFecha || d.fecha >= plan.ultimaFecha)) {
        await tx
          .update(bienUsoPlanes)
          .set({
            ultimaFecha: d.fecha,
            proximaFecha:
              proximaFecha(d.fecha, plan.frecuenciaTipo, plan.frecuenciaValor) ?? plan.proximaFecha,
          })
          .where(eq(bienUsoPlanes.id, plan.id));
      }
    });
  } catch (e) {
    await borrarArchivo(path);
    if (e instanceof Error && e.message === 'NO_ENCONTRADA') {
      return { error: 'No encontramos esa intervención.' };
    }
    return { error: 'No se pudo guardar la intervención.' };
  }
  if (path && anterior) await borrarArchivo(anterior);
  revalidar(b.id);
  return {};
}

export async function eliminarIntervencionAction(
  bienId: string,
  intervencionId: string,
): Promise<ResultadoMantenimiento> {
  const r = await conBien(bienId);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;
  if (!uuid.safeParse(intervencionId).success) return { error: 'Dato inválido.' };

  const [x] = await db
    .select({ id: bienUsoIntervenciones.id, path: bienUsoIntervenciones.archivoPath })
    .from(bienUsoIntervenciones)
    .where(
      and(
        eq(bienUsoIntervenciones.id, intervencionId),
        eq(bienUsoIntervenciones.bienId, b.id),
        eq(bienUsoIntervenciones.guarderiaId, c.gId),
      ),
    )
    .limit(1);
  if (!x) return { error: 'No encontramos esa intervención.' };
  await db.delete(bienUsoIntervenciones).where(eq(bienUsoIntervenciones.id, x.id));
  await borrarArchivo(x.path);
  revalidar(b.id);
  return {};
}

// ─── Historial de fallas ────────────────────────────────────────────────────

const fallaSchema = z.object({
  id: uuidOpc,
  fecha: ymdReq('La fecha de la falla no es válida.'),
  tipo: textoOpc(80),
  descripcion: textoReq(1000, 'Describí la avería.'),
  accionCorrectiva: textoOpc(1000),
  fechaResolucion: ymdOpc('La fecha de resolución no es válida.'),
});

export async function guardarFallaAction(
  bienId: string,
  input: z.input<typeof fallaSchema>,
): Promise<ResultadoMantenimiento> {
  const r = await conBien(bienId);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const parsed = fallaSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { id, ...d } = parsed.data;
  if (d.fechaResolucion && d.fechaResolucion < d.fecha) {
    return { error: 'La fecha de resolución no puede ser anterior a la fecha de la falla.' };
  }

  try {
    if (id) {
      const upd = await db
        .update(bienUsoFallas)
        .set(d)
        .where(
          and(
            eq(bienUsoFallas.id, id),
            eq(bienUsoFallas.bienId, b.id),
            eq(bienUsoFallas.guarderiaId, c.gId),
          ),
        )
        .returning({ id: bienUsoFallas.id });
      if (upd.length === 0) return { error: 'No encontramos esa falla.' };
    } else {
      await db.insert(bienUsoFallas).values({ ...d, bienId: b.id, guarderiaId: c.gId });
    }
  } catch {
    return { error: 'No se pudo guardar la falla.' };
  }
  revalidar(b.id);
  return {};
}

export async function eliminarFallaAction(
  bienId: string,
  fallaId: string,
): Promise<ResultadoMantenimiento> {
  const r = await conBien(bienId);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;
  if (!uuid.safeParse(fallaId).success) return { error: 'Dato inválido.' };
  await db
    .delete(bienUsoFallas)
    .where(
      and(
        eq(bienUsoFallas.id, fallaId),
        eq(bienUsoFallas.bienId, b.id),
        eq(bienUsoFallas.guarderiaId, c.gId),
      ),
    );
  revalidar(b.id);
  return {};
}

// ─── Insumos y cambios periódicos ───────────────────────────────────────────

const insumoSchema = z.object({
  id: uuidOpc,
  tipo: textoReq(80, 'Elegí el tipo de insumo.'),
  descripcion: textoOpc(300),
  ultimoCambio: ymdOpc('La fecha del último cambio no es válida.'),
  frecuenciaValor: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z
      .number({ message: 'La frecuencia no es válida.' })
      .int('La frecuencia tiene que ser un número entero.')
      .min(1, 'La frecuencia tiene que ser mayor a cero.')
      .max(100000, 'La frecuencia es demasiado grande.')
      .nullable(),
  ),
  frecuenciaTipo: enumOpc(VALORES(FRECUENCIAS), 'Elegí la unidad de la frecuencia.'),
  notas: textoOpc(500),
});

export async function guardarInsumoAction(
  bienId: string,
  input: z.input<typeof insumoSchema>,
): Promise<ResultadoMantenimiento> {
  const r = await conBien(bienId);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const parsed = insumoSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { id, ...d } = parsed.data;
  if ((d.frecuenciaValor === null) !== (d.frecuenciaTipo === null)) {
    return { error: 'Completá la frecuencia y su unidad (o dejá las dos vacías).' };
  }

  try {
    if (id) {
      const upd = await db
        .update(bienUsoInsumos)
        .set(d)
        .where(
          and(
            eq(bienUsoInsumos.id, id),
            eq(bienUsoInsumos.bienId, b.id),
            eq(bienUsoInsumos.guarderiaId, c.gId),
          ),
        )
        .returning({ id: bienUsoInsumos.id });
      if (upd.length === 0) return { error: 'No encontramos ese insumo.' };
    } else {
      await db.insert(bienUsoInsumos).values({ ...d, bienId: b.id, guarderiaId: c.gId });
    }
  } catch {
    return { error: 'No se pudo guardar el insumo.' };
  }
  revalidar(b.id);
  return {};
}

export async function eliminarInsumoAction(
  bienId: string,
  insumoId: string,
): Promise<ResultadoMantenimiento> {
  const r = await conBien(bienId);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;
  if (!uuid.safeParse(insumoId).success) return { error: 'Dato inválido.' };
  await db
    .delete(bienUsoInsumos)
    .where(
      and(
        eq(bienUsoInsumos.id, insumoId),
        eq(bienUsoInsumos.bienId, b.id),
        eq(bienUsoInsumos.guarderiaId, c.gId),
      ),
    );
  revalidar(b.id);
  return {};
}

// ─── Inspecciones ───────────────────────────────────────────────────────────

const inspeccionSchema = z.object({
  id: uuidOpc,
  fecha: ymdReq('La fecha de la inspección no es válida.'),
  tipo: textoOpc(80),
  resultado: enumReq(VALORES(RESULTADOS_INSPECCION), 'Elegí el resultado de la inspección.'),
  inspector: textoOpc(120),
  observaciones: textoOpc(2000),
});

/**
 * Registra una inspección (checklist diario del operador, prueba de seguridad, emisiones…).
 * Campos del FormData: `bienId`, `id` (si edita), `fecha`, `tipo`, `resultado`, `inspector`,
 * `observaciones` y `file` (el comprobante, opcional).
 */
export async function guardarInspeccionAction(formData: FormData): Promise<ResultadoMantenimiento> {
  const r = await conBien(String(formData.get('bienId') ?? ''));
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const parsed = inspeccionSchema.safeParse({
    id: formData.get('id') ?? '',
    fecha: formData.get('fecha') ?? '',
    tipo: formData.get('tipo') ?? '',
    resultado: String(formData.get('resultado') ?? 'ok'),
    inspector: formData.get('inspector') ?? '',
    observaciones: formData.get('observaciones') ?? '',
  });
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { id, ...d } = parsed.data;

  const archivo = await validarArchivo(formData.get('file'));
  if (archivo && 'error' in archivo) return { error: archivo.error };
  let path: string | null = null;
  if (archivo) {
    const sub = await subirArchivo('bienes', c.gId, b.id, archivo);
    if ('error' in sub) return { error: sub.error };
    path = sub.path;
  }
  const archivoCampos =
    path && archivo && !('error' in archivo)
      ? { archivoPath: path, archivoNombre: archivo.nombre }
      : {};

  let anterior: string | null = null;
  try {
    if (id) {
      const [previo] = await db
        .select({ path: bienUsoInspecciones.archivoPath })
        .from(bienUsoInspecciones)
        .where(
          and(
            eq(bienUsoInspecciones.id, id),
            eq(bienUsoInspecciones.bienId, b.id),
            eq(bienUsoInspecciones.guarderiaId, c.gId),
          ),
        )
        .limit(1);
      if (!previo) {
        await borrarArchivo(path);
        return { error: 'No encontramos esa inspección.' };
      }
      anterior = previo.path;
      await db
        .update(bienUsoInspecciones)
        .set({ ...d, ...archivoCampos })
        .where(eq(bienUsoInspecciones.id, id));
    } else {
      await db.insert(bienUsoInspecciones).values({
        ...d,
        ...archivoCampos,
        bienId: b.id,
        guarderiaId: c.gId,
        createdBy: c.userId,
      });
    }
  } catch {
    await borrarArchivo(path);
    return { error: 'No se pudo guardar la inspección.' };
  }
  if (path && anterior) await borrarArchivo(anterior);
  revalidar(b.id);
  return {};
}

export async function eliminarInspeccionAction(
  bienId: string,
  inspeccionId: string,
): Promise<ResultadoMantenimiento> {
  const r = await conBien(bienId);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;
  if (!uuid.safeParse(inspeccionId).success) return { error: 'Dato inválido.' };

  const [x] = await db
    .select({ id: bienUsoInspecciones.id, path: bienUsoInspecciones.archivoPath })
    .from(bienUsoInspecciones)
    .where(
      and(
        eq(bienUsoInspecciones.id, inspeccionId),
        eq(bienUsoInspecciones.bienId, b.id),
        eq(bienUsoInspecciones.guarderiaId, c.gId),
      ),
    )
    .limit(1);
  if (!x) return { error: 'No encontramos esa inspección.' };
  await db.delete(bienUsoInspecciones).where(eq(bienUsoInspecciones.id, x.id));
  await borrarArchivo(x.path);
  revalidar(b.id);
  return {};
}
