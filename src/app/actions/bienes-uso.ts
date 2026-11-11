'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, max } from 'drizzle-orm';
import { z } from 'zod';

import { borrarArchivo, subirArchivo, validarArchivo } from '@/lib/archivos-privados';
import { contextoAdmin, esError } from '@/lib/auth/contexto-admin';
import { todayArg } from '@/lib/dates';
import { db } from '@/lib/db';
import {
  bienUsoEmpleados,
  bienUsoFallas,
  bienUsoHorarios,
  bienUsoInspecciones,
  bienUsoIntervenciones,
  bienUsoPlanes,
  bienesUso,
  empleados,
} from '@/lib/db/schema';
import {
  ESTADOS_BIEN,
  FORMAS_ADQUISICION,
  ROLES_EMPLEADO_BIEN,
  VIDAS_UTILES,
} from '@/lib/bienes-uso/constantes';
import { MONEDAS } from '@/lib/proveedores/constantes';
import {
  enumOpc,
  enumReq,
  listaTextos,
  primerError,
  textoOpc,
  textoReq,
  uuid,
  ymdOpc,
  ymdReq,
} from '@/lib/esquemas-comunes';
import { esEmailValido, normalizarHora } from '@/lib/legajo/validaciones';

export type ResultadoBien = { error?: string; aviso?: string };
export type ResultadoCrearBien = ResultadoBien & { id?: string };

const VALORES = (l: { value: string }[]) => l.map((o) => o.value);

function revalidar(id?: string) {
  revalidatePath('/bienes-de-uso');
  if (id) revalidatePath(`/bienes-de-uso/${id}`);
}

/** El bien si pertenece al club; null si no existe o es de otro club. */
async function bienDelClub(id: string, gId: string) {
  if (!uuid.safeParse(id).success) return null;
  const [b] = await db
    .select()
    .from(bienesUso)
    .where(and(eq(bienesUso.id, id), eq(bienesUso.guarderiaId, gId)))
    .limit(1);
  return b ?? null;
}

async function conBien(id: string) {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error } as const;
  const b = await bienDelClub(id, c.gId);
  if (!b) return { error: 'No encontramos ese bien de uso.' } as const;
  return { c, b } as const;
}

/** Número decimal de un campo de formulario ('' = sin dato). */
const importe = (msg: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number({ message: msg }).min(0, msg).max(9_999_999_999_999, msg).nullable(),
  );

const dosDecimales = (n: number) => n.toFixed(2);

// ─── Alta: solo lo indispensable ────────────────────────────────────────────

const crearSchema = z.object({
  nombre: textoReq(150, 'Escribí el nombre o la descripción del bien.'),
  fechaIncorporacion: ymdReq('La fecha de incorporación no es válida.'),
  tipoBien: textoOpc(80),
  formaAdquisicion: enumOpc(
    VALORES(FORMAS_ADQUISICION),
    'Elegí una forma de adquisición de la lista.',
  ),
});

/**
 * Da de alta un bien con lo mínimo. El número de ID es un next number automático por club; el
 * resto de los datos se completa por solapas.
 */
export async function crearBienAction(
  input: z.input<typeof crearSchema>,
): Promise<ResultadoCrearBien> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };

  const parsed = crearSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;

  for (let intento = 0; intento < 5; intento++) {
    try {
      const id = await db.transaction(async (tx) => {
        const [fila] = await tx
          .select({ ultimo: max(bienesUso.numero) })
          .from(bienesUso)
          .where(eq(bienesUso.guarderiaId, c.gId));
        const [nuevo] = await tx
          .insert(bienesUso)
          .values({
            guarderiaId: c.gId,
            numero: (fila?.ultimo ?? 0) + 1,
            fechaIncorporacion: d.fechaIncorporacion,
            fechaInicioAmortizacion: d.fechaIncorporacion,
            nombre: d.nombre,
            tipoBien: d.tipoBien,
            formaAdquisicion: d.formaAdquisicion,
            createdBy: c.userId,
            updatedBy: c.userId,
          })
          .returning({ id: bienesUso.id });
        return nuevo.id;
      });
      revalidar();
      return { id };
    } catch (e) {
      // Dos altas al mismo tiempo tomaron el mismo número: se reintenta con el siguiente.
      if (
        e instanceof Error &&
        `${e.message} ${(e as { cause?: Error }).cause?.message ?? ''}`.includes(
          'bienes_uso_numero_unico',
        )
      ) {
        continue;
      }
      return { error: 'No se pudo crear el bien de uso.' };
    }
  }
  return { error: 'Se cargaron varios bienes al mismo tiempo. Intentá de nuevo.' };
}

// ─── Solapa: datos generales ────────────────────────────────────────────────

