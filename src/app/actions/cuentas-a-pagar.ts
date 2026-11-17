'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, max, ne } from 'drizzle-orm';
import { z } from 'zod';

import {
  borrarArchivo,
  subirArchivo,
  validarArchivo,
  type ArchivoValidado,
} from '@/lib/archivos-privados';
import { contextoAdmin, esError } from '@/lib/auth/contexto-admin';
import { calcularTotales, validarImportes } from '@/lib/cuentas-a-pagar/calculos';
import {
  ALICUOTAS_IVA,
  TIPOS_COMPROBANTE,
  codigoCp,
  esTipoC,
  formatoNumeroComprobante,
  formatoPuntoVenta,
} from '@/lib/cuentas-a-pagar/constantes';
import { aplicadoPorComprobante } from '@/lib/cuentas-a-pagar/consultas';
import { todayArg } from '@/lib/dates';
import { db } from '@/lib/db';
import { cpComprobantes, cpComprobantesHistorial, proveedores } from '@/lib/db/schema';
import { esFechaYmdValida } from '@/lib/documentacion-fechas';
import { primerError, uuid } from '@/lib/esquemas-comunes';

export type ResultadoCp = { error?: string; aviso?: string };
export type ResultadoCrearCp = ResultadoCp & { id?: string; codigo?: string };

function revalidar(id?: string) {
  revalidatePath('/cuentas-a-pagar');
  revalidatePath('/circuito-de-pagos');
  if (id) revalidatePath(`/cuentas-a-pagar/${id}`);
}

const importe = z
  .number({ error: 'Revisá los importes: hay un valor que no es un número.' })
  .finite()
  .min(0, 'Los importes no pueden ser negativos.')
  .max(999_999_999.99, 'Un importe es demasiado grande.');

const comprobanteSchema = z
  .object({
    proveedorId: uuid,
    fechaEmision: z.string().refine(esFechaYmdValida, 'La fecha de emisión no es válida.'),
    tipoComprobante: z
      .string()
      .refine((v) => TIPOS_COMPROBANTE.some((t) => t.value === v), 'Elegí el tipo de comprobante.'),
    puntoVenta: z.string().regex(/^\d{1,5}$/, 'El punto de venta tiene hasta 5 dígitos.'),
    numeroComprobante: z
      .string()
      .regex(/^\d{1,8}$/, 'El número de comprobante tiene hasta 8 dígitos.'),
    fechaVencimiento: z.string().refine(esFechaYmdValida, 'La fecha de vencimiento no es válida.'),
    condicionPago: z.string().trim().min(1, 'Elegí la condición de pago.').max(80),
    moneda: z.enum(['PES', 'DOL'], { error: 'Elegí la moneda.' }),
    tipoCambio: z.number().finite().positive().max(1_000_000).nullable(),
    concepto: z.string().trim().min(1, 'Elegí el concepto (imputación contable).').max(120),
    instrumentoPago: z.string().trim().min(1, 'Elegí el instrumento de pago.').max(80),
    lineasIva: z
      .array(
        z.object({
          neto: importe,
          alicuota: z.number().refine((a) => ALICUOTAS_IVA.includes(a), 'Alícuota inválida.'),
          iva: importe,
        }),
      )
      .max(10, 'Hasta 10 líneas de IVA.'),
    netoNoGravado: importe,
    exento: importe,
    otrosTributos: importe,
    percepcionesIibb: z
      .array(z.object({ jurisdiccion: z.string().trim().max(80), monto: importe }))
      .max(24, 'Hasta 24 percepciones de Ingresos Brutos.'),
    monotributo: importe,
    observaciones: z
      .string()
      .trim()
      .max(500, 'Las observaciones pueden tener hasta 500 caracteres.'),
  })
  .superRefine((d, ctx) => {
    if (d.moneda === 'DOL' && !(d.tipoCambio && d.tipoCambio > 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['tipoCambio'],
        message: 'Con moneda dólares el tipo de cambio es obligatorio.',
      });
    }
    if (d.fechaVencimiento < d.fechaEmision) {
      ctx.addIssue({
        code: 'custom',
        path: ['fechaVencimiento'],
        message: 'El vencimiento no puede ser anterior a la fecha de emisión.',
      });
    }
  });

