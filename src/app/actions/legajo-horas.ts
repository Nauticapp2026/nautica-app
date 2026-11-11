'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { empleadoHoras, empleadoHorarios } from '@/lib/db/schema';
import { contextoAdmin, esError } from '@/lib/auth/contexto-admin';
import { empleadoDelClub } from '@/lib/legajo/acceso';
import { NOVEDADES_HORA, TIPOS_HORA } from '@/lib/legajo/constantes';
import { enumReq, primerError, textoOpc, uuid, uuidOpc, ymdReq } from '@/lib/esquemas-comunes';
import { calcularHoras, normalizarHora } from '@/lib/legajo/validaciones';

export type ResultadoHoras = { error?: string };

async function conLegajo(id: string) {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error } as const;
  const e = await empleadoDelClub(id, c.gId);
  if (!e) return { error: 'No encontramos ese legajo.' } as const;
  return { c, e } as const;
}

function revalidar(id: string) {
  revalidatePath('/personal');
  revalidatePath(`/personal/${id}`);
}

const TIPOS_HORA_VALORES = TIPOS_HORA.map((t) => t.value);
const NOVEDADES_VALORES = NOVEDADES_HORA.map((n) => n.value);

const hora = z.string().transform((v, ctx) => {
  const n = normalizarHora(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'Una de las horas no es válida (usá HH:MM).' });
  return n ?? '';
});

// ─── Horario laboral previsto ───────────────────────────────────────────────

const horariosSchema = z
  .array(
    z.object({
      dia: z.number().int().min(1).max(7),
      desde: hora,
      hasta: hora,
      tipoHora: enumReq(TIPOS_HORA_VALORES, 'Elegí el tipo de hora.'),
    }),
  )
  .max(40, 'Son demasiados tramos horarios.');

/**
 * Reemplaza el horario previsto del empleado: los días que trabaja, con su horario y si las
 * horas son normales, extras, adicionales, etc. Un día puede tener más de un tramo (turno
 * cortado). Un tramo que termina a la hora en que empezó o antes cruza la medianoche.
 */
export async function guardarHorariosAction(
  empleadoId: string,
  input: z.input<typeof horariosSchema>,
): Promise<ResultadoHoras> {
  const r = await conLegajo(empleadoId);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const parsed = horariosSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const filas = parsed.data;

  for (const f of filas) {
    if (f.desde === f.hasta)
      return { error: 'Un tramo no puede empezar y terminar a la misma hora.' };
  }
  // Tramos del mismo día que se pisan (sin contar los que cruzan la medianoche).
  const porDia = new Map<number, { d: string; h: string }[]>();
  for (const f of filas) {
    if (f.hasta <= f.desde) continue;
    porDia.set(f.dia, [...(porDia.get(f.dia) ?? []), { d: f.desde, h: f.hasta }]);
  }
  for (const tramos of porDia.values()) {
    const orden = [...tramos].sort((a, b) => a.d.localeCompare(b.d));
    for (let i = 1; i < orden.length; i++) {
      if (orden[i].d < orden[i - 1].h)
        return { error: 'Hay dos tramos del mismo día que se superponen.' };
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(empleadoHorarios)
      .where(and(eq(empleadoHorarios.empleadoId, e.id), eq(empleadoHorarios.guarderiaId, c.gId)));
    if (filas.length > 0) {
      await tx.insert(empleadoHorarios).values(
        filas.map((f) => ({
          guarderiaId: c.gId,
          empleadoId: e.id,
          dia: f.dia,
          desde: f.desde,
          hasta: f.hasta,
          tipoHora: f.tipoHora,
        })),
      );
    }
  });
  revalidar(e.id);
  return {};
}

// ─── Horas reales y novedades ───────────────────────────────────────────────

const horaRealSchema = z.object({
  id: uuidOpc,
  fecha: ymdReq('La fecha no es válida.'),
  novedad: enumReq(NOVEDADES_VALORES, 'Elegí la novedad.'),
  desde: z.string().default(''),
  hasta: z.string().default(''),
  tipoHora: enumReq(TIPOS_HORA_VALORES, 'Elegí el tipo de hora.'),
  nota: textoOpc(500),
});

/**
 * Carga (o edita, si viene `id`) las horas reales de un día. Un día trabajado lleva desde y
 * hasta; las demás novedades (enfermedad, licencia, vacaciones, ausencia, feriado) pueden ir
 * sin horario. Las horas se calculan solas.
 */
export async function guardarHoraAction(
  empleadoId: string,
  input: z.input<typeof horaRealSchema>,
): Promise<ResultadoHoras> {
  const r = await conLegajo(empleadoId);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const parsed = horaRealSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;
  if (d.fecha < e.fechaIngreso) {
    return { error: 'No se pueden cargar horas ni novedades anteriores a la fecha de ingreso.' };
  }
  if (e.fechaEgreso && d.fecha > e.fechaEgreso) {
    return { error: 'No se pueden cargar horas ni novedades posteriores a la fecha de egreso.' };
  }

  const tiene = d.desde.trim() !== '' || d.hasta.trim() !== '';
  let desde: string | null = null;
  let hasta: string | null = null;
  let horas = 0;
  if (d.novedad === 'trabajado' || tiene) {
    desde = normalizarHora(d.desde);
    hasta = normalizarHora(d.hasta);
    if (!desde || !hasta) {
      return {
        error:
          d.novedad === 'trabajado'
            ? 'Para un día trabajado completá la hora desde y la hora hasta (HH:MM).'
            : 'Completá las dos horas (HH:MM) o dejá las dos vacías.',
      };
    }
    if (desde === hasta) return { error: 'La hora desde y la hora hasta no pueden ser iguales.' };
    horas = d.novedad === 'trabajado' ? calcularHoras(desde, hasta) : 0;
  }

  const valores = {
    fecha: d.fecha,
    desde,
    hasta,
    horas: String(horas),
    tipoHora: d.tipoHora,
    novedad: d.novedad,
    nota: d.nota,
  };

  try {
    if (d.id) {
      const upd = await db
        .update(empleadoHoras)
        .set(valores)
        .where(
          and(
            eq(empleadoHoras.id, d.id),
            eq(empleadoHoras.empleadoId, e.id),
            eq(empleadoHoras.guarderiaId, c.gId),
          ),
        )
        .returning({ id: empleadoHoras.id });
      if (upd.length === 0) return { error: 'No encontramos ese registro.' };
    } else {
      await db
        .insert(empleadoHoras)
        .values({ ...valores, guarderiaId: c.gId, empleadoId: e.id, createdBy: c.userId });
    }
  } catch {
    return { error: 'No se pudo guardar el registro de horas.' };
  }
  revalidar(e.id);
  return {};
}

export async function eliminarHoraAction(empleadoId: string, id: string): Promise<ResultadoHoras> {
  const r = await conLegajo(empleadoId);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;
  if (!uuid.safeParse(id).success) return { error: 'Dato inválido.' };

  await db
    .delete(empleadoHoras)
    .where(
      and(
        eq(empleadoHoras.id, id),
        eq(empleadoHoras.empleadoId, e.id),
        eq(empleadoHoras.guarderiaId, c.gId),
      ),
    );
  revalidar(e.id);
  return {};
}