const generalesSchema = z.object({
  fechaIncorporacion: ymdReq('La fecha de incorporación no es válida.'),
  estado: enumReq(VALORES(ESTADOS_BIEN), 'Elegí un estado de la lista.'),
  estadoDetalle: textoOpc(120),
  formaAdquisicion: enumOpc(
    VALORES(FORMAS_ADQUISICION),
    'Elegí una forma de adquisición de la lista.',
  ),
  vidaUtilAnios: enumOpc(VALORES(VIDAS_UTILES), 'Elegí una vida útil de la lista.'),
  tipoBien: textoOpc(80),
  rubro: textoOpc(80),
  subrubro: textoOpc(80),
  nroGuarderia: textoOpc(30),
  nombre: textoReq(150, 'Escribí el nombre o la descripción del bien.'),
  marca: textoOpc(80),
  nroSerie: textoOpc(80),
  anioFabricacion: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z
      .number({ message: 'El año de fabricación no es válido.' })
      .int('El año de fabricación no es válido.')
      .min(1900, 'El año de fabricación no es válido.')
      .max(2100, 'El año de fabricación no es válido.')
      .nullable(),
  ),
  patente: textoOpc(20),
  ubicaciones: listaTextos(20, 80),
  lugaresUtilizacion: listaTextos(20, 80),
  autorizados: z.array(uuid).max(100).default([]),
  seguroAseguradora: textoOpc(80),
  seguroPoliza: textoOpc(60),
  seguroVencimiento: ymdOpc('El vencimiento del seguro no es válido.'),
  seguroDetalle: textoOpc(300),
  notas: textoOpc(2000),
});

export async function actualizarGeneralesAction(
  id: string,
  input: z.input<typeof generalesSchema>,
): Promise<ResultadoBien> {
  const r = await conBien(id);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const parsed = generalesSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { autorizados, vidaUtilAnios, ...d } = parsed.data;

  // Un bien dado de baja sigue Inactivo hasta que se lo reactive (desde "Baja del bien").
  if (b.fechaBaja && d.estado !== 'inactivo') {
    return { error: 'Este bien está dado de baja. Para cambiarle el estado, reactivalo primero.' };
  }
  if (b.fechaBaja && d.fechaIncorporacion > b.fechaBaja) {
    return { error: 'La fecha de incorporación no puede ser posterior a la fecha de baja.' };
  }

  // Los empleados autorizados tienen que ser legajos de ESTE club.
  const validos = autorizados.length
    ? await db
        .select({ id: empleados.id })
        .from(empleados)
        .where(and(eq(empleados.guarderiaId, c.gId), inArray(empleados.id, autorizados)))
    : [];
  if (validos.length !== new Set(autorizados).size) {
    return { error: 'Uno de los empleados autorizados no es personal de este club.' };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(bienesUso)
        .set({
          ...d,
          vidaUtilAnios: vidaUtilAnios ? Number(vidaUtilAnios) : null,
          updatedBy: c.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(bienesUso.id, b.id), eq(bienesUso.guarderiaId, c.gId)));
      await tx
        .delete(bienUsoEmpleados)
        .where(
          and(
            eq(bienUsoEmpleados.bienId, b.id),
            eq(bienUsoEmpleados.guarderiaId, c.gId),
            eq(bienUsoEmpleados.rol, 'autorizado'),
          ),
        );
      if (validos.length > 0) {
        await tx.insert(bienUsoEmpleados).values(
          validos.map((v) => ({
            bienId: b.id,
            empleadoId: v.id,
            guarderiaId: c.gId,
            rol: 'autorizado' as const,
          })),
        );
      }
    });
  } catch {
    return { error: 'No se pudieron guardar los datos del bien.' };
  }
  revalidar(b.id);
  return {};
}

// ─── Horario de utilización ─────────────────────────────────────────────────

const hora = z.string().transform((v, ctx) => {
  const n = normalizarHora(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'Una de las horas no es válida (usá HH:MM).' });
  return n ?? '';
});

const horarioSchema = z.object({
  /** Botón "No aplica": el bien no tiene horario de utilización. */
  noAplica: z.boolean(),
  tramos: z
    .array(z.object({ dia: z.number().int().min(1).max(7), desde: hora, hasta: hora }))
    .max(30, 'Son demasiados tramos horarios.'),
});