type DatosComprobante = z.infer<typeof comprobanteSchema>;

/** Lee y valida el formulario (un JSON en `payload` y, opcional, el archivo `adjunto`). */
async function leerFormulario(
  formData: FormData,
  hoy: string,
): Promise<
  | {
      d: DatosComprobante;
      totales: ReturnType<typeof calcularTotales>;
      archivo: ArchivoValidado | null;
    }
  | { error: string }
> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(String(formData.get('payload') ?? ''));
  } catch {
    return { error: 'Los datos del comprobante no llegaron bien. Recargá e intentá de nuevo.' };
  }
  const parsed = comprobanteSchema.safeParse(crudo);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;

  if (d.fechaEmision > hoy) {
    return { error: 'La fecha de emisión no puede ser futura.' };
  }

  const errorImportes = validarImportes(d.tipoComprobante, {
    lineasIva: d.lineasIva,
    netoNoGravado: d.netoNoGravado,
    exento: d.exento,
    otrosTributos: d.otrosTributos,
    percepcionesIibb: d.percepcionesIibb,
    monotributo: d.monotributo,
  });
  if (errorImportes) return { error: errorImportes };
  const totales = calcularTotales(d.tipoComprobante, {
    lineasIva: d.lineasIva,
    netoNoGravado: d.netoNoGravado,
    exento: d.exento,
    otrosTributos: d.otrosTributos,
    percepcionesIibb: d.percepcionesIibb,
    monotributo: d.monotributo,
  });

  const archivo = await validarArchivo(formData.get('adjunto'));
  if (archivo && 'error' in archivo) return { error: archivo.error };
  return { d, totales, archivo: archivo ?? null };
}

/** El proveedor activo del club (solo se opera con proveedores del Maestro). */
async function proveedorActivo(gId: string, id: string) {
  const [p] = await db
    .select({
      id: proveedores.id,
      condicionIva: proveedores.condicionIva,
      estado: proveedores.estado,
    })
    .from(proveedores)
    .where(and(eq(proveedores.id, id), eq(proveedores.guarderiaId, gId)))
    .limit(1);
  if (!p) return { error: 'Ese proveedor no existe en el Maestro de Proveedores.' } as const;
  if (p.estado === 'inactivo') {
    return {
      error: 'Ese proveedor está inactivo. Reactivalo en el Maestro de Proveedores.',
    } as const;
  }
  return { p } as const;
}

/** ¿Ya hay un comprobante vigente (no anulado) igual de ese proveedor? */
async function buscarDuplicado(
  gId: string,
  d: DatosComprobante,
  excluirId?: string,
): Promise<string | null> {
  const filas = await db
    .select({ id: cpComprobantes.id, numero: cpComprobantes.numero })
    .from(cpComprobantes)
    .where(
      and(
        eq(cpComprobantes.guarderiaId, gId),
        eq(cpComprobantes.proveedorId, d.proveedorId),
        eq(cpComprobantes.origen, 'manual'),
        // Un comprobante anulado no cuenta: se puede volver a cargar bien.
        ne(cpComprobantes.estado, 'X'),
        eq(cpComprobantes.tipoComprobante, d.tipoComprobante),
        eq(cpComprobantes.puntoVenta, formatoPuntoVenta(d.puntoVenta)),
        eq(cpComprobantes.numeroComprobante, formatoNumeroComprobante(d.numeroComprobante)),
      ),
    );
  const dup = filas.find((f) => f.id !== excluirId);
  return dup ? codigoCp(dup.numero) : null;
}

const MSJ_DUPLICADO = (codigo: string) =>
  `Ese comprobante ya fue ingresado para este proveedor (${codigo}). No se pueden cargar comprobantes duplicados.`;

