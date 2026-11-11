'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import {
  empleadoDocumentos,
  empleadoLicencias,
  empleadoVacacionesAnuales,
  empleadoVacacionesTomadas,
  empleados,
  memberships,
} from '@/lib/db/schema';
import { borrarArchivo, subirArchivo, validarArchivo } from '@/lib/archivos-privados';
import { contextoAdmin, esError } from '@/lib/auth/contexto-admin';
import { empleadoDelClub } from '@/lib/legajo/acceso';
import { ROLES_ADMIN_LICENCIA, TIPOS_DOCUMENTO_LEGAJO } from '@/lib/legajo/constantes';
import { anioDe, primerError, textoOpc, uuid, ymdOpc, ymdReq } from '@/lib/esquemas-comunes';
import { diasCorridos } from '@/lib/legajo/validaciones';

export type ResultadoDocumento = { error?: string };

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

const BOOL = (v: FormDataEntryValue | null) => v === 'true' || v === 'on' || v === '1';

// ─── Documentación del legajo (un registro por tipo) ────────────────────────

/**
 * Carga o actualiza un documento del legajo: el archivo adjunto (opcional), la casilla "Posee"
 * y el vencimiento. Si viene un archivo nuevo, reemplaza al anterior. Campos del FormData:
 * `empleadoId`, `tipo`, `file`, `posee` ('true' | 'false'), `vencimiento` ('' la borra) y
 * `actualizarCampos` ('true' cuando se están enviando posee y vencimiento).
 */
export async function guardarDocumentoLegajoAction(
  formData: FormData,
): Promise<ResultadoDocumento> {
  const r = await conLegajo(String(formData.get('empleadoId') ?? ''));
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const tipo = String(formData.get('tipo') ?? '');
  if (!TIPOS_DOCUMENTO_LEGAJO.includes(tipo)) return { error: 'Tipo de documento inválido.' };

  const actualizarCampos = BOOL(formData.get('actualizarCampos'));
  const poseeIn = BOOL(formData.get('posee'));
  const venc = ymdOpc('La fecha de vencimiento no es válida.').safeParse(
    formData.get('vencimiento') ?? '',
  );
  if (!venc.success) return { error: primerError(venc.error) };

  const archivo = await validarArchivo(formData.get('file'));
  if (archivo && 'error' in archivo) return { error: archivo.error };

  const [previo] = await db
    .select()
    .from(empleadoDocumentos)
    .where(and(eq(empleadoDocumentos.empleadoId, e.id), eq(empleadoDocumentos.tipo, tipo)))
    .limit(1);

  let nuevoPath: string | null = null;
  let nuevoNombre: string | null = null;
  if (archivo) {
    const sub = await subirArchivo('legajos', c.gId, e.id, archivo);
    if ('error' in sub) return { error: sub.error };
    nuevoPath = sub.path;
    nuevoNombre = archivo.nombre;
  }

  // Si el documento ya existe, los campos que no se envían se conservan. Un archivo nuevo
  // también marca "Posee": tener el archivo es tener el documento.
  const posee = actualizarCampos
    ? poseeIn || !!nuevoPath || !!previo?.archivoPath
    : (previo?.posee ?? !!nuevoPath);
  const vencimiento = actualizarCampos ? venc.data : (previo?.vencimiento ?? null);

  try {
    await db
      .insert(empleadoDocumentos)
      .values({
        guarderiaId: c.gId,
        empleadoId: e.id,
        tipo,
        posee,
        vencimiento,
        archivoPath: nuevoPath ?? previo?.archivoPath ?? null,
        archivoNombre: nuevoNombre ?? previo?.archivoNombre ?? null,
      })
      .onConflictDoUpdate({
        target: [empleadoDocumentos.empleadoId, empleadoDocumentos.tipo],
        set: {
          posee,
          vencimiento,
          ...(nuevoPath ? { archivoPath: nuevoPath, archivoNombre: nuevoNombre } : {}),
          updatedAt: new Date(),
        },
      });
  } catch {
    // El archivo recién subido queda huérfano si la fila no se pudo escribir.
    await borrarArchivo(nuevoPath);
    return { error: 'No se pudo guardar el documento.' };
  }

  // El archivo anterior ya no se referencia.
  if (nuevoPath && previo?.archivoPath) await borrarArchivo(previo.archivoPath);
  revalidar(e.id);
  return {};
}

