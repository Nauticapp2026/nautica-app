/**
 * Piezas de validación (Zod) compartidas por los server actions del legajo.
 *
 * Módulo plano: los archivos 'use server' solo pueden exportar funciones async, así que
 * lo que se comparte entre acciones vive acá.
 */

import { z } from 'zod';

import { esFechaYmdValida } from '@/lib/documentacion-fechas';

/** Un campo vacío del formulario ('' o solo espacios) significa "sin dato". */
const vacioANull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const textoOpc = (max: number) =>
  z.preprocess(
    vacioANull,
    z.string().trim().max(max, `Puede tener hasta ${max} caracteres.`).nullable().default(null),
  );

export const textoReq = (max: number, msg: string) =>
  z.string().trim().min(1, msg).max(max, `Puede tener hasta ${max} caracteres.`);

export const ymdReq = (msg = 'La fecha no es válida.') => z.string().refine(esFechaYmdValida, msg);

export const ymdOpc = (msg = 'La fecha no es válida.') =>
  z.preprocess(vacioANull, ymdReq(msg).nullable().default(null));

export const uuid = z.string().uuid('Dato inválido.');

export const uuidOpc = z.preprocess(vacioANull, uuid.nullable().default(null));

/** Valor de una lista desplegable: uno de los permitidos, o vacío. */
export const enumOpc = (valores: readonly string[], msg: string) =>
  z.preprocess(
    vacioANull,
    z
      .string()
      .refine((v) => valores.includes(v), msg)
      .nullable()
      .default(null),
  );

export const enumReq = (valores: readonly string[], msg: string) =>
  z.string().refine((v) => valores.includes(v), msg);

/** Lista de textos (sedes, bienes de uso…), sin vacíos ni repetidos. */
export const listaTextos = (max = 30, maxLen = 80) =>
  z
    .array(z.string().trim().min(1).max(maxLen))
    .max(max, `Se pueden elegir hasta ${max}.`)
    .default([])
    .transform((l) => [...new Set(l)]);

/** Primer mensaje de error de un resultado de Zod. */
export function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos inválidos.';
}

/** Año de una fecha 'YYYY-MM-DD'. */
export const anioDe = (ymd: string): number => Number(ymd.slice(0, 4));