function esErrorDuplicado(err: unknown): boolean {
  const todo = `${err instanceof Error ? err.message : ''} ${
    (err as { cause?: { message?: string } } | null)?.cause?.message ?? ''
  }`;
  return todo.includes('cp_comprobantes_duplicado_unico');
}

// ─── Alta ───────────────────────────────────────────────────────────────────

/**
 * Carga un comprobante de un proveedor del Maestro. Nace en estado H. Valida todo en el
 * servidor (proveedor del club, importes recalculados, duplicados, adjunto) y le asigna el
 * Next Number del club.
 */
export async function crearComprobanteAction(formData: FormData): Promise<ResultadoCrearCp> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };

  const hoy = todayArg();
  const leido = await leerFormulario(formData, hoy);
  if ('error' in leido) return { error: leido.error };
  const { d, totales, archivo } = leido;

  const prov = await proveedorActivo(c.gId, d.proveedorId);
  if ('error' in prov) return { error: prov.error };

  const dup = await buscarDuplicado(c.gId, d);
  if (dup) return { error: MSJ_DUPLICADO(dup) };

  const id = randomUUID();
  let path: string | null = null;
  if (archivo) {
    const sub = await subirArchivo('cuentas-a-pagar', c.gId, id, archivo);
    if ('error' in sub) return { error: sub.error };
    path = sub.path;
  }

  for (let intento = 0; intento < 5; intento++) {
    try {
      const numero = await db.transaction(async (tx) => {
        const [fila] = await tx
          .select({ ultimo: max(cpComprobantes.numero) })
          .from(cpComprobantes)
          .where(eq(cpComprobantes.guarderiaId, c.gId));
        const siguiente = (fila?.ultimo ?? 0) + 1 + intento;
        await tx.insert(cpComprobantes).values({
          id,
          guarderiaId: c.gId,
          numero: siguiente,
          origen: 'manual',
          proveedorId: d.proveedorId,
          condicionIvaProveedor: prov.p.condicionIva ?? null,
          fechaEmision: d.fechaEmision,
          tipoComprobante: d.tipoComprobante,
          puntoVenta: formatoPuntoVenta(d.puntoVenta),
          numeroComprobante: formatoNumeroComprobante(d.numeroComprobante),
          fechaContabilizacion: hoy,
          fechaVencimiento: d.fechaVencimiento,
          condicionPago: d.condicionPago,
          moneda: d.moneda,
          tipoCambio: d.moneda === 'DOL' ? String(d.tipoCambio) : null,
          concepto: d.concepto,
          instrumentoPago: d.instrumentoPago,
          lineasIva: esTipoC(d.tipoComprobante) ? [] : d.lineasIva,
          percepcionesIibb: esTipoC(d.tipoComprobante) ? [] : d.percepcionesIibb,
          netoGravado: totales.netoGravado.toFixed(2),
          iva: totales.iva.toFixed(2),
          netoNoGravado: totales.netoNoGravado.toFixed(2),
          exento: totales.exento.toFixed(2),
          otrosTributos: totales.otrosTributos.toFixed(2),
          percepcionesIibbTotal: totales.percepcionesIibbTotal.toFixed(2),
          monotributo: totales.monotributo.toFixed(2),
          total: totales.total.toFixed(2),
          estado: 'H',
          adjuntoPath: path,
          adjuntoNombre: archivo?.nombre ?? null,
          observaciones: d.observaciones || null,
          createdBy: c.userId,
          updatedBy: c.userId,
        });
        await tx.insert(cpComprobantesHistorial).values({
          guarderiaId: c.gId,
          comprobanteId: id,
          estadoDesde: null,
          estadoHasta: 'H',
          usuarioId: c.userId,
          detalle: 'Comprobante ingresado',
        });
        return siguiente;
      });
      revalidar(id);
      return { id, codigo: codigoCp(numero) };
    } catch (e) {
      if (esErrorDuplicado(e)) {
        await borrarArchivo(path);
        return { error: MSJ_DUPLICADO('ya cargado') };
      }
      const msg = `${e instanceof Error ? e.message : ''} ${
        (e as { cause?: { message?: string } } | null)?.cause?.message ?? ''
      }`;
      if (msg.includes('cp_comprobantes_numero_unico') && intento < 4) continue;
      console.error('[crearComprobanteAction]', e);
      await borrarArchivo(path);
      return { error: 'No se pudo guardar el comprobante. Intentá de nuevo.' };
    }
  }
  await borrarArchivo(path);
  return { error: 'Se cargaron comprobantes al mismo tiempo. Intentá de nuevo.' };
}