export async function guardarHorarioBienAction(
  id: string,
  input: z.input<typeof horarioSchema>,
): Promise<ResultadoBien> {
  const r = await conBien(id);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const parsed = horarioSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { noAplica, tramos } = parsed.data;
  for (const t of tramos) {
    if (t.desde === t.hasta)
      return { error: 'La hora desde y la hora hasta no pueden ser iguales.' };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(bienUsoHorarios)
      .where(and(eq(bienUsoHorarios.bienId, b.id), eq(bienUsoHorarios.guarderiaId, c.gId)));
    if (!noAplica && tramos.length > 0) {
      await tx
        .insert(bienUsoHorarios)
        .values(tramos.map((t) => ({ ...t, bienId: b.id, guarderiaId: c.gId })));
    }
    await tx
      .update(bienesUso)
      .set({ horarioNoAplica: noAplica, updatedBy: c.userId, updatedAt: new Date() })
      .where(and(eq(bienesUso.id, b.id), eq(bienesUso.guarderiaId, c.gId)));
  });
  revalidar(b.id);
  return {};
}

// ─── Comprobante del seguro ─────────────────────────────────────────────────

/** Sube (o reemplaza) el comprobante del seguro. Campos del FormData: `bienId` y `file`. */
export async function subirComprobanteSeguroAction(formData: FormData): Promise<ResultadoBien> {
  const r = await conBien(String(formData.get('bienId') ?? ''));
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const archivo = await validarArchivo(formData.get('file'));
  if (!archivo) return { error: 'Elegí el archivo a adjuntar.' };
  if ('error' in archivo) return { error: archivo.error };

  const sub = await subirArchivo('bienes', c.gId, b.id, archivo);
  if ('error' in sub) return { error: sub.error };
  try {
    await db
      .update(bienesUso)
      .set({
        seguroArchivoPath: sub.path,
        seguroArchivoNombre: archivo.nombre,
        updatedBy: c.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(bienesUso.id, b.id), eq(bienesUso.guarderiaId, c.gId)));
  } catch {
    await borrarArchivo(sub.path);
    return { error: 'No se pudo guardar el archivo.' };
  }
  await borrarArchivo(b.seguroArchivoPath);
  revalidar(b.id);
  return {};
}

export async function quitarComprobanteSeguroAction(id: string): Promise<ResultadoBien> {
  const r = await conBien(id);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;
  if (!b.seguroArchivoPath) return {};
  await db
    .update(bienesUso)
    .set({ seguroArchivoPath: null, seguroArchivoNombre: null, updatedAt: new Date() })
    .where(and(eq(bienesUso.id, b.id), eq(bienesUso.guarderiaId, c.gId)));
  await borrarArchivo(b.seguroArchivoPath);
  revalidar(b.id);
  return {};
}

// ─── Solapa: datos contables (amortización) ─────────────────────────────────

const contablesSchema = z.object({
  valorOrigen: importe('El valor de origen no es válido.'),
  moneda: enumReq(VALORES(MONEDAS), 'Elegí una moneda de la lista.'),
  fechaInicioAmortizacion: ymdOpc('La fecha de inicio de la amortización no es válida.'),
  valorResidual: importe('El valor residual no es válido.'),
});

export async function actualizarContablesAction(
  id: string,
  input: z.input<typeof contablesSchema>,
): Promise<ResultadoBien> {
  const r = await conBien(id);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const parsed = contablesSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;
  const residual = d.valorResidual ?? 0;
  if (d.valorOrigen !== null && residual > d.valorOrigen) {
    return { error: 'El valor residual no puede ser mayor que el valor de origen.' };
  }
  if (d.valorOrigen === null && residual > 0) {
    return { error: 'Para cargar un valor residual, cargá primero el valor de origen.' };
  }

  await db
    .update(bienesUso)
    .set({
      valorOrigen: d.valorOrigen === null ? null : dosDecimales(d.valorOrigen),
      moneda: d.moneda,
      fechaInicioAmortizacion: d.fechaInicioAmortizacion,
      valorResidual: dosDecimales(residual),
      updatedBy: c.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(bienesUso.id, b.id), eq(bienesUso.guarderiaId, c.gId)));
  revalidar(b.id);
  return {};
}

// ─── Mantenimiento: avisos y responsables ───────────────────────────────────

const configMantenimientoSchema = z.object({
  emails: z
    .array(z.string().trim().toLowerCase().max(120))
    .max(10, 'Se pueden cargar hasta 10 correos.'),
  responsables: z.array(uuid).max(100).default([]),
});

