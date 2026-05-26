import { and, count as sqlCount, desc, eq, gte } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { comunicaciones, guarderias, profiles } from '@/lib/db/schema';

import { ComunicacionesClient, type Comunicacion } from './comunicaciones-client';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const COM_LIMITS: Record<string, { cerradas: number; abiertas: number }> = {
  esencial: { cerradas: 2, abiertas: 0 },
  premium: { cerradas: 2, abiertas: 2 },
  elite: { cerradas: 5, abiertas: 5 },
};

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

  const [guarderiaRow, rows, countRows] = await Promise.all([
    db
      .select({ plan: guarderias.plan })
      .from(guarderias)
      .where(eq(guarderias.id, guarderiaId))
      .limit(1),

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
  ]);

  const plan = guarderiaRow[0]?.plan ?? 'esencial';
  const limits = COM_LIMITS[plan] ?? COM_LIMITS.esencial;
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
    // eslint-disable-next-line react-hooks/purity
    isEditable: Date.now() - r.createdAt.getTime() <= EDIT_WINDOW_MS,
    autor:
      [r.autorNombre, r.autorApellido].filter(Boolean).join(' ').trim() || r.autorEmail || null,
  }));

  return (
    <ComunicacionesClient
      comunicaciones={items}
      limitCerradas={limits.cerradas}
      limitAbiertas={limits.abiertas}
      usedCerradas={usedCerradas}
      usedAbiertas={usedAbiertas}
    />
  );
}
