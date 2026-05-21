'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { embarcaciones, solicitudesMembership } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';

// El trigger SQL `_on_solicitud_membership_resolved` (mig mobile 0038) se encarga
// de crear la membership rol='socio' cuando la solicitud pasa a 'aprobada'. Acá
// solo actualizamos el estado y trazabilidad (resolvedAt / resolvedBy).

type Result = { error?: string };

async function getSolicitudPendiente(
  solicitudId: string,
): Promise<
  | { ok: true; gId: string; solicitanteId: string; resolverId: string }
  | { ok: false; error: string }
> {
  const ctx = await getActiveMarina();
  if (!ctx) return { ok: false, error: 'Tu sesión expiró. Recargá la página.' };

  const gId = ctx.activeMembership.guarderiaId;

  const [sol] = await db
    .select({
      guarderiaId: solicitudesMembership.guarderiaId,
      estado: solicitudesMembership.estado,
      solicitanteId: solicitudesMembership.solicitanteId,
    })
    .from(solicitudesMembership)
    .where(eq(solicitudesMembership.id, solicitudId))
    .limit(1);

  if (!sol) return { ok: false, error: 'Solicitud no encontrada.' };
  if (sol.guarderiaId !== gId) {
    return { ok: false, error: 'La solicitud no pertenece a esta guardería.' };
  }
  if (sol.estado !== 'pendiente') {
    return { ok: false, error: 'La solicitud ya fue resuelta.' };
  }
  return {
    ok: true,
    gId,
    solicitanteId: sol.solicitanteId,
    resolverId: ctx.profile.id,
  };
}

export async function aprobarSolicitudAction(solicitudId: string): Promise<Result> {
  const check = await getSolicitudPendiente(solicitudId);
  if (!check.ok) return { error: check.error };

  // Regla del cliente: no se aprueba sin embarcación cargada en el perfil.
  const [emb] = await db
    .select({ id: embarcaciones.id })
    .from(embarcaciones)
    .where(eq(embarcaciones.profileId, check.solicitanteId))
    .limit(1);
  if (!emb) {
    return {
      error:
        'El solicitante todavía no cargó embarcación. Pedile que la registre en la app antes de aprobar.',
    };
  }

  try {
    // No tocamos embarcaciones.guarderia_id: la mobile la carga con el
    // guarderia_id del club al que el usuario solicita unirse, así que ya
    // queda enlazada al club correcto al momento de aprobar.
    await db
      .update(solicitudesMembership)
      .set({
        estado: 'aprobada',
        resolvedAt: new Date(),
        resolvedBy: check.resolverId,
      })
      .where(
        and(
          eq(solicitudesMembership.id, solicitudId),
          eq(solicitudesMembership.estado, 'pendiente'),
        ),
      );

    revalidatePath('/solicitudes-socio');
    revalidatePath('/usuarios');
    return {};
  } catch (err) {
    console.error('[aprobarSolicitudAction]', err);
    return { error: 'No pudimos aprobar la solicitud. Intentá de nuevo.' };
  }
}

export async function rechazarSolicitudAction(
  solicitudId: string,
  motivo: string,
): Promise<Result> {
  const check = await getSolicitudPendiente(solicitudId);
  if (!check.ok) return { error: check.error };

  const motivoLimpio = motivo.trim();

  try {
    await db
      .update(solicitudesMembership)
      .set({
        estado: 'rechazada',
        motivoRechazo: motivoLimpio || null,
        resolvedAt: new Date(),
        resolvedBy: check.resolverId,
      })
      .where(
        and(
          eq(solicitudesMembership.id, solicitudId),
          eq(solicitudesMembership.estado, 'pendiente'),
        ),
      );

    revalidatePath('/solicitudes-socio');
    return {};
  } catch (err) {
    console.error('[rechazarSolicitudAction]', err);
    return { error: 'No pudimos rechazar la solicitud. Intentá de nuevo.' };
  }
}