/** Quita solamente el archivo adjunto de un documento (la fila y sus datos quedan). */
export async function quitarArchivoDocumentoLegajoAction(
  empleadoId: string,
  tipo: string,
): Promise<ResultadoDocumento> {
  const r = await conLegajo(empleadoId);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;
  if (!TIPOS_DOCUMENTO_LEGAJO.includes(tipo)) return { error: 'Tipo de documento inválido.' };

  const [previo] = await db
    .select()
    .from(empleadoDocumentos)
    .where(and(eq(empleadoDocumentos.empleadoId, e.id), eq(empleadoDocumentos.tipo, tipo)))
    .limit(1);
  if (!previo?.archivoPath) return {};

  await db
    .update(empleadoDocumentos)
    .set({ archivoPath: null, archivoNombre: null, updatedAt: new Date() })
    .where(and(eq(empleadoDocumentos.id, previo.id), eq(empleadoDocumentos.guarderiaId, c.gId)));
  await borrarArchivo(previo.archivoPath);
  revalidar(e.id);
  return {};
}

// ─── Licencias (historial) ──────────────────────────────────────────────────

const licenciaSchema = z.object({
  tipo: z.string().trim().min(1, 'Elegí el tipo de licencia.').max(120),
  fechaAlta: ymdReq('La fecha de alta de la licencia no es válida.'),
  fechaIncorporacion: ymdOpc('La fecha de incorporación no es válida.'),
  motivo: textoOpc(1000),
  /** 'empleado:<uuid>' | 'usuario:<uuid>' | '' */
  aprobador: z.string().default(''),
});

/** Resuelve quién aprueba: un legajo del club, o un admin del club. Devuelve los dos ids. */
async function resolverAprobador(gId: string, valor: string) {
  if (!valor) return { ok: true as const, empleadoId: null, profileId: null };
  const [tipo, id] = valor.split(':');
  if (!uuid.safeParse(id).success)
    return { ok: false as const, error: 'El aprobador no es válido.' };
  if (tipo === 'empleado') {
    const [x] = await db
      .select({ id: empleados.id })
      .from(empleados)
      .where(and(eq(empleados.id, id), eq(empleados.guarderiaId, gId)))
      .limit(1);
    if (!x) return { ok: false as const, error: 'El aprobador no es del personal de este club.' };
    return { ok: true as const, empleadoId: id, profileId: null };
  }
  if (tipo === 'usuario') {
    const [m] = await db
      .select({ id: memberships.id, rol: memberships.rol })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, id),
          eq(memberships.guarderiaId, gId),
          eq(memberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!m || !(ROLES_ADMIN_LICENCIA as readonly string[]).includes(m.rol)) {
      return { ok: false as const, error: 'El aprobador no es un administrador de este club.' };
    }
    return { ok: true as const, empleadoId: null, profileId: id };
  }
  return { ok: false as const, error: 'El aprobador no es válido.' };
}

/**
 * Da de alta una licencia (varias por empleado, queda el historial). Campos del FormData:
 * `empleadoId`, `tipo`, `fechaAlta`, `fechaIncorporacion`, `motivo`, `aprobador` y `certificado`.
 */
