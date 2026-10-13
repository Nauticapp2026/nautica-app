'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, max } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { guarderias, tesoreriaMovimientos } from '@/lib/db/schema';
import { todayArg } from '@/lib/dates';
import {
  PERIODO_CARGA_DEFAULT,
  esPeriodoCarga,
  validarFechaCarga,
} from '@/lib/tesoreria/periodo-carga';
import {
  PERIODO_EDICION_DEFAULT,
  esPeriodoEdicion,
  motivoBloqueoEdicion,
  puedeEditarMovimiento,
} from '@/lib/tesoreria/periodo-edicion';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_ROLES } from '@/config/roles';
import { INSTRUMENTO_VALUES } from '@/lib/tesoreria/instrumentos';
import { esRubroValido } from '@/lib/tesoreria/rubros';
import { codigoMovimiento } from '@/lib/tesoreria/codigos';
import type { Instrumento } from '@/lib/tesoreria/instrumentos';
import {
  CAMPOS_INSTRUMENTO,
  limpiarDatosInstrumento,
  validarDatosInstrumento,
} from '@/lib/tesoreria/datos-instrumento';

const BUCKET_DOCUMENTOS = 'documentos';
const TIPOS_MIME_ADJUNTO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
// bodySizeLimit de next.config.ts es 10 MB; dejamos margen para el resto del form.
const MAX_ADJUNTO_BYTES = 8 * 1024 * 1024;

const movimientoSchema = z.object({
  tipo: z.enum(['ingreso', 'egreso']),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.'),
  instrumento: z.string().refine((v) => INSTRUMENTO_VALUES.includes(v), 'Instrumento inválido.'),
  monto: z.number().finite().gt(0, 'El monto tiene que ser mayor a cero.').max(999_999_999),
  rubro: z.string().trim().min(1, 'Elegí el rubro.').max(80),
  subrubro: z.string().trim().min(1, 'Elegí el subrubro.').max(80),
  detalle: z.string().trim().min(1, 'Completá el detalle.').max(200),
  observaciones: z.string().trim().min(1, 'Completá las observaciones.').max(1000),
});
// El par rubro/subrubro tiene que existir en el catálogo: nada escrito a mano.
const movimientoSchemaConCatalogo = movimientoSchema.refine(
  (d) => esRubroValido(d.rubro, d.subrubro),
  { message: 'El subrubro no corresponde al rubro elegido.', path: ['subrubro'] },
);

export type CrearMovimientoTesoreriaResult = { error?: string; codigo?: string };

type Ctx = NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>;

async function contextoAdmin(): Promise<{ ctx: Ctx; gId: string } | { error: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };
  if (!ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    return { error: 'Solo administradores pueden operar la tesorería.' };
  }
  return { ctx, gId: ctx.activeMembership.guarderiaId };
}

async function configTesoreria(gId: string) {
  const [cfg] = await db
    .select({
      carga: guarderias.periodoCargaTesoreria,
      edicion: guarderias.periodoEdicionTesoreria,
    })
    .from(guarderias)
    .where(eq(guarderias.id, gId))
    .limit(1);
  return {
    periodoCarga: esPeriodoCarga(cfg?.carga) ? cfg.carga : PERIODO_CARGA_DEFAULT,
    periodoEdicion: esPeriodoEdicion(cfg?.edicion) ? cfg.edicion : PERIODO_EDICION_DEFAULT,
  };
}

type Parseado = {
  data: z.infer<typeof movimientoSchema>;
  datosInstrumento: Record<string, string>;
  file: File | null;
};

/**
 * Valida el formulario de un movimiento (alta o edición): campos, catálogo de
 * rubros, fecha (nunca futura y dentro del período de carga del club), datos
 * del instrumento y adjunto. Devuelve `error` con el primer problema.
 */
