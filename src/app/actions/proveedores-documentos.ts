'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { borrarArchivo, subirArchivo, validarArchivo } from '@/lib/archivos-privados';
import { contextoAdmin, esError } from '@/lib/auth/contexto-admin';
import { db } from '@/lib/db';
import { proveedorDocumentos, proveedores } from '@/lib/db/schema';
import { primerError, textoOpc, textoReq, uuid, uuidOpc, ymdOpc } from '@/lib/esquemas-comunes';
import {
  CLAVES_DOCUMENTO_FIJO,
  ROTULO_DOCUMENTO_FIJO,
  type ClaveDocumentoFijo,
} from '@/lib/proveedores/constantes';

export type ResultadoDocumentoProveedor = { error?: string };

const BOOL = (v: FormDataEntryValue | null) => v === 'true' || v === 'on' || v === '1';

function revalidar(id: string) {
  revalidatePath('/proveedores');
  revalidatePath(`/proveedores/${id}`);
}

async function conProveedor(id: string) {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error } as const;
  if (!uuid.safeParse(id).success) return { error: 'No encontramos ese proveedor.' } as const;
  const [p] = await db
    .select({ id: proveedores.id })
    .from(proveedores)
    .where(and(eq(proveedores.id, id), eq(proveedores.guarderiaId, c.gId)))
    .limit(1);
  if (!p) return { error: 'No encontramos ese proveedor.' } as const;
  return { c, p } as const;
}

const MAX_REQUISITOS = 60;

/**
 * Sube (o reemplaza) uno de los dos adjuntos fijos de la pestaña fiscal: el legajo impositivo
 * y el certificado de exclusión de retenciones. Campos del FormData: `proveedorId`, `clave`, `file`.
 */
export async function subirDocumentoFijoAction(
  formData: FormData,
): Promise<ResultadoDocumentoProveedor> {
  const r = await conProveedor(String(formData.get('proveedorId') ?? ''));
  if ('error' in r) return { error: r.error };
  const { c, p } = r;

  const clave = String(formData.get('clave') ?? '') as ClaveDocumentoFijo;
  if (!(CLAVES_DOCUMENTO_FIJO as readonly string[]).includes(clave)) {
    return { error: 'Tipo de documento inválido.' };
  }
  const archivo = await validarArchivo(formData.get('file'));
  if (!archivo) return { error: 'Elegí el archivo a adjuntar.' };
  if ('error' in archivo) return { error: archivo.error };

  const [previo] = await db
    .select({ id: proveedorDocumentos.id, path: proveedorDocumentos.archivoPath })
    .from(proveedorDocumentos)
    .where(and(eq(proveedorDocumentos.proveedorId, p.id), eq(proveedorDocumentos.clave, clave)))
    .limit(1);

  const sub = await subirArchivo('proveedores', c.gId, p.id, archivo);
  if ('error' in sub) return { error: sub.error };

  try {
    if (previo) {
      await db
        .update(proveedorDocumentos)
        .set({
          archivoPath: sub.path,
          archivoNombre: archivo.nombre,
          presentado: true,
          updatedAt: new Date(),
        })
        .where(
          and(eq(proveedorDocumentos.id, previo.id), eq(proveedorDocumentos.guarderiaId, c.gId)),
        );
    } else {
      await db.insert(proveedorDocumentos).values({
        guarderiaId: c.gId,
        proveedorId: p.id,
        clave,
        requisito: ROTULO_DOCUMENTO_FIJO[clave],
        obligatorio: false,
        presentado: true,
        archivoPath: sub.path,
        archivoNombre: archivo.nombre,
      });
    }
  } catch {
    await borrarArchivo(sub.path);
    return { error: 'No se pudo guardar el archivo.' };
  }
  if (previo?.path) await borrarArchivo(previo.path);
  revalidar(p.id);
  return {};
}

const requisitoSchema = z.object({
  id: uuidOpc,
  requisito: textoReq(150, 'Escribí qué documento debe presentar el proveedor.'),
  obligatorio: z.boolean(),
  presentado: z.boolean(),
  vencimiento: ymdOpc('La fecha de vencimiento no es válida.'),
  notas: textoOpc(500),
});

/**
 * Alta o edición de un requisito que el proveedor debe presentar para ingresar a trabajar al
 * recinto. Campos del FormData: `proveedorId`, `id` (si edita), `requisito`, `obligatorio`,
 * `presentado`, `vencimiento`, `notas` y `file` (opcional: si viene, reemplaza al anterior y
 * deja el requisito como presentado).
 */
