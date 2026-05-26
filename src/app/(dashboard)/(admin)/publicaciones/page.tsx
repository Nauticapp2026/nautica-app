import { redirect } from 'next/navigation';
import { desc, count as sqlCount, eq } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { guarderias, publicaciones, profiles } from '@/lib/db/schema';

import { PublicacionesClient, type PublicacionItem } from './publicaciones-client';

const PLAN_LIMITS: Record<string, number> = {
  esencial: 0,
  premium: 2,
  elite: 5,
};

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export default async function PublicacionesPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const isAdmin =
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo';
  if (!isAdmin) redirect('/dashboard');

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [guarderiaRow, rows] = await Promise.all([
    db
      .select({ plan: guarderias.plan })
      .from(guarderias)
      .where(eq(guarderias.id, guarderiaId))
      .limit(1),
    db
      .select({
        id: publicaciones.id,
        tipo: publicaciones.tipo,
        ubicacion: publicaciones.ubicacion,
        eslora: publicaciones.eslora,
        manga: publicaciones.manga,
        unidadMetraje: publicaciones.unidadMetraje,
        expensas: publicaciones.expensas,
        precio: publicaciones.precio,
        servicios: publicaciones.servicios,
        imagenUrls: publicaciones.imagenUrls,
        estado: publicaciones.estado,
        createdAt: publicaciones.createdAt,
        autorNombre: profiles.nombre,
        autorApellido: profiles.apellido,
        autorEmail: profiles.email,
      })
      .from(publicaciones)
      .leftJoin(profiles, eq(profiles.id, publicaciones.autorId))
      .where(eq(publicaciones.guarderiaId, guarderiaId))
      .orderBy(desc(publicaciones.createdAt)),
  ]);

  const plan = guarderiaRow[0]?.plan ?? 'esencial';
  const limit = PLAN_LIMITS[plan] ?? 0;

  const items: PublicacionItem[] = rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    ubicacion: r.ubicacion,
    eslora: r.eslora,
    manga: r.manga,
    unidadMetraje: r.unidadMetraje,
    expensas: r.expensas,
    precio: r.precio,
    servicios: (r.servicios ?? []) as PublicacionItem['servicios'],
    imagenUrls: r.imagenUrls ?? [],
    estado: r.estado,
    createdAt: r.createdAt.toISOString(),
    // eslint-disable-next-line react-hooks/purity
    isEditable: Date.now() - r.createdAt.getTime() <= EDIT_WINDOW_MS,
    autor:
      [r.autorNombre, r.autorApellido].filter(Boolean).join(' ').trim() || r.autorEmail || null,
  }));

  return <PublicacionesClient items={items} plan={plan} limit={limit} />;
}
