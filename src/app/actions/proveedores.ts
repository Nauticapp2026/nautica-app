'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, max, sql } from 'drizzle-orm';
import { z } from 'zod';

import { borrarArchivo } from '@/lib/archivos-privados';
import { contextoAdmin, esError } from '@/lib/auth/contexto-admin';
import { db } from '@/lib/db';
import {
  bienUsoIntervenciones,
  proveedorCuentasBancarias,
  proveedorDocumentos,
  proveedores,
} from '@/lib/db/schema';
import {
  enumOpc,
  enumReq,
  listaTextos,
  primerError,
  textoOpc,
  textoReq,
  uuid,
  uuidOpc,
  ymdOpc,
} from '@/lib/esquemas-comunes';
import { TIPOS_CUENTA } from '@/lib/legajo/constantes';
import { esEmailValido, validarCbu, validarCuil } from '@/lib/legajo/validaciones';
import {
  CONDICIONES_IIBB,
  CONDICIONES_IVA,
  ESTADOS_PROVEEDOR,
  MONEDAS,
  PAISES,
  RETENCIONES,
  TIPOS_SUJETO,
  codigoPorNumero,
} from '@/lib/proveedores/constantes';

export type ResultadoProveedor = { error?: string; aviso?: string };
export type ResultadoCrearProveedor = ResultadoProveedor & { id?: string };

const VALORES = (l: { value: string }[]) => l.map((o) => o.value);

function revalidar(id?: string) {
  revalidatePath('/proveedores');
  if (id) revalidatePath(`/proveedores/${id}`);
}

/** El proveedor si pertenece al club; null si no existe o es de otro club. */
async function proveedorDelClub(id: string, gId: string) {
  if (!uuid.safeParse(id).success) return null;
  const [p] = await db
    .select()
    .from(proveedores)
    .where(and(eq(proveedores.id, id), eq(proveedores.guarderiaId, gId)))
    .limit(1);
  return p ?? null;
}

async function conProveedor(id: string) {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error } as const;
  const p = await proveedorDelClub(id, c.gId);
  if (!p) return { error: 'No encontramos ese proveedor.' } as const;
  return { c, p } as const;
}

/** Traduce el error de la base por duplicados a un mensaje entendible. */
function mensajeDuplicado(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : '';
  const causa = (err as { cause?: { message?: string } } | null)?.cause?.message ?? '';
  const todo = `${msg} ${causa}`;
  if (todo.includes('proveedores_cuit_unico')) {
    return 'Ya hay un proveedor con ese CUIT en este club.';
  }
  if (todo.includes('proveedores_codigo_unico')) {
    return 'Ya hay un proveedor con ese código. Elegí otro.';
  }
  return null;
}

// ─── Alta: solo lo indispensable ────────────────────────────────────────────

const crearSchema = z.object({
  razonSocial: textoReq(150, 'Escribí la razón social o el nombre del proveedor.'),
  cuit: textoOpc(20),
  /** Proveedor del exterior: no tiene CUIT argentino. */
  exterior: z.boolean().default(false),
});

/**
 * Crea un proveedor con lo mínimo: razón social y CUIT (salvo proveedor del exterior). Todo
 * lo demás es opcional y se completa después por solapas, para no desalentar a los clubes
 * chicos. El código es correlativo por club (P-0001…) y se puede cambiar después.
 */
