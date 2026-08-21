'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import {
  areas,
  comunicacionesMails,
  espacios,
  guarderias,
  memberships,
  profiles,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { sendEmail } from '@/lib/email/resend';
import { avisoClubEmail } from '@/lib/email/templates/aviso-club';

type Ctx = NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>;

function isAdmin(ctx: Ctx): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo' ||
    ctx.activeMembership.rol === 'contable'
  );
}

/**
 * Socios destinatarios de un envío: los que ocupan un espacio en alguna de las
 * áreas elegidas.
 *
 * El vínculo se resuelve por `espacios.ocupante_id`. Es el mismo universo que
 * daría ir por `embarcaciones.espacio_id` (verificado en prod: las dos vías dan
 * los mismos socios en las 14 áreas), y las dos columnas se mantienen
 * sincronizadas a propósito.
 *
 * Se exige socio activo del club y email cargado: sin mail no hay a dónde
 * mandar. Se deduplica — un socio con varios espacios en la misma área, o
 * espacios en dos áreas elegidas, recibe UN solo mail.
 */
async function resolverDestinatarios(
  guarderiaId: string,
  areaIds: string[],
): Promise<Array<{ id: string; nombre: string | null; email: string }>> {
  if (areaIds.length === 0) return [];

  const rows = await db
    .selectDistinct({
      id: profiles.id,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      email: profiles.email,
    })
    .from(espacios)
    .innerJoin(profiles, eq(profiles.id, espacios.ocupanteId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, profiles.id),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.rol, 'socio'),
        eq(memberships.status, 'active'),
      ),
    )
    .where(
      and(
        eq(espacios.guarderiaId, guarderiaId),
        isNotNull(espacios.areaId),
        inArray(espacios.areaId, areaIds),
      ),
    );

  const vistos = new Set<string>();
  const out: Array<{ id: string; nombre: string | null; email: string }> = [];
  for (const r of rows) {
    const email = r.email?.trim();
    if (!email || vistos.has(r.id)) continue;
    vistos.add(r.id);
    out.push({
      id: r.id,
      nombre: [r.nombre, r.apellido].filter(Boolean).join(' ').trim() || null,
      email,
    });
  }
  return out;
}

/** Cuántos socios recibirían el mail con las áreas elegidas (preview en la UI). */
export async function contarDestinatariosAreasAction(
  areaIds: string[],
): Promise<{ error?: string; total?: number }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores.' };

  const parsed = z.array(z.string().uuid()).max(50).safeParse(areaIds);
  if (!parsed.success) return { error: 'Áreas inválidas.' };

  const destinatarios = await resolverDestinatarios(ctx.activeMembership.guarderiaId, parsed.data);
  return { total: destinatarios.length };
}

const envioSchema = z.object({
  areaIds: z.array(z.string().uuid()).min(1, 'Elegí al menos un área.').max(50),
  asunto: z.string().trim().min(1, 'El asunto es obligatorio.').max(200),
  cuerpo: z.string().trim().min(1, 'El mensaje es obligatorio.').max(5000),
});

export type EnvioMailAreaInput = z.infer<typeof envioSchema>;

/**
 * Manda el mail a los socios de las áreas elegidas y deja el registro del
 * envío.
 *
 * Los mails salen de a uno y en secuencia: un fallo puntual (mail inválido,
 * rechazo de Resend) no corta el resto. Al final se guarda cuántos se
 * resolvieron y cuántos salieron bien — si no coinciden, el historial lo
 * muestra.
 */