async function parsearMovimiento(
  formData: FormData,
  gId: string,
  tipoFijo?: 'ingreso' | 'egreso',
): Promise<Parseado | { error: string }> {
  const parsed = movimientoSchemaConCatalogo.safeParse({
    tipo: tipoFijo ?? String(formData.get('tipo') ?? ''),
    fecha: String(formData.get('fecha') ?? ''),
    instrumento: String(formData.get('instrumento') ?? ''),
    monto: Number(String(formData.get('monto') ?? '').replace(',', '.')),
    rubro: String(formData.get('rubro') ?? ''),
    subrubro: String(formData.get('subrubro') ?? ''),
    detalle: String(formData.get('detalle') ?? ''),
    observaciones: String(formData.get('observaciones') ?? ''),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisá los datos del movimiento.' };
  }
  const data = parsed.data;

  // Fecha: nunca futura, y hacia atrás hasta donde el club lo permita
  // (Mi perfil → Datos Impositivos → Período de carga de Tesorería).
  const { periodoCarga } = await configTesoreria(gId);
  const errorFecha = validarFechaCarga(data.fecha, periodoCarga, todayArg());
  if (errorFecha) return { error: errorFecha };

  // Datos adicionales según instrumento: llegan como `datos.<clave>`. Solo se
  // guardan las claves que el instrumento conoce y se exige lo obligatorio.
  const instrumento = data.instrumento as Instrumento;
  const crudos: Record<string, unknown> = {};
  for (const campo of CAMPOS_INSTRUMENTO[instrumento]) {
    crudos[campo.key] = formData.get(`datos.${campo.key}`);
  }
  const datosInstrumento = limpiarDatosInstrumento(instrumento, crudos);
  const errorDatos = validarDatosInstrumento(instrumento, datosInstrumento);
  if (errorDatos) return { error: errorDatos };

  // Adjunto opcional: un input file vacío llega como File de tamaño 0.
  const adjunto = formData.get('adjunto');
  const file = adjunto instanceof File && adjunto.size > 0 ? adjunto : null;
  if (file) {
    if (!file.type || !TIPOS_MIME_ADJUNTO.includes(file.type)) {
      return { error: 'Formato del adjunto no soportado. Usá PDF, JPG, PNG o WebP.' };
    }
    if (file.size > MAX_ADJUNTO_BYTES) {
      return { error: 'El adjunto no puede pesar más de 8 MB.' };
    }
  }

  return { data, datosInstrumento, file };
}

async function subirAdjunto(
  gId: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const admin = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `tesoreria/${gId}/${Date.now()}-${safeName}`;
  const { error: uploadErr } = await admin.storage.from(BUCKET_DOCUMENTOS).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) return { error: `No se pudo subir el adjunto: ${uploadErr.message}` };
  return { path };
}

async function borrarAdjunto(path: string | null) {
  if (!path) return;
  await createAdminClient()
    .storage.from(BUCKET_DOCUMENTOS)
    .remove([path])
    .catch(() => null);
}

/**
 * Carga un movimiento manual de caja (ingreso o egreso), con comprobante
 * adjunto opcional (el 2026-10-13 el cliente pidió poder grabar sin adjunto;
 * la daily del 6/10 lo había puesto como obligatorio). El número es
 * correlativo por guardería y tipo (MIC-/MEC-) y se asigna acá, dentro de la
 * transacción.
 */
export async function crearMovimientoTesoreriaAction(
  formData: FormData,
): Promise<CrearMovimientoTesoreriaResult> {
  const auth = await contextoAdmin();
  if ('error' in auth) return { error: auth.error };
  const { ctx, gId } = auth;

  const parseado = await parsearMovimiento(formData, gId);
  if ('error' in parseado) return { error: parseado.error };
  const { data, datosInstrumento, file } = parseado;

  let path: string | null = null;
  if (file) {
    const subida = await subirAdjunto(gId, file);
    if ('error' in subida) return { error: subida.error };
    path = subida.path;
  }

  try {
    const numero = await db.transaction(async (tx) => {
      // Correlativo por club Y tipo: MIC-0001 y MEC-0001 son series distintas.
      const [{ ultimo }] = await tx
        .select({ ultimo: max(tesoreriaMovimientos.numero) })
        .from(tesoreriaMovimientos)
        .where(
          and(eq(tesoreriaMovimientos.guarderiaId, gId), eq(tesoreriaMovimientos.tipo, data.tipo)),
        );
      const siguiente = (ultimo ?? 0) + 1;
      await tx.insert(tesoreriaMovimientos).values({
        guarderiaId: gId,
        numero: siguiente,
        tipo: data.tipo,
        fecha: data.fecha,
        instrumento: data.instrumento,
        monto: data.monto.toFixed(2),
        rubro: data.rubro,
        subrubro: data.subrubro,
        detalle: data.detalle,
        observaciones: data.observaciones,
        datosInstrumento: Object.keys(datosInstrumento).length > 0 ? datosInstrumento : null,
        adjuntoPath: path,
        adjuntoNombre: file?.name ?? null,
        createdBy: ctx.user.id,
      });
      return siguiente;
    });

    revalidatePath('/tesoreria');
    return { codigo: codigoMovimiento(data.tipo, numero) };
  } catch (err) {
    // No dejar el archivo huérfano si la fila no se pudo grabar.
    await borrarAdjunto(path);
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('tesoreria_movimientos_numero_unico')) {
      return { error: 'Se cargó otro movimiento al mismo tiempo. Intentá de nuevo.' };
    }
    return { error: 'No se pudo guardar el movimiento.' };
  }
}

