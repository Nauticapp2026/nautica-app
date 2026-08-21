import { and, count as sqlCount, desc, eq, gte } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { areas, comunicaciones, comunicacionesMails, espacios, profiles } from '@/lib/db/schema';
import { getPlanFeatureLimits } from '@/lib/pricing/limits';

import { ComunicacionesClient, type Comunicacion } from './comunicaciones-client';
import type { AreaOption, EnvioMail } from './mails-client';

export default async function ComunicacionesPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const isAdmin =
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo';
  if (!isAdmin) redirect('/dashboard');

  const guarderiaId = ctx.activeMembership.guarderiaId;
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [limitsMap, rows, countRows, areaRows, envioRows] = await Promise.all([
    getPlanFeatureLimits(guarderiaId, ['com_cerrada', 'com_abierta']),

    db
      .select({
        id: comunicaciones.id,
        titulo: comunicaciones.titulo,
        texto: comunicaciones.texto,
        categoria: comunicaciones.categoria,
        tipo: comunicaciones.tipo,
        publicar: comunicaciones.publicar,
        fecha: comunicaciones.fecha,
        imagenUrls: comunicaciones.imagenUrls,
        createdAt: comunicaciones.createdAt,
        autorNombre: profiles.nombre,
        autorApellido: profiles.apellido,
        autorEmail: profiles.email,
      })
      .from(comunicaciones)
      .leftJoin(profiles, eq(profiles.id, comunicaciones.autorId))
      .where(eq(comunicaciones.guarderiaId, guarderiaId))
      .orderBy(desc(comunicaciones.createdAt)),

    db
      .select({ tipo: comunicaciones.tipo, total: sqlCount() })
      .from(comunicaciones)
      .where(
        and(
          eq(comunicaciones.guarderiaId, guarderiaId),
          gte(comunicaciones.createdAt, startOfMonth),
        ),
      )
      .groupBy(comunicaciones.tipo),

    // Áreas del club con su cantidad de espacios, para elegir destinatarios.
    db
      .select({
        id: areas.id,
        nombre: areas.nombre,
        espacios: sqlCount(espacios.id),
      })
      .from(areas)
      .leftJoin(espacios, eq(espacios.areaId, areas.id))
      .where(eq(areas.guarderiaId, guarderiaId))
      .groupBy(areas.id, areas.nombre)
      .orderBy(areas.nombre),

    // Historial de mails enviados.
    db
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
      .where(eq(comunicacionesMails.guarderiaId, guarderiaId))
      .orderBy(desc(comunicacionesMails.createdAt))
      .limit(100),
  ]);

  const usedCerradas = Number(countRows.find((r) => r.tipo === 'socios')?.total ?? 0);
  const usedAbiertas = Number(countRows.find((r) => r.tipo === 'publica')?.total ?? 0);

  const items: Comunicacion[] = rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    texto: r.texto,
    categoria: r.categoria,
    tipo: r.tipo ?? 'socios',
    publicar: r.publicar ?? false,
    fecha: r.fecha ? r.fecha.toISOString() : null,
    imagenUrls: r.imagenUrls ?? [],
    createdAt: r.createdAt.toISOString(),
    autor:
      [r.autorNombre, r.autorApellido].filter(Boolean).join(' ').trim() || r.autorEmail || null,
  }));

  const areasOpts: AreaOption[] = areaRows.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    espacios: Number(a.espacios ?? 0),
  }));

  const envios: EnvioMail[] = envioRows.map((r) => ({
    id: r.id,
    asunto: r.asunto,
    cuerpo: r.cuerpo,
    areaNombres: r.areaNombres ?? [],
    destinatarios: r.destinatarios,
    enviados: r.enviados,
    createdAt: r.createdAt.toISOString(),
    autor:
      [r.autorNombre, r.autorApellido].filter(Boolean).join(' ').trim() || r.autorEmail || null,
  }));

  return (
    <ComunicacionesClient
      comunicaciones={items}
      limitCerradas={limitsMap['com_cerrada']}
      limitAbiertas={limitsMap['com_abierta']}
      usedCerradas={usedCerradas}
      usedAbiertas={usedAbiertas}
      areas={areasOpts}
      envios={envios}
    />
  );
}