export async function crearLicenciaAction(formData: FormData): Promise<ResultadoDocumento> {
  const r = await conLegajo(String(formData.get('empleadoId') ?? ''));
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const parsed = licenciaSchema.safeParse({
    tipo: formData.get('tipo') ?? '',
    fechaAlta: formData.get('fechaAlta') ?? '',
    fechaIncorporacion: formData.get('fechaIncorporacion') ?? '',
    motivo: formData.get('motivo') ?? '',
    aprobador: String(formData.get('aprobador') ?? ''),
  });
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;
  if (d.fechaIncorporacion && d.fechaIncorporacion < d.fechaAlta) {
    return { error: 'La fecha de incorporación no puede ser anterior al alta de la licencia.' };
  }

  const aprobador = await resolverAprobador(c.gId, d.aprobador);
  if (!aprobador.ok) return { error: aprobador.error };

  const archivo = await validarArchivo(formData.get('certificado'));
  if (archivo && 'error' in archivo) return { error: archivo.error };
  let path: string | null = null;
  if (archivo) {
    const sub = await subirArchivo('legajos', c.gId, e.id, archivo);
    if ('error' in sub) return { error: sub.error };
    path = sub.path;
  }

  try {
    await db.insert(empleadoLicencias).values({
      guarderiaId: c.gId,
      empleadoId: e.id,
      tipo: d.tipo,
      fechaAlta: d.fechaAlta,
      fechaIncorporacion: d.fechaIncorporacion,
      motivo: d.motivo,
      certificadoPath: path,
      certificadoNombre: archivo && !('error' in archivo) ? archivo.nombre : null,
      aprobadorEmpleadoId: aprobador.empleadoId,
      aprobadorProfileId: aprobador.profileId,
      createdBy: c.userId,
    });
  } catch {
    await borrarArchivo(path);
    return { error: 'No se pudo guardar la licencia.' };
  }
  revalidar(e.id);
  return {};
}

/**
 * Edita una licencia ya cargada: sirve para registrar la reincorporación, corregir el motivo
 * o adjuntar el certificado. Campos: `empleadoId`, `licenciaId`, `fechaIncorporacion`,
 * `motivo`, `aprobador` y `certificado`.
 */
export async function actualizarLicenciaAction(formData: FormData): Promise<ResultadoDocumento> {
  const r = await conLegajo(String(formData.get('empleadoId') ?? ''));
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const licenciaId = String(formData.get('licenciaId') ?? '');
  if (!uuid.safeParse(licenciaId).success) return { error: 'Dato inválido.' };
  const [lic] = await db
    .select()
    .from(empleadoLicencias)
    .where(
      and(
        eq(empleadoLicencias.id, licenciaId),
        eq(empleadoLicencias.empleadoId, e.id),
        eq(empleadoLicencias.guarderiaId, c.gId),
      ),
    )
    .limit(1);
  if (!lic) return { error: 'No encontramos esa licencia.' };

  const parsed = licenciaSchema
    .pick({ fechaIncorporacion: true, motivo: true, aprobador: true })
    .safeParse({
      fechaIncorporacion: formData.get('fechaIncorporacion') ?? '',
      motivo: formData.get('motivo') ?? '',
      aprobador: String(formData.get('aprobador') ?? ''),
    });
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;
  if (d.fechaIncorporacion && d.fechaIncorporacion < lic.fechaAlta) {
    return { error: 'La fecha de incorporación no puede ser anterior al alta de la licencia.' };
  }
  const aprobador = await resolverAprobador(c.gId, d.aprobador);
  if (!aprobador.ok) return { error: aprobador.error };

  const archivo = await validarArchivo(formData.get('certificado'));
  if (archivo && 'error' in archivo) return { error: archivo.error };
  let path: string | null = null;
  if (archivo) {
    const sub = await subirArchivo('legajos', c.gId, e.id, archivo);
    if ('error' in sub) return { error: sub.error };
    path = sub.path;
  }

  try {
    await db
      .update(empleadoLicencias)
      .set({
        fechaIncorporacion: d.fechaIncorporacion,
        motivo: d.motivo,
        aprobadorEmpleadoId: aprobador.empleadoId,
        aprobadorProfileId: aprobador.profileId,
        ...(path && archivo && !('error' in archivo)
          ? { certificadoPath: path, certificadoNombre: archivo.nombre }
          : {}),
      })
      .where(and(eq(empleadoLicencias.id, lic.id), eq(empleadoLicencias.guarderiaId, c.gId)));
  } catch {
    await borrarArchivo(path);
    return { error: 'No se pudo actualizar la licencia.' };
  }
  if (path && lic.certificadoPath) await borrarArchivo(lic.certificadoPath);
  revalidar(e.id);
  return {};
}

