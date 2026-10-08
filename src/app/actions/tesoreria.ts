'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, max } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { tesoreriaMovimientos } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_ROLES } from '@/config/roles';
import { INSTRUMENTO_VALUES } from '@/lib/tesoreria/instrumentos';

const BUCKET_DOCUMENTOS = 'documentos';
const TIPOS_MIME_ADJUNTO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
// bodySizeLimit de next.config.ts es 10 MB; dejamos margen para el resto del form.
const MAX_ADJUNTO_BYTES = 8 * 1024 * 1024;

const movimientoSchema = z.object({
  tipo: z.enum(['ingreso', 'egreso']),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.'),
  instrumento: z.string().refine((v) => INSTRUMENTO_VALUES.includes(v), 'Instrumento inválido.'),
  monto: z.number().finite().gt(0, 'El monto tiene que ser mayor a cero.').max(999_999_999),
  rubro: z.string().trim().min(1, 'Completá el rubro.').max(80),
  subrubro: z.string().trim().min(1, 'Completá el subrubro.').max(80),
  detalle: z.string().trim().min(1, 'Completá el detalle.').max(200),
  observaciones: z.string().trim().min(1, 'Completá las observaciones.').max(1000),
});

export type CrearMovimientoTesoreriaResult = { error?: string; numero?: number };

/**
 * Carga un movimiento manual de caja (ingreso o egreso) con su comprobante
 * adjunto. Todos los campos son obligatorios, incluido el adjunto (pedido del
 * cliente, daily 2026-10-06). El número es correlativo por guardería y se
 * asigna acá, dentro de la transacción.
 */
export async function crearMovimientoTesoreriaAction(
  formData: FormData,
): Promise<CrearMovimientoTesoreriaResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };
  if (!ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    return { error: 'Solo administradores pueden cargar movimientos de tesorería.' };
  }
  const gId = ctx.activeMembership.guarderiaId;

  const parsed = movimientoSchema.safeParse({
    tipo: String(formData.get('tipo') ?? ''),
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

  const file = formData.get('adjunto');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Adjuntá el comprobante del movimiento.' };
  }
  if (!file.type || !TIPOS_MIME_ADJUNTO.includes(file.type)) {
    return { error: 'Formato del adjunto no soportado. Usá PDF, JPG, PNG o WebP.' };
  }
  if (file.size > MAX_ADJUNTO_BYTES) {
    return { error: 'El adjunto no puede pesar más de 8 MB.' };
  }

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `tesoreria/${gId}/${Date.now()}-${safeName}`;
  const { error: uploadErr } = await admin.storage.from(BUCKET_DOCUMENTOS).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) return { error: `No se pudo subir el adjunto: ${uploadErr.message}` };

  try {
    const numero = await db.transaction(async (tx) => {
      const [{ ultimo }] = await tx
        .select({ ultimo: max(tesoreriaMovimientos.numero) })
        .from(tesoreriaMovimientos)
        .where(and(eq(tesoreriaMovimientos.guarderiaId, gId)));
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
        adjuntoPath: path,
        adjuntoNombre: file.name,
        createdBy: ctx.user.id,
      });
      return siguiente;
    });

    revalidatePath('/tesoreria');
    return { numero };
  } catch (err) {
    // No dejar el archivo huérfano si la fila no se pudo grabar.
    await admin.storage
      .from(BUCKET_DOCUMENTOS)
      .remove([path])
      .catch(() => null);
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('tesoreria_movimientos_numero_unico')) {
      return { error: 'Se cargó otro movimiento al mismo tiempo. Intentá de nuevo.' };
    }
    return { error: 'No se pudo guardar el movimiento.' };
  }
}
