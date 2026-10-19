/**
 * Documentación con vencimiento: seguro y certificado náutico (mig 0171).
 *
 * Pedido del cliente (2026-10-19):
 *  - SEGURO: la fecha de vencimiento la carga SOLO el club (a mano, desde la ficha del
 *    socio). 7 días antes se avisa al club en el Dashboard y se le manda una
 *    notificación al socio.
 *  - CERTIFICADO NÁUTICO (`carnet_nautico`): la fecha la carga y la ve SOLO el socio,
 *    desde la app. Nunca se le muestra al club. El socio recibe el mismo aviso.
 *
 * PRIVACIDAD: la RLS de `documentos` no separa al club (el web escribe y lee con
 * Drizzle / service role), así que el aislamiento del certificado náutico vive en el
 * código. Toda consulta del lado del club tiene que filtrar `tipo = 'seguro'`: las
 * funciones de este archivo pensadas para el club lo hacen, y ninguna devuelve la fecha
 * del certificado náutico.
 *
 * `documentos.vencimiento` es timestamptz y guarda el día calendario argentino anclado a
 * las 12:00 UTC (`fechaCalendariaArg`). Siempre se compara por día argentino.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { documentos, memberships, profiles } from '@/lib/db/schema';
import { argYmd, todayArg } from '@/lib/dates';
import { DIAS_AVISO_VENCIMIENTO, diasEntre, fechaLegible } from '@/lib/documentacion-fechas';
import { sendPushToUser } from '@/lib/push-notifications';
import { createAdminClient } from '@/lib/supabase/admin';

export const TIPO_NOTIF_SEGURO = 'documento_seguro_vence';
export const TIPO_NOTIF_CARNET = 'documento_carnet_vence';

// ─── Dashboard del club ─────────────────────────────────────────────────────

export type SeguroPorVencer = {
  documentoId: string;
  socioId: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  /** Día del vencimiento, 'YYYY-MM-DD'. */
  vencimiento: string;
  /** Días que faltan (0 = vence hoy). Negativo = ya venció. */
  dias: number;
};

/**
 * Seguros de los socios ACTIVOS del club que vencen en los próximos
 * `DIAS_AVISO_VENCIMIENTO` días o que ya vencieron. Es lo que muestra la sección
 * "Documentación con vencimiento próximo" del Dashboard.
 *
 * - Solo `tipo = 'seguro'`. El certificado náutico es del socio y no entra acá.
 * - Si el socio tiene más de un seguro cargado cuenta UNO: el predeterminado, y si no
 *   hay, el más reciente. Así un seguro nuevo (aunque todavía no tenga fecha) reemplaza
 *   al viejo vencido y no genera una alerta falsa.
 * - Los seguros sin fecha no aparecen: la fecha la carga el club a mano.
 * - Scopeado por `guarderia_id` vía las memberships activas del socio en este club.
 */
export async function listarSegurosPorVencer(guarderiaId: string): Promise<SeguroPorVencer[]> {
  const rows = await db
    .selectDistinctOn([documentos.profileId], {
      documentoId: documentos.id,
      socioId: documentos.profileId,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      email: profiles.email,
      vencimiento: documentos.vencimiento,
    })
    .from(documentos)
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, documentos.profileId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.rol, 'socio'),
        eq(memberships.status, 'active'),
      ),
    )
    .innerJoin(profiles, eq(profiles.id, documentos.profileId))
    .where(eq(documentos.tipo, 'seguro'))
    .orderBy(documentos.profileId, desc(documentos.predeterminado), desc(documentos.createdAt));

  const hoy = todayArg();
  const out: SeguroPorVencer[] = [];
  for (const r of rows) {
    const ymd = argYmd(r.vencimiento);
    if (!ymd) continue;
    const dias = diasEntre(ymd, hoy);
    if (dias > DIAS_AVISO_VENCIMIENTO) continue;
    out.push({
      documentoId: r.documentoId,
      socioId: r.socioId,
      nombre: r.nombre,
      apellido: r.apellido,
      email: r.email,
      vencimiento: ymd,
      dias,
    });
  }
  return out.sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
}