// ─── Utilidades de acceso ───────────────────────────────────────────────────

/** El comprobante si es del club; error listo para devolver si no. */
async function comprobanteDelClub(id: string, gId: string) {
  if (!uuid.safeParse(id).success) return { error: 'Comprobante inválido.' } as const;
  const [cp] = await db
    .select()
    .from(cpComprobantes)
    .where(and(eq(cpComprobantes.id, id), eq(cpComprobantes.guarderiaId, gId)))
    .limit(1);
  if (!cp) return { error: 'No encontramos ese comprobante.' } as const;
  return { cp } as const;
}

// ─── Modificación ───────────────────────────────────────────────────────────

/**
 * Modifica un comprobante. Solo se puede mientras esté en estado H y no tenga pagos
 * aplicados; en cualquier otro estado queda bloqueado.
 */
export async function editarComprobanteAction(
  id: string,
  formData: FormData,
): Promise<ResultadoCrearCp> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };

  const r = await comprobanteDelClub(id, c.gId);
  if ('error' in r) return { error: r.error };
  const { cp } = r;
  if (cp.origen !== 'manual') {
    return {
      error: 'Los anticipos a proveedores no se modifican: los genera el Circuito de pagos.',
    };
  }
  if (cp.estado !== 'H') {
    return { error: 'Solo se puede modificar un comprobante en estado H (ingresado).' };
  }
  const aplicado = (await aplicadoPorComprobante(c.gId, [cp.id])).get(cp.id) ?? 0;
  if (aplicado > 0) {
    return { error: 'El comprobante tiene pagos aplicados: no se puede modificar.' };
  }

  const hoy = todayArg();
  const leido = await leerFormulario(formData, hoy);
  if ('error' in leido) return { error: leido.error };
  const { d, totales, archivo } = leido;

  const prov = await proveedorActivo(c.gId, d.proveedorId);
  if ('error' in prov) return { error: prov.error };

  const dup = await buscarDuplicado(c.gId, d, cp.id);
  if (dup) return { error: MSJ_DUPLICADO(dup) };

  let path: string | null = null;
  if (archivo) {
    const sub = await subirArchivo('cuentas-a-pagar', c.gId, cp.id, archivo);
    if ('error' in sub) return { error: sub.error };
    path = sub.path;
  }

  try {
    // Condición: sigue en H y sin pagos. Evita pisar un cambio que se hizo mientras se editaba.
    const actualizado = await db
      .update(cpComprobantes)
      .set({
        proveedorId: d.proveedorId,
        condicionIvaProveedor: prov.p.condicionIva ?? null,
        fechaEmision: d.fechaEmision,
        tipoComprobante: d.tipoComprobante,
        puntoVenta: formatoPuntoVenta(d.puntoVenta),
        numeroComprobante: formatoNumeroComprobante(d.numeroComprobante),
        fechaVencimiento: d.fechaVencimiento,
        condicionPago: d.condicionPago,
        moneda: d.moneda,
        tipoCambio: d.moneda === 'DOL' ? String(d.tipoCambio) : null,
        concepto: d.concepto,
        instrumentoPago: d.instrumentoPago,
        lineasIva: esTipoC(d.tipoComprobante) ? [] : d.lineasIva,
        percepcionesIibb: esTipoC(d.tipoComprobante) ? [] : d.percepcionesIibb,
        netoGravado: totales.netoGravado.toFixed(2),
        iva: totales.iva.toFixed(2),
        netoNoGravado: totales.netoNoGravado.toFixed(2),
        exento: totales.exento.toFixed(2),
        otrosTributos: totales.otrosTributos.toFixed(2),
        percepcionesIibbTotal: totales.percepcionesIibbTotal.toFixed(2),
        monotributo: totales.monotributo.toFixed(2),
        total: totales.total.toFixed(2),
        observaciones: d.observaciones || null,
        ...(archivo ? { adjuntoPath: path, adjuntoNombre: archivo.nombre } : {}),
        updatedBy: c.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cpComprobantes.id, cp.id),
          eq(cpComprobantes.guarderiaId, c.gId),
          eq(cpComprobantes.estado, 'H'),
        ),
      )
      .returning({ id: cpComprobantes.id });
    if (actualizado.length === 0) {
      await borrarArchivo(path);
      return { error: 'El comprobante cambió de estado mientras lo editabas. Recargá la página.' };
    }
    await db.insert(cpComprobantesHistorial).values({
      guarderiaId: c.gId,
      comprobanteId: cp.id,
      estadoDesde: 'H',
      estadoHasta: 'H',
      usuarioId: c.userId,
      detalle: 'Comprobante modificado',
    });
    if (archivo && cp.adjuntoPath) await borrarArchivo(cp.adjuntoPath);
    revalidar(cp.id);
    return { id: cp.id, codigo: codigoCp(cp.numero) };
  } catch (e) {
    await borrarArchivo(path);
    if (esErrorDuplicado(e)) return { error: MSJ_DUPLICADO('ya cargado') };
    console.error('[editarComprobanteAction]', e);
    return { error: 'No se pudo guardar el comprobante.' };
  }
}