export async function enviarMailAreaAction(
  input: EnvioMailAreaInput,
): Promise<{ error?: string; enviados?: number; destinatarios?: number }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden enviar mails.' };

  const parsed = envioSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const data = parsed.data;
  const gId = ctx.activeMembership.guarderiaId;

  // Las áreas tienen que ser de ESTE club: el id viene del cliente.
  const areasDb = await db
    .select({ id: areas.id, nombre: areas.nombre })
    .from(areas)
    .where(and(eq(areas.guarderiaId, gId), inArray(areas.id, data.areaIds)));
  if (areasDb.length !== data.areaIds.length) {
    return { error: 'Alguna de las áreas no es de este club. Recargá la página.' };
  }

  const destinatarios = await resolverDestinatarios(gId, data.areaIds);
  if (destinatarios.length === 0) {
    return {
      error:
        'Ningún socio con email ocupa un espacio en las áreas elegidas, así que no hay a quién enviarle.',
    };
  }

  const [club] = await db
    .select({ nombre: guarderias.nombre, razonSocial: guarderias.razonSocial })
    .from(guarderias)
    .where(eq(guarderias.id, gId))
    .limit(1);
  const nombreClub = club?.razonSocial?.trim() || club?.nombre || 'Tu club';

  let enviados = 0;
  for (const socio of destinatarios) {
    const { subject, html } = avisoClubEmail({
      nombreSocio: socio.nombre,
      nombreClub,
      asunto: data.asunto,
      cuerpo: data.cuerpo,
    });
    try {
      const res = await sendEmail({ to: socio.email, subject, html });
      if (res.ok) enviados++;
      else console.error('[comunicaciones-mails] no salió', socio.email, res.error);
    } catch (err) {
      console.error('[comunicaciones-mails] error mandando a', socio.email, err);
    }
  }

  await db.insert(comunicacionesMails).values({
    guarderiaId: gId,
    autorId: ctx.profile.id,
    areaIds: data.areaIds,
    areaNombres: areasDb.map((a) => a.nombre),
    asunto: data.asunto,
    cuerpo: data.cuerpo,
    destinatarios: destinatarios.length,
    enviados,
  });

  revalidatePath('/comunicaciones');
  return { enviados, destinatarios: destinatarios.length };
}

export async function deleteEnvioMailAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores.' };
  if (!z.string().uuid().safeParse(id).success) return { error: 'ID inválido.' };

  await db
    .delete(comunicacionesMails)
    .where(
      and(
        eq(comunicacionesMails.id, id),
        eq(comunicacionesMails.guarderiaId, ctx.activeMembership.guarderiaId),
      ),
    );

  revalidatePath('/comunicaciones');
  return {};
}

/** Historial de envíos del club, más reciente primero. */
export async function listarEnviosMailAction(): Promise<{
  error?: string;
  envios?: Array<{
    id: string;
    asunto: string;
    cuerpo: string;
    areaNombres: string[];
    destinatarios: number;
    enviados: number;
    createdAt: string;
    autor: string | null;
  }>;
}> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores.' };

  const rows = await db
    .select({
      id: comunicacionesMails.id,
      asunto: comunicacionesMails.asunto,
      cuerpo: comunicacionesMails.cuerpo,
      areaNombres: comunicacionesMails.areaNombres,
      destinatarios: comunicacionesMails.destinatarios,
      enviados: comunicacionesMails.enviados,
      createdAt: comunicacionesMails.createdAt,
      autorNombre: profiles.nombre,
      autorApellido: profiles.apellido,
      autorEmail: profiles.email,
    })
    .from(comunicacionesMails)
    .leftJoin(profiles, eq(profiles.id, comunicacionesMails.autorId))
    .where(eq(comunicacionesMails.guarderiaId, ctx.activeMembership.guarderiaId))
    .orderBy(desc(comunicacionesMails.createdAt))
    .limit(100);

  return {
    envios: rows.map((r) => ({
      id: r.id,
      asunto: r.asunto,
      cuerpo: r.cuerpo,
      areaNombres: r.areaNombres ?? [],
      destinatarios: r.destinatarios,
      enviados: r.enviados,
      createdAt: r.createdAt.toISOString(),
      autor:
        [r.autorNombre, r.autorApellido].filter(Boolean).join(' ').trim() || r.autorEmail || null,
    })),
  };
}