export async function guardarRequisitoAction(
  formData: FormData,
): Promise<ResultadoDocumentoProveedor> {
  const r = await conProveedor(String(formData.get('proveedorId') ?? ''));
  if ('error' in r) return { error: r.error };
  const { c, p } = r;

  const parsed = requisitoSchema.safeParse({
    id: formData.get('id') ?? '',
    requisito: formData.get('requisito') ?? '',
    obligatorio: BOOL(formData.get('obligatorio')),
    presentado: BOOL(formData.get('presentado')),
    vencimiento: formData.get('vencimiento') ?? '',
    notas: formData.get('notas') ?? '',
  });
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { id: docId, ...d } = parsed.data;

  const archivo = await validarArchivo(formData.get('file'));
  if (archivo && 'error' in archivo) return { error: archivo.error };
  let path: string | null = null;
  if (archivo) {
    const sub = await subirArchivo('proveedores', c.gId, p.id, archivo);
    if ('error' in sub) return { error: sub.error };
    path = sub.path;
  }
  const presentado = d.presentado || !!archivo;

  let anterior: string | null = null;
  try {
    if (docId) {
      const [previo] = await db
        .select({ path: proveedorDocumentos.archivoPath })
        .from(proveedorDocumentos)
        .where(
          and(
            eq(proveedorDocumentos.id, docId),
            eq(proveedorDocumentos.proveedorId, p.id),
            eq(proveedorDocumentos.guarderiaId, c.gId),
            isNull(proveedorDocumentos.clave),
          ),
        )
        .limit(1);
      if (!previo) {
        await borrarArchivo(path);
        return { error: 'No encontramos ese requisito.' };
      }
      anterior = previo.path;
      await db
        .update(proveedorDocumentos)
        .set({
          ...d,
          presentado,
          ...(path && archivo && !('error' in archivo)
            ? { archivoPath: path, archivoNombre: archivo.nombre }
            : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(proveedorDocumentos.id, docId), eq(proveedorDocumentos.guarderiaId, c.gId)));
    } else {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(proveedorDocumentos)
        .where(and(eq(proveedorDocumentos.proveedorId, p.id), isNull(proveedorDocumentos.clave)));
      if (n >= MAX_REQUISITOS) {
        await borrarArchivo(path);
        return { error: `Se pueden cargar hasta ${MAX_REQUISITOS} requisitos por proveedor.` };
      }
      await db.insert(proveedorDocumentos).values({
        ...d,
        presentado,
        guarderiaId: c.gId,
        proveedorId: p.id,
        archivoPath: path,
        archivoNombre: archivo && !('error' in archivo) ? archivo.nombre : null,
      });
    }
  } catch {
    await borrarArchivo(path);
    return { error: 'No se pudo guardar el requisito.' };
  }
  if (path && anterior) await borrarArchivo(anterior);
  revalidar(p.id);
  return {};
}

/** Quita el archivo adjunto. En los adjuntos fijos borra el registro; en un requisito lo deja sin archivo. */
export async function quitarArchivoDocumentoAction(
  proveedorId: string,
  docId: string,
): Promise<ResultadoDocumentoProveedor> {
  const r = await conProveedor(proveedorId);
  if ('error' in r) return { error: r.error };
  const { c, p } = r;
  if (!uuid.safeParse(docId).success) return { error: 'Dato inválido.' };

  const [doc] = await db
    .select()
    .from(proveedorDocumentos)
    .where(
      and(
        eq(proveedorDocumentos.id, docId),
        eq(proveedorDocumentos.proveedorId, p.id),
        eq(proveedorDocumentos.guarderiaId, c.gId),
      ),
    )
    .limit(1);
  if (!doc) return { error: 'No encontramos ese documento.' };

  if (doc.clave) {
    await db.delete(proveedorDocumentos).where(eq(proveedorDocumentos.id, doc.id));
  } else {
    await db
      .update(proveedorDocumentos)
      .set({ archivoPath: null, archivoNombre: null, updatedAt: new Date() })
      .where(eq(proveedorDocumentos.id, doc.id));
  }
  await borrarArchivo(doc.archivoPath);
  revalidar(p.id);
  return {};
}

export async function eliminarRequisitoAction(
  proveedorId: string,
  docId: string,
): Promise<ResultadoDocumentoProveedor> {
  const r = await conProveedor(proveedorId);
  if ('error' in r) return { error: r.error };
  const { c, p } = r;
  if (!uuid.safeParse(docId).success) return { error: 'Dato inválido.' };

  const [doc] = await db
    .select({ id: proveedorDocumentos.id, path: proveedorDocumentos.archivoPath })
    .from(proveedorDocumentos)
    .where(
      and(
        eq(proveedorDocumentos.id, docId),
        eq(proveedorDocumentos.proveedorId, p.id),
        eq(proveedorDocumentos.guarderiaId, c.gId),
        isNull(proveedorDocumentos.clave),
      ),
    )
    .limit(1);
  if (!doc) return { error: 'No encontramos ese requisito.' };

  await db.delete(proveedorDocumentos).where(eq(proveedorDocumentos.id, doc.id));
  await borrarArchivo(doc.path);
  revalidar(p.id);
  return {};
}