// ─── Anulación ──────────────────────────────────────────────────────────────

/**
 * Anula un comprobante (queda en estado X, con la fecha de anulación). Solo si no está
 * pagado: con pagos aplicados no se puede anular (primero hay que anular el pago).
 */
export async function anularComprobanteAction(id: string): Promise<ResultadoCp> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };

  const r = await comprobanteDelClub(id, c.gId);
  if ('error' in r) return { error: r.error };
  const { cp } = r;
  if (cp.origen !== 'manual') {
    return { error: 'Un anticipo se anula anulando la orden de pago que lo generó.' };
  }
  if (cp.estado === 'X') return { error: 'El comprobante ya está anulado.' };
  if (cp.estado === 'P') {
    return { error: 'El comprobante está pagado: no se puede anular. Anulá primero el pago.' };
  }
  const aplicado = (await aplicadoPorComprobante(c.gId, [cp.id])).get(cp.id) ?? 0;
  if (aplicado > 0) {
    return {
      error: 'El comprobante tiene pagos aplicados: no se puede anular. Anulá primero el pago.',
    };
  }

  const res = await db
    .update(cpComprobantes)
    .set({
      estado: 'X',
      anuladoAt: new Date(),
      anuladoPor: c.userId,
      updatedBy: c.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(cpComprobantes.id, cp.id),
        eq(cpComprobantes.guarderiaId, c.gId),
        inArray(cpComprobantes.estado, ['H', 'A']),
      ),
    )
    .returning({ id: cpComprobantes.id });
  if (res.length === 0) {
    return { error: 'El comprobante cambió de estado. Recargá la página e intentá de nuevo.' };
  }
  await db.insert(cpComprobantesHistorial).values({
    guarderiaId: c.gId,
    comprobanteId: cp.id,
    estadoDesde: cp.estado,
    estadoHasta: 'X',
    usuarioId: c.userId,
    detalle: 'Comprobante anulado',
  });
  revalidar(cp.id);
  return {};
}

// ─── Cambio de estado H ⇄ A (uno o varios) ──────────────────────────────────

const cambioEstadoSchema = z.object({
  ids: z.array(uuid).min(1, 'Elegí al menos un comprobante.').max(200, 'Hasta 200 a la vez.'),
  destino: z.enum(['A', 'H']),
});

