/**
 * Avisos por mail de los planes de mantenimiento preventivo de Bienes de uso (solo servidor).
 *
 * Lo corre el cron diario `/api/cron/mantenimiento-bienes`. Para cada plan activo con fecha
 * agendada manda UN mail por etapa a los correos de mantenimiento del bien:
 *   · "previo": cuando faltan 7 días o menos,
 *   · "dia":    el día del mantenimiento (o, si ya pasó y nunca se avisó, la primera vez que se detecta).
 * Idempotente: `bien_uso_avisos` tiene una fila por (plan, fecha agendada, etapa), así que una
 * doble corrida no repite el mail; si el mail falla, se borra la fila y se reintenta al día
 * siguiente. Si se reagenda el plan (otra fecha), vuelve a avisar para la fecha nueva.
 */

import { and, eq, isNull, lte, isNotNull } from 'drizzle-orm';

import { todayArg, addDiasYmd } from '@/lib/dates';
import { db } from '@/lib/db';
import { bienUsoAvisos, bienUsoPlanes, bienesUso, guarderias } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email/resend';
import { avisoClubEmail } from '@/lib/email/templates/aviso-club';
import { diasHasta } from './mantenimiento';

export type ResultadoAvisos = {
  /** Planes con fecha dentro de la ventana de aviso (hasta 7 días) o vencidos. */
  candidatos: number;
  enviados: number;
  /** Ya avisados antes (misma fecha y etapa). */
  yaAvisados: number;
  /** Sin correos de mantenimiento cargados en el bien. */
  sinCorreos: number;
  errores: number;
  /** Solo con dryRun: qué se enviaría. */
  detalle?: { bien: string; plan: string; fecha: string; etapa: string; para: string[] }[];
};

const FRECUENCIA_LABEL: Record<string, string> = {
  dias: 'días',
  meses: 'meses',
  horas: 'horas de uso',
};

function fechaLarga(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export async function avisarMantenimientos(
  opciones: { dryRun?: boolean } = {},
): Promise<ResultadoAvisos> {
  const hoy = todayArg();
  const limite = addDiasYmd(hoy, 7);

  const filas = await db
    .select({
      planId: bienUsoPlanes.id,
      plan: bienUsoPlanes.descripcion,
      proxima: bienUsoPlanes.proximaFecha,
      frecuenciaTipo: bienUsoPlanes.frecuenciaTipo,
      frecuenciaValor: bienUsoPlanes.frecuenciaValor,
      bien: bienesUso.nombre,
      numero: bienesUso.numero,
      emails: bienesUso.mantenimientoEmails,
      club: guarderias.nombre,
    })
    .from(bienUsoPlanes)
    .innerJoin(bienesUso, eq(bienesUso.id, bienUsoPlanes.bienId))
    .innerJoin(guarderias, eq(guarderias.id, bienUsoPlanes.guarderiaId))
    .where(
      and(
        eq(bienUsoPlanes.activo, true),
        isNotNull(bienUsoPlanes.proximaFecha),
        lte(bienUsoPlanes.proximaFecha, limite),
        // Un bien dado de baja ya no se mantiene.
        isNull(bienesUso.fechaBaja),
      ),
    );

  const res: ResultadoAvisos = {
    candidatos: filas.length,
    enviados: 0,
    yaAvisados: 0,
    sinCorreos: 0,
    errores: 0,
    detalle: opciones.dryRun ? [] : undefined,
  };

  for (const f of filas) {
    const fecha = f.proxima as string;
    const etapa = diasHasta(fecha, hoy) <= 0 ? 'dia' : 'previo';
    const destinatarios = f.emails;

    if (destinatarios.length === 0) {
      res.sinCorreos++;
      continue;
    }
    const [ya] = await db
      .select({ planId: bienUsoAvisos.planId })
      .from(bienUsoAvisos)
      .where(
        and(
          eq(bienUsoAvisos.planId, f.planId),
          eq(bienUsoAvisos.fechaProgramada, fecha),
          eq(bienUsoAvisos.etapa, etapa),
        ),
      )
      .limit(1);
    if (ya) {
      res.yaAvisados++;
      continue;
    }

    if (opciones.dryRun) {
      res.detalle?.push({
        bien: `#${f.numero} ${f.bien}`,
        plan: f.plan,
        fecha,
        etapa,
        para: destinatarios,
      });
      res.enviados++;
      continue;
    }

    // Se reserva el aviso ANTES de mandar: si dos corridas se pisan, solo una lo manda.
    const reservado = await db
      .insert(bienUsoAvisos)
      .values({ planId: f.planId, fechaProgramada: fecha, etapa })
      .onConflictDoNothing()
      .returning({ planId: bienUsoAvisos.planId });
    if (reservado.length === 0) {
      res.yaAvisados++;
      continue;
    }

    const dias = diasHasta(fecha, hoy);
    const cuando =
      dias > 0
        ? `Faltan ${dias} ${dias === 1 ? 'día' : 'días'}: está agendado para el ${fechaLarga(fecha)}.`
        : dias === 0
          ? `Está agendado para hoy (${fechaLarga(fecha)}).`
          : `Estaba agendado para el ${fechaLarga(fecha)} y todavía no se registró como hecho.`;
    const { subject, html } = avisoClubEmail({
      nombreSocio: null,
      nombreClub: f.club,
      asunto: `Mantenimiento ${dias > 0 ? 'próximo' : 'programado'}: ${f.bien}`,
      cuerpo: [
        `Bien de uso: #${f.numero} ${f.bien}`,
        `Plan de mantenimiento preventivo: ${f.plan}`,
        `${cuando}`,
        `Frecuencia: cada ${f.frecuenciaValor} ${FRECUENCIA_LABEL[f.frecuenciaTipo] ?? f.frecuenciaTipo}.`,
        'Cuando se haga, registralo en Bienes de uso → Mantenimiento y reparaciones, indicando que cumple este plan: se agenda solo el siguiente.',
      ].join('\n\n'),
    });

    let algunoOk = false;
    for (const para of destinatarios) {
      const r = await sendEmail({ to: para, subject, html });
      if (r.ok) algunoOk = true;
      else console.error('[cron/mantenimiento-bienes] mail fallido', para, r.error);
    }
    if (algunoOk) {
      res.enviados++;
    } else {
      // No salió ningún mail: se libera el aviso para reintentar en la próxima corrida.
      res.errores++;
      await db
        .delete(bienUsoAvisos)
        .where(
          and(
            eq(bienUsoAvisos.planId, f.planId),
            eq(bienUsoAvisos.fechaProgramada, fecha),
            eq(bienUsoAvisos.etapa, etapa),
          ),
        );
    }
  }
  return res;
}