export async function crearProveedorAction(
  input: z.input<typeof crearSchema>,
): Promise<ResultadoCrearProveedor> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };

  const parsed = crearSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;

  let cuit: string | null = null;
  if (d.exterior) {
    cuit = d.cuit; // opcional, texto libre (id fiscal del exterior)
  } else {
    if (!d.cuit) return { error: 'Escribí el CUIT del proveedor.' };
    const v = validarCuil(d.cuit);
    if (!v.ok) return { error: v.error };
    cuit = v.valor;
  }

  for (let intento = 0; intento < 5; intento++) {
    try {
      const id = await db.transaction(async (tx) => {
        const [fila] = await tx
          .select({ ultimo: max(proveedores.numero) })
          .from(proveedores)
          .where(eq(proveedores.guarderiaId, c.gId));
        const numero = (fila?.ultimo ?? 0) + 1 + intento;
        const [nuevo] = await tx
          .insert(proveedores)
          .values({
            guarderiaId: c.gId,
            numero,
            codigo: codigoPorNumero(numero),
            nombre: d.razonSocial,
            cuit,
            condicionIva: d.exterior ? 'proveedor_exterior' : null,
            estado: 'activo',
            createdBy: c.userId,
            updatedBy: c.userId,
          })
          .returning({ id: proveedores.id });
        return nuevo.id;
      });
      revalidar();
      return { id };
    } catch (e) {
      const dup = mensajeDuplicado(e);
      if (dup && dup.includes('CUIT')) return { error: dup };
      // Número o código tomado por otra alta al mismo tiempo: se reintenta con el siguiente.
      if (dup || (e instanceof Error && e.message.includes('proveedores_numero_unico'))) continue;
      return { error: 'No se pudo crear el proveedor.' };
    }
  }
  return { error: 'Se cargaron varios proveedores al mismo tiempo. Intentá de nuevo.' };
}

// ─── Solapa: identificación y datos fiscales ────────────────────────────────

const porcentaje = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  z
    .number({ message: 'El porcentaje de exclusión no es válido.' })
    .min(0, 'El porcentaje de exclusión va de 0 a 100.')
    .max(100, 'El porcentaje de exclusión va de 0 a 100.')
    .nullable(),
);

const identificacionSchema = z.object({
  codigo: textoReq(30, 'Escribí el código del proveedor.'),
  nombre: textoReq(150, 'Escribí la razón social.'),
  nombreComercial: textoOpc(150),
  tipoSujeto: enumOpc(VALORES(TIPOS_SUJETO), 'Elegí un tipo de sujeto de la lista.'),
  areaSector: textoOpc(80),
  estado: enumReq(VALORES(ESTADOS_PROVEEDOR), 'Elegí el estado.'),
  cuit: textoOpc(20),
  condicionIva: enumOpc(VALORES(CONDICIONES_IVA), 'Elegí una condición frente al IVA de la lista.'),
  condicionIibb: enumOpc(VALORES(CONDICIONES_IIBB), 'Elegí una condición de Ingresos Brutos.'),
  actividades: listaTextos(20, 80),
  retenciones: z.array(enumReq(VALORES(RETENCIONES), 'Retención inválida.')).default([]),
  certificadoRetencion: z.boolean(),
  certRetDesde: ymdOpc('La fecha desde del certificado no es válida.'),
  certRetHasta: ymdOpc('La fecha hasta del certificado no es válida.'),
  certRetPorcentaje: porcentaje,
});

export async function actualizarIdentificacionAction(
  id: string,
  input: z.input<typeof identificacionSchema>,
): Promise<ResultadoProveedor> {
  const r = await conProveedor(id);
  if ('error' in r) return { error: r.error };
  const { c, p } = r;

  const parsed = identificacionSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;

  // CUIT: obligatorio salvo proveedor del exterior; con la condición "del exterior" es texto libre.
  const exterior = d.condicionIva === 'proveedor_exterior';
  let cuit: string | null = d.cuit;
  if (!exterior) {
    if (!d.cuit) return { error: 'El CUIT es obligatorio (salvo para un proveedor del exterior).' };
    const v = validarCuil(d.cuit);
    if (!v.ok) return { error: v.error };
    cuit = v.valor;
  }

  // Certificado de exclusión de retenciones: si lo tiene, pide vigencia y porcentaje.
  let desde = null as string | null;
  let hasta = null as string | null;
  let pct = null as number | null;
  if (d.certificadoRetencion) {
    if (!d.certRetDesde || !d.certRetHasta) {
      return { error: 'Con certificado de retenciones, completá la fecha desde y la fecha hasta.' };
    }
    if (d.certRetHasta < d.certRetDesde) {
      return { error: 'La fecha hasta del certificado no puede ser anterior a la fecha desde.' };
    }
    if (d.certRetPorcentaje === null) {
      return { error: 'Con certificado de retenciones, completá el porcentaje de exclusión.' };
    }
    desde = d.certRetDesde;
    hasta = d.certRetHasta;
    pct = d.certRetPorcentaje;
  }

  try {
    await db
      .update(proveedores)
      .set({
        codigo: d.codigo,
        nombre: d.nombre,
        nombreComercial: d.nombreComercial,
        tipoSujeto: d.tipoSujeto,
        areaSector: d.areaSector,
        estado: d.estado as 'activo' | 'inactivo',
        cuit,
        condicionIva: d.condicionIva as (typeof proveedores.$inferInsert)['condicionIva'],
        condicionIibb: d.condicionIibb as (typeof proveedores.$inferInsert)['condicionIibb'],
        actividades: d.actividades,
        retenciones: [...new Set(d.retenciones)],
        certificadoRetencion: d.certificadoRetencion,
        certRetDesde: desde,
        certRetHasta: hasta,
        certRetPorcentaje: pct === null ? null : String(pct),
        updatedBy: c.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(proveedores.id, p.id), eq(proveedores.guarderiaId, c.gId)));
  } catch (e) {
    return { error: mensajeDuplicado(e) ?? 'No se pudieron guardar los datos.' };
  }
  revalidar(p.id);
  return {};
}