/** El movimiento manual del club, o un error listo para devolver. */
async function movimientoDelClub(id: string, gId: string) {
  if (!z.string().uuid().safeParse(id).success) return { error: 'Movimiento inválido.' } as const;
  const [mov] = await db
    .select()
    .from(tesoreriaMovimientos)
    .where(and(eq(tesoreriaMovimientos.id, id), eq(tesoreriaMovimientos.guarderiaId, gId)))
    .limit(1);
  if (!mov) return { error: 'No se encontró el movimiento.' } as const;
  if (mov.anulado) return { error: 'El movimiento ya está anulado.' } as const;
  return { mov } as const;
}

/**
 * Modifica un movimiento manual (pedido del cliente 2026-10-13). El tipo
 * (ingreso/egreso) y el código no cambian: el correlativo es por tipo. Solo
 * dentro del período de modificación que configuró el club (Mi perfil →
 * Datos Impositivos), contado desde la FECHA ORIGINAL del movimiento; la fecha
 * nueva además tiene que respetar el período de carga.
 */
export async function editarMovimientoTesoreriaAction(
  id: string,
  formData: FormData,
): Promise<CrearMovimientoTesoreriaResult> {
  const auth = await contextoAdmin();
  if ('error' in auth) return { error: auth.error };
  const { gId } = auth;

  const encontrado = await movimientoDelClub(id, gId);
  if ('error' in encontrado) return { error: encontrado.error };
  const { mov } = encontrado;

  const { periodoEdicion } = await configTesoreria(gId);
  if (!puedeEditarMovimiento(mov.fecha, periodoEdicion)) {
    return { error: motivoBloqueoEdicion(periodoEdicion) };
  }

  const tipo = mov.tipo === 'egreso' ? 'egreso' : 'ingreso';
  const parseado = await parsearMovimiento(formData, gId, tipo);
  if ('error' in parseado) return { error: parseado.error };
  const { data, datosInstrumento, file } = parseado;

  let path: string | null = null;
  if (file) {
    const subida = await subirAdjunto(gId, file);
    if ('error' in subida) return { error: subida.error };
    path = subida.path;
  }

  try {
    await db
      .update(tesoreriaMovimientos)
      .set({
        fecha: data.fecha,
        instrumento: data.instrumento,
        monto: data.monto.toFixed(2),
        rubro: data.rubro,
        subrubro: data.subrubro,
        detalle: data.detalle,
        observaciones: data.observaciones,
        datosInstrumento: Object.keys(datosInstrumento).length > 0 ? datosInstrumento : null,
        // Sin adjunto nuevo se conserva el que había.
        ...(file ? { adjuntoPath: path, adjuntoNombre: file.name } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(tesoreriaMovimientos.id, mov.id), eq(tesoreriaMovimientos.guarderiaId, gId)));
    // Reemplazado: el adjunto viejo ya no se referencia.
    if (file && mov.adjuntoPath) await borrarAdjunto(mov.adjuntoPath);

    revalidatePath('/tesoreria');
    return { codigo: codigoMovimiento(tipo, mov.numero) };
  } catch {
    await borrarAdjunto(path);
    return { error: 'No se pudo guardar el movimiento.' };
  }
}

/**
 * Anula un movimiento manual (pedido del cliente 2026-10-13). No se borra:
 * queda marcado, deja de sumar en los saldos y se ve tachado en el registro.
 * Solo dentro del período de modificación del club, contado desde la fecha
 * del movimiento. Los ingresos por recibos se anulan desde Cobranzas.
 */
export async function anularMovimientoTesoreriaAction(
  id: string,
): Promise<CrearMovimientoTesoreriaResult> {
  const auth = await contextoAdmin();
  if ('error' in auth) return { error: auth.error };
  const { ctx, gId } = auth;

  const encontrado = await movimientoDelClub(id, gId);
  if ('error' in encontrado) return { error: encontrado.error };
  const { mov } = encontrado;

  const { periodoEdicion } = await configTesoreria(gId);
  if (!puedeEditarMovimiento(mov.fecha, periodoEdicion)) {
    return { error: motivoBloqueoEdicion(periodoEdicion) };
  }

  // Guarda atómica: si otra request lo anuló entre medio, acá no matchea.
  const marcado = await db
    .update(tesoreriaMovimientos)
    .set({ anulado: true, anuladoAt: new Date(), anuladoPor: ctx.user.id, updatedAt: new Date() })
    .where(
      and(
        eq(tesoreriaMovimientos.id, mov.id),
        eq(tesoreriaMovimientos.guarderiaId, gId),
        eq(tesoreriaMovimientos.anulado, false),
      ),
    )
    .returning({ id: tesoreriaMovimientos.id });
  if (marcado.length === 0) return { error: 'El movimiento ya está anulado.' };

  revalidatePath('/tesoreria');
  return { codigo: codigoMovimiento(mov.tipo === 'egreso' ? 'egreso' : 'ingreso', mov.numero) };
}