export async function eliminarLicenciaAction(
  empleadoId: string,
  licenciaId: string,
): Promise<ResultadoDocumento> {
  const r = await conLegajo(empleadoId);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;
  if (!uuid.safeParse(licenciaId).success) return { error: 'Dato inválido.' };

  const [lic] = await db
    .select({ id: empleadoLicencias.id, path: empleadoLicencias.certificadoPath })
    .from(empleadoLicencias)
    .where(
      and(
        eq(empleadoLicencias.id, licenciaId),
        eq(empleadoLicencias.empleadoId, e.id),
        eq(empleadoLicencias.guarderiaId, c.gId),
      ),
    )
    .limit(1);
  if (!lic) return { error: 'No encontramos esa licencia.' };

  await db.delete(empleadoLicencias).where(eq(empleadoLicencias.id, lic.id));
  await borrarArchivo(lic.path);
  revalidar(e.id);
  return {};
}

// ─── Vacaciones ─────────────────────────────────────────────────────────────

const anualSchema = z.object({
  anio: z.number().int().min(2000).max(2100),
  diasTotales: z.number().int().min(0, 'Los días no pueden ser negativos.').max(366),
});

/** Días de vacaciones que le corresponden al empleado en un año. */
export async function guardarVacacionesAnualesAction(
  empleadoId: string,
  input: z.input<typeof anualSchema>,
): Promise<ResultadoDocumento> {
  const r = await conLegajo(empleadoId);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const parsed = anualSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { anio, diasTotales } = parsed.data;

  await db
    .insert(empleadoVacacionesAnuales)
    .values({ guarderiaId: c.gId, empleadoId: e.id, anio, diasTotales })
    .onConflictDoUpdate({
      target: [empleadoVacacionesAnuales.empleadoId, empleadoVacacionesAnuales.anio],
      set: { diasTotales },
    });
  revalidar(e.id);
  return {};
}

const tomadasSchema = z.object({
  desde: ymdReq('La fecha desde no es válida.'),
  hasta: ymdReq('La fecha hasta no es válida.'),
  /** Si no se informa, se cuentan los días corridos entre las dos fechas. */
  dias: z.number().int().min(1).max(366).nullish(),
  nota: textoOpc(500),
});

/** Registra un período de vacaciones tomado (con fecha desde y hasta). */
export async function agregarVacacionesTomadasAction(
  empleadoId: string,
  input: z.input<typeof tomadasSchema>,
): Promise<ResultadoDocumento> {
  const r = await conLegajo(empleadoId);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;

  const parsed = tomadasSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;
  if (d.hasta < d.desde) return { error: 'La fecha hasta no puede ser anterior a la fecha desde.' };

  // Un período que cruza de año se imputa al año en que empieza.
  await db.insert(empleadoVacacionesTomadas).values({
    guarderiaId: c.gId,
    empleadoId: e.id,
    anio: anioDe(d.desde),
    desde: d.desde,
    hasta: d.hasta,
    dias: d.dias ?? diasCorridos(d.desde, d.hasta),
    nota: d.nota,
  });
  revalidar(e.id);
  return {};
}

export async function eliminarVacacionesTomadasAction(
  empleadoId: string,
  id: string,
): Promise<ResultadoDocumento> {
  const r = await conLegajo(empleadoId);
  if ('error' in r) return { error: r.error };
  const { c, e } = r;
  if (!uuid.safeParse(id).success) return { error: 'Dato inválido.' };

  await db
    .delete(empleadoVacacionesTomadas)
    .where(
      and(
        eq(empleadoVacacionesTomadas.id, id),
        eq(empleadoVacacionesTomadas.empleadoId, e.id),
        eq(empleadoVacacionesTomadas.guarderiaId, c.gId),
      ),
    );
  revalidar(e.id);
  return {};
}