/**
 * Pasa comprobantes de H a A (autorizados para pagar; queda registrado quién) o de A a H
 * (vuelven atrás hasta nuevo aviso). Funciona con uno o con muchos a la vez; los que no
 * corresponden (otro estado, anticipos, de otro club) se saltean y se informa cuántos.
 */
export async function cambiarEstadoComprobantesAction(
  input: z.input<typeof cambioEstadoSchema>,
): Promise<ResultadoCp & { cambiados?: number }> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };

  const parsed = cambioEstadoSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const { ids, destino } = parsed.data;
  const ids1 = [...new Set(ids)];
  const origen = destino === 'A' ? 'H' : 'A';

  const cambiados = await db
    .update(cpComprobantes)
    .set(
      destino === 'A'
        ? {
            estado: 'A',
            autorizadoPor: c.userId,
            autorizadoAt: new Date(),
            updatedBy: c.userId,
            updatedAt: new Date(),
          }
        : {
            estado: 'H',
            autorizadoPor: null,
            autorizadoAt: null,
            updatedBy: c.userId,
            updatedAt: new Date(),
          },
    )
    .where(
      and(
        inArray(cpComprobantes.id, ids1),
        eq(cpComprobantes.guarderiaId, c.gId),
        eq(cpComprobantes.estado, origen),
        // Los anticipos no pasan por la autorización: nacen autorizados.
        eq(cpComprobantes.origen, 'manual'),
      ),
    )
    .returning({ id: cpComprobantes.id });

  if (cambiados.length > 0) {
    await db.insert(cpComprobantesHistorial).values(
      cambiados.map((f) => ({
        guarderiaId: c.gId,
        comprobanteId: f.id,
        estadoDesde: origen,
        estadoHasta: destino,
        usuarioId: c.userId,
        detalle: destino === 'A' ? 'Autorizado para pagar' : 'Vuelto a ingresado',
      })),
    );
  }
  revalidar();

  const salteados = ids1.length - cambiados.length;
  if (cambiados.length === 0) {
    return {
      error:
        destino === 'A'
          ? 'Ninguno de los comprobantes elegidos está en estado H.'
          : 'Ninguno de los comprobantes elegidos está en estado A.',
    };
  }
  return {
    cambiados: cambiados.length,
    aviso:
      salteados > 0
        ? `Se cambiaron ${cambiados.length}; ${salteados} se salteó porque no estaba en estado ${origen}.`
        : undefined,
  };
}

// ─── Adjunto posterior a la carga ───────────────────────────────────────────

/** Adjunta (o reemplaza) el archivo de un comprobante, en cualquier estado menos anulado. */
export async function adjuntarComprobanteAction(
  id: string,
  formData: FormData,
): Promise<ResultadoCp> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };

  const r = await comprobanteDelClub(id, c.gId);
  if ('error' in r) return { error: r.error };
  const { cp } = r;
  if (cp.estado === 'X') return { error: 'El comprobante está anulado.' };

  const archivo = await validarArchivo(formData.get('adjunto'));
  if (!archivo) return { error: 'Elegí el archivo a adjuntar.' };
  if ('error' in archivo) return { error: archivo.error };

  const sub = await subirArchivo('cuentas-a-pagar', c.gId, cp.id, archivo);
  if ('error' in sub) return { error: sub.error };

  try {
    await db
      .update(cpComprobantes)
      .set({
        adjuntoPath: sub.path,
        adjuntoNombre: archivo.nombre,
        updatedBy: c.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(cpComprobantes.id, cp.id), eq(cpComprobantes.guarderiaId, c.gId)));
  } catch (e) {
    console.error('[adjuntarComprobanteAction]', e);
    await borrarArchivo(sub.path);
    return { error: 'No se pudo guardar el adjunto.' };
  }
  if (cp.adjuntoPath) await borrarArchivo(cp.adjuntoPath);
  revalidar(cp.id);
  return {};
}