/** Correos a los que llegan los avisos de los planes preventivos y responsables de mantenimiento. */
export async function actualizarConfigMantenimientoAction(
  id: string,
  input: z.input<typeof configMantenimientoSchema>,
): Promise<ResultadoBien> {
  const r = await conBien(id);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const parsed = configMantenimientoSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const emails = [...new Set(parsed.data.emails.filter(Boolean))];
  const malo = emails.find((e) => !esEmailValido(e));
  if (malo) return { error: `El correo “${malo}” no es válido.` };

  const ids = [...new Set(parsed.data.responsables)];
  const validos = ids.length
    ? await db
        .select({ id: empleados.id })
        .from(empleados)
        .where(and(eq(empleados.guarderiaId, c.gId), inArray(empleados.id, ids)))
    : [];
  if (validos.length !== ids.length) {
    return { error: 'Uno de los responsables no es personal de este club.' };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(bienesUso)
      .set({ mantenimientoEmails: emails, updatedBy: c.userId, updatedAt: new Date() })
      .where(and(eq(bienesUso.id, b.id), eq(bienesUso.guarderiaId, c.gId)));
    await tx
      .delete(bienUsoEmpleados)
      .where(
        and(
          eq(bienUsoEmpleados.bienId, b.id),
          eq(bienUsoEmpleados.guarderiaId, c.gId),
          eq(bienUsoEmpleados.rol, ROLES_EMPLEADO_BIEN[1]),
        ),
      );
    if (validos.length > 0) {
      await tx.insert(bienUsoEmpleados).values(
        validos.map((v) => ({
          bienId: b.id,
          empleadoId: v.id,
          guarderiaId: c.gId,
          rol: 'mantenimiento' as const,
        })),
      );
    }
  });
  revalidar(b.id);
  return {};
}

// ─── Baja y reactivación ────────────────────────────────────────────────────

const bajaSchema = z.object({
  fechaBaja: ymdReq('La fecha de baja no es válida.'),
  motivoBaja: textoReq(80, 'Elegí el motivo de la baja.'),
  motivoBajaDetalle: textoOpc(500),
});

/**
 * Da de baja un bien: queda Inactivo, con fecha y motivo (de la lista, más un texto libre), y
 * la amortización deja de correr desde ese mes. El bien y su historial se conservan.
 */
export async function darDeBajaBienAction(
  id: string,
  input: z.input<typeof bajaSchema>,
): Promise<ResultadoBien> {
  const r = await conBien(id);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const parsed = bajaSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;
  if (d.fechaBaja < b.fechaIncorporacion) {
    return { error: 'La fecha de baja no puede ser anterior a la fecha de incorporación.' };
  }
  if (d.fechaBaja > todayArg()) return { error: 'La fecha de baja no puede ser futura.' };

  await db
    .update(bienesUso)
    .set({ ...d, estado: 'inactivo', updatedBy: c.userId, updatedAt: new Date() })
    .where(and(eq(bienesUso.id, b.id), eq(bienesUso.guarderiaId, c.gId)));
  revalidar(b.id);
  return {};
}

export async function reactivarBienAction(id: string): Promise<ResultadoBien> {
  const r = await conBien(id);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  await db
    .update(bienesUso)
    .set({
      estado: 'activo',
      fechaBaja: null,
      motivoBaja: null,
      motivoBajaDetalle: null,
      updatedBy: c.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(bienesUso.id, b.id), eq(bienesUso.guarderiaId, c.gId)));
  revalidar(b.id);
  return {};
}

/**
 * Elimina un bien cargado por error. Si ya tiene mantenimientos, reparaciones, fallas o
 * inspecciones no se puede borrar (se perdería el historial): hay que darlo de baja.
 */
export async function eliminarBienAction(id: string): Promise<ResultadoBien> {
  const r = await conBien(id);
  if ('error' in r) return { error: r.error };
  const { c, b } = r;

  const tiene = await Promise.all([
    db
      .select({ id: bienUsoPlanes.id })
      .from(bienUsoPlanes)
      .where(eq(bienUsoPlanes.bienId, b.id))
      .limit(1),
    db
      .select({ id: bienUsoIntervenciones.id })
      .from(bienUsoIntervenciones)
      .where(eq(bienUsoIntervenciones.bienId, b.id))
      .limit(1),
    db
      .select({ id: bienUsoFallas.id })
      .from(bienUsoFallas)
      .where(eq(bienUsoFallas.bienId, b.id))
      .limit(1),
    db
      .select({ id: bienUsoInspecciones.id })
      .from(bienUsoInspecciones)
      .where(eq(bienUsoInspecciones.bienId, b.id))
      .limit(1),
  ]);
  if (tiene.some((t) => t.length > 0)) {
    return {
      error:
        'Este bien ya tiene registros de mantenimiento, reparaciones, fallas o inspecciones. En vez de eliminarlo, dalo de baja.',
    };
  }

  await db.delete(bienesUso).where(and(eq(bienesUso.id, b.id), eq(bienesUso.guarderiaId, c.gId)));
  await borrarArchivo(b.seguroArchivoPath);
  revalidar();
  return {};
}