// ─── Solapa: ubicación y contacto ───────────────────────────────────────────

const ubicacionSchema = z.object({
  dirFiscalCalle: textoOpc(150),
  dirFiscalNumero: textoOpc(20),
  dirFiscalInterior: textoOpc(30),
  dirComercialCalle: textoOpc(150),
  dirComercialNumero: textoOpc(20),
  dirComercialInterior: textoOpc(30),
  codigoPostal: textoOpc(12),
  ciudad: textoOpc(100),
  provincia: textoOpc(100),
  pais: enumReq(VALORES(PAISES), 'Elegí un país de la lista.'),
  contactoNombre: textoOpc(120),
  telefono: textoOpc(40),
  email: textoOpc(120),
  notas: textoOpc(2000),
});

export async function actualizarUbicacionContactoAction(
  id: string,
  input: z.input<typeof ubicacionSchema>,
): Promise<ResultadoProveedor> {
  const r = await conProveedor(id);
  if ('error' in r) return { error: r.error };
  const { c, p } = r;

  const parsed = ubicacionSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;
  if (d.email && !esEmailValido(d.email)) {
    return { error: 'El correo electrónico de facturación no es válido.' };
  }

  await db
    .update(proveedores)
    .set({ ...d, updatedBy: c.userId, updatedAt: new Date() })
    .where(and(eq(proveedores.id, p.id), eq(proveedores.guarderiaId, c.gId)));
  revalidar(p.id);
  return {};
}

// ─── Solapa: contable y financiero ──────────────────────────────────────────

const contableSchema = z.object({
  cuentasContables: listaTextos(20, 80),
  moneda: enumReq(VALORES(MONEDAS), 'Elegí una moneda de la lista.'),
  condicionPago: textoOpc(80),
  formaPago: textoOpc(80),
});

export async function actualizarContableAction(
  id: string,
  input: z.input<typeof contableSchema>,
): Promise<ResultadoProveedor> {
  const r = await conProveedor(id);
  if ('error' in r) return { error: r.error };
  const { c, p } = r;

  const parsed = contableSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };

  await db
    .update(proveedores)
    .set({ ...parsed.data, updatedBy: c.userId, updatedAt: new Date() })
    .where(and(eq(proveedores.id, p.id), eq(proveedores.guarderiaId, c.gId)));
  revalidar(p.id);
  return {};
}

// ─── Cuentas bancarias (varias por proveedor) ───────────────────────────────

const ALIAS = /^[A-Za-z0-9.-]{6,20}$/;

const cuentaSchema = z.object({
  id: uuidOpc,
  banco: textoOpc(120),
  tipoCuenta: enumOpc(VALORES(TIPOS_CUENTA), 'Elegí un tipo de cuenta de la lista.'),
  nroCuenta: textoOpc(40),
  cbu: textoOpc(40),
  alias: textoOpc(40),
  titular: textoOpc(120),
  observaciones: textoOpc(300),
});

