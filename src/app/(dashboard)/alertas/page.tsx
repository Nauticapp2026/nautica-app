import { and, asc, desc, eq } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { alertas, embarcaciones, porteria, profiles } from '@/lib/db/schema';

import { AlertasClient, type AlertaRow } from './alertas-client';

export default async function AlertasPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;

  const rows = await db
    .select({
      id: alertas.id,
      tipo: alertas.tipo,
      estado: alertas.estado,
      mensaje: alertas.mensaje,
      createdAt: alertas.createdAt,
      porteriaId: alertas.porteriaId,
      socioId: alertas.socioId,
      socioNombre: profiles.nombre,
      socioApellido: profiles.apellido,
      socioEmail: profiles.email,
      socioTelefono: profiles.telefono,
      desde: porteria.desde,
      hasta: porteria.hasta,
      arribadaEn: porteria.arribadaEn,
      embarcacionNombre: embarcaciones.nombre,
      embarcacionMatricula: embarcaciones.matricula,
    })
    .from(alertas)
    .leftJoin(porteria, eq(porteria.id, alertas.porteriaId))
    .leftJoin(profiles, eq(profiles.id, alertas.socioId))
    .leftJoin(embarcaciones, eq(embarcaciones.id, porteria.embarcacionId))
    .where(and(eq(alertas.guarderiaId, gId), eq(alertas.estado, 'pendiente')))
    // sin_respuesta < retorno_proximo alfabéticamente, pero queremos críticas arriba.
    // orderamos por tipo asc (sin_respuesta primero) y después por created desc.
    .orderBy(asc(alertas.tipo), desc(alertas.createdAt))
    .limit(500);

  const alertasRows: AlertaRow[] = rows.map((r) => ({
    id: r.id,
    tipo: r.tipo as 'retorno_proximo' | 'sin_respuesta',
    mensaje: r.mensaje,
    createdAt: r.createdAt.toISOString(),
    porteriaId: r.porteriaId,
    socioNombre:
      [r.socioNombre, r.socioApellido].filter(Boolean).join(' ') || r.socioEmail || 'Sin socio',
    socioTelefono: r.socioTelefono,
    desde: r.desde ? r.desde.toISOString() : null,
    hasta: r.hasta ? r.hasta.toISOString() : null,
    arribadaEn: r.arribadaEn ? r.arribadaEn.toISOString() : null,
    embarcacion: r.embarcacionMatricula
      ? `${r.embarcacionNombre ?? ''} (${r.embarcacionMatricula})`.trim()
      : r.embarcacionNombre,
  }));

  return <AlertasClient alertas={alertasRows} />;
}
