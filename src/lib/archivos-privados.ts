/**
 * Adjuntos privados de los módulos de administración (solo servidor).
 *
 * Van al bucket privado `documentos`, bajo `<carpeta>/<club>/<dueño>/<uuid>.<ext>` (carpeta:
 * `legajos`, `proveedores`, `bienes`). Nunca se usa una URL pública: el admin los ve con un
 * link firmado de una hora. El formato se reconoce por los primeros bytes del archivo, no por
 * lo que declara el navegador.
 */

import { randomUUID } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

export const BUCKET_PRIVADO = 'documentos';
export const MAX_BYTES_ARCHIVO = 8 * 1024 * 1024;

export type CarpetaArchivos = 'legajos' | 'proveedores' | 'bienes';

type TipoArchivo = { mime: string; ext: string };

/** Reconoce el formato por los primeros bytes (no alcanza con el tipo que declara el navegador). */
function tipoPorFirma(b: Buffer): TipoArchivo | null {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-')
    return { mime: 'application/pdf', ext: 'pdf' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

export type ArchivoValidado = { buffer: Buffer; mime: string; ext: string; nombre: string };

/** Valida un adjunto (PDF o imagen, hasta 8 MB, por contenido real). null = no vino archivo. */
export async function validarArchivo(
  archivo: FormDataEntryValue | null,
): Promise<ArchivoValidado | { error: string } | null> {
  if (!(archivo instanceof File) || archivo.size === 0) return null;
  if (archivo.size > MAX_BYTES_ARCHIVO) {
    return { error: 'El archivo pesa más de 8 MB. Comprimilo e intentá de nuevo.' };
  }
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const tipo = tipoPorFirma(buffer);
  if (!tipo) return { error: 'Formato no soportado. Usá PDF, JPG, PNG o WebP.' };
  return { buffer, mime: tipo.mime, ext: tipo.ext, nombre: archivo.name.slice(0, 200) };
}

/** Sube el adjunto al bucket privado, bajo `<carpeta>/<club>/<dueño>/`. Devuelve el path. */
export async function subirArchivo(
  carpeta: CarpetaArchivos,
  gId: string,
  duenioId: string,
  archivo: ArchivoValidado,
): Promise<{ path: string } | { error: string }> {
  const path = `${carpeta}/${gId}/${duenioId}/${randomUUID()}.${archivo.ext}`;
  const { error } = await createAdminClient()
    .storage.from(BUCKET_PRIVADO)
    .upload(path, archivo.buffer, { contentType: archivo.mime, upsert: false });
  if (error) return { error: `No se pudo subir el archivo: ${error.message}` };
  return { path };
}

export async function borrarArchivo(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await createAdminClient()
    .storage.from(BUCKET_PRIVADO)
    .remove([path])
    .catch(() => null);
}

/** Links firmados de una hora para mostrar adjuntos al admin. */
export async function firmarArchivos(paths: (string | null)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const validos = [...new Set(paths.filter((p): p is string => !!p))];
  if (validos.length === 0) return out;
  const { data } = await createAdminClient()
    .storage.from(BUCKET_PRIVADO)
    .createSignedUrls(validos, 60 * 60);
  for (const f of data ?? []) {
    if (f.path && f.signedUrl) out.set(f.path, f.signedUrl);
  }
  return out;
}
