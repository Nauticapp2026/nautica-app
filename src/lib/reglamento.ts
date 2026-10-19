/**
 * Reglamento del club (mig 0170). Constantes compartidas entre el server action que
 * lo publica y la pantalla de Mi perfil.
 *
 * Módulo plano, sin 'use server' ni 'use client'.
 */

/** Bucket privado donde viven los PDF. El path es reglamentos/<guarderia_id>/<uuid>.pdf */
export const BUCKET_REGLAMENTO = 'documentos';

/** Solo PDF: es un documento legal que el socio tiene que poder leer igual en cualquier celular. */
export const MIME_REGLAMENTO = 'application/pdf';

// bodySizeLimit de next.config.ts es 10 MB; dejamos margen para el resto del form.
export const MAX_BYTES_REGLAMENTO = 8 * 1024 * 1024;

export const MAX_TITULO_REGLAMENTO = 120;
export const MAX_NOVEDADES_REGLAMENTO = 1000;