/** Alta o edición de una cuenta bancaria (`id` presente = edición). */
export async function guardarCuentaBancariaAction(
  proveedorId: string,
  input: z.input<typeof cuentaSchema>,
): Promise<ResultadoProveedor> {
  const r = await conProveedor(proveedorId);
  if ('error' in r) return { error: r.error };
  const { c, p } = r;

  const parsed = cuentaSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { id: cuentaId, ...d } = parsed.data;

  if (!d.cbu && !d.alias && !d.nroCuenta) {
    return { error: 'Cargá al menos el CBU, el alias o el número de cuenta.' };
  }
  let cbu: string | null = null;
  if (d.cbu) {
    const v = validarCbu(d.cbu);
    if (!v.ok) return { error: v.error };
    cbu = v.valor;
  }
  if (d.alias && !ALIAS.test(d.alias)) {
    return { error: 'El alias tiene entre 6 y 20 caracteres: letras, números, puntos o guiones.' };
  }
  const datos = { ...d, cbu };

  try {
    if (cuentaId) {
      const upd = await db
        .update(proveedorCuentasBancarias)
        .set(datos)
        .where(
          and(
            eq(proveedorCuentasBancarias.id, cuentaId),
            eq(proveedorCuentasBancarias.proveedorId, p.id),
            eq(proveedorCuentasBancarias.guarderiaId, c.gId),
          ),
        )
        .returning({ id: proveedorCuentasBancarias.id });
      if (upd.length === 0) return { error: 'No encontramos esa cuenta.' };
    } else {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(proveedorCuentasBancarias)
        .where(eq(proveedorCuentasBancarias.proveedorId, p.id));
      if (n >= 20) return { error: 'Se pueden cargar hasta 20 cuentas por proveedor.' };
      await db
        .insert(proveedorCuentasBancarias)
        .values({ ...datos, proveedorId: p.id, guarderiaId: c.gId });
    }
  } catch {
    return { error: 'No se pudo guardar la cuenta bancaria.' };
  }
  revalidar(p.id);
  return {};
}

export async function eliminarCuentaBancariaAction(
  proveedorId: string,
  cuentaId: string,
): Promise<ResultadoProveedor> {
  const r = await conProveedor(proveedorId);
  if ('error' in r) return { error: r.error };
  const { c, p } = r;
  if (!uuid.safeParse(cuentaId).success) return { error: 'Dato inválido.' };

  await db
    .delete(proveedorCuentasBancarias)
    .where(
      and(
        eq(proveedorCuentasBancarias.id, cuentaId),
        eq(proveedorCuentasBancarias.proveedorId, p.id),
        eq(proveedorCuentasBancarias.guarderiaId, c.gId),
      ),
    );
  revalidar(p.id);
  return {};
}

// ─── Baja del proveedor ─────────────────────────────────────────────────────

/**
 * Elimina un proveedor cargado por error. Si ya tiene reparaciones o mantenimientos
 * registrados en Bienes de uso no se puede borrar (se perdería el historial): hay que
 * pasarlo a Inactivo.
 */
export async function eliminarProveedorAction(id: string): Promise<ResultadoProveedor> {
  const r = await conProveedor(id);
  if ('error' in r) return { error: r.error };
  const { c, p } = r;

  const [uso] = await db
    .select({ id: bienUsoIntervenciones.id })
    .from(bienUsoIntervenciones)
    .where(
      and(
        eq(bienUsoIntervenciones.proveedorId, p.id),
        eq(bienUsoIntervenciones.guarderiaId, c.gId),
      ),
    )
    .limit(1);
  if (uso) {
    return {
      error:
        'Este proveedor tiene reparaciones o mantenimientos registrados. En vez de eliminarlo, pasalo a Inactivo.',
    };
  }

  const docs = await db
    .select({ path: proveedorDocumentos.archivoPath })
    .from(proveedorDocumentos)
    .where(
      and(eq(proveedorDocumentos.proveedorId, p.id), eq(proveedorDocumentos.guarderiaId, c.gId)),
    );
  await db
    .delete(proveedores)
    .where(and(eq(proveedores.id, p.id), eq(proveedores.guarderiaId, c.gId)));
  for (const d of docs) await borrarArchivo(d.path);
  revalidar();
  return {};
}