// ─── Aviso al socio (cron diario) ───────────────────────────────────────────

export type ResultadoAvisos = {
  candidatos: number;
  avisados: number;
  yaAvisados: number;
  errores: number;
};

function textoDias(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return `en ${dias} días`;
}

/**
 * Avisa a cada socio cuyo seguro o certificado náutico vence dentro de los próximos
 * `DIAS_AVISO_VENCIMIENTO` días (hasta el día del vencimiento inclusive): deja la
 * notificación en la campanita de la app y manda el push.
 *
 * IDEMPOTENTE: hay un índice único (mig 0171) sobre (usuario, tipo, documento, fecha de
 * vencimiento). Una segunda corrida, un reintento o un deploy en el medio no repiten el
 * aviso, y como se avisa dentro de la ventana y no un día exacto, un día que el cron no
 * corrió no se pierde. Si el documento se renueva con otra fecha, es otra clave y se
 * vuelve a avisar.
 *
 * Los ya vencidos NO se avisan acá (solo los que están por vencer).
 */
export async function avisarVencimientosDocumentos(): Promise<ResultadoAvisos> {
  const rows = await db
    .selectDistinctOn([documentos.profileId, documentos.tipo], {
      documentoId: documentos.id,
      socioId: documentos.profileId,
      tipo: documentos.tipo,
      vencimiento: documentos.vencimiento,
    })
    .from(documentos)
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, documentos.profileId),
        eq(memberships.rol, 'socio'),
        eq(memberships.status, 'active'),
      ),
    )
    .where(inArray(documentos.tipo, ['seguro', 'carnet_nautico']))
    .orderBy(
      documentos.profileId,
      documentos.tipo,
      desc(documentos.predeterminado),
      desc(documentos.createdAt),
    );

  const hoy = todayArg();
  const admin = createAdminClient();
  const res: ResultadoAvisos = { candidatos: 0, avisados: 0, yaAvisados: 0, errores: 0 };

  for (const r of rows) {
    const ymd = argYmd(r.vencimiento);
    if (!ymd) continue;
    const dias = diasEntre(ymd, hoy);
    if (dias < 0 || dias > DIAS_AVISO_VENCIMIENTO) continue;
    res.candidatos++;

    const esSeguro = r.tipo === 'seguro';
    const tipoNotif = esSeguro ? TIPO_NOTIF_SEGURO : TIPO_NOTIF_CARNET;
    const titulo = esSeguro
      ? `Tu seguro vence ${textoDias(dias)}`
      : `Tu certificado náutico vence ${textoDias(dias)}`;
    const cuerpo = esSeguro
      ? `Vence el ${fechaLegible(ymd)}. Renovalo y avisale a tu club.`
      : `Vence el ${fechaLegible(ymd)}. Acordate de renovarlo.`;

    const { data: notif, error } = await admin
      .from('notificaciones')
      .insert({
        user_id: r.socioId,
        tipo: tipoNotif,
        payload: {
          documento_id: r.documentoId,
          documento_tipo: r.tipo,
          vencimiento: ymd,
          dias_restantes: dias,
          titulo,
          cuerpo,
        },
      })
      .select('id')
      .single();

    if (error) {
      // 23505 = ya se le avisó por este documento y esta fecha.
      if (error.code === '23505') res.yaAvisados++;
      else {
        res.errores++;
        console.error('[avisarVencimientosDocumentos] no se pudo crear la notificación', {
          socioId: r.socioId,
          tipo: r.tipo,
          error: error.message,
        });
      }
      continue;
    }

    await sendPushToUser({
      userId: r.socioId,
      title: titulo,
      body: cuerpo,
      data: {
        tipo: tipoNotif,
        documento_id: r.documentoId,
        notificacion_id: notif.id as string,
      },
    });
    await admin
      .from('notificaciones')
      .update({ push_sent_at: new Date().toISOString() })
      .eq('id', notif.id as string);
    res.avisados++;
  }

  return res;
}
