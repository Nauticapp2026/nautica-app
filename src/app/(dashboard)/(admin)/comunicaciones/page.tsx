import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { comunicaciones, profiles } from '@/lib/db/schema';

import { ComunicacionesClient, type Comunicacion } from './comunicaciones-client';

export default async function ComunicacionesPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const isAdmin =
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo';
  if (!isAdmin) redirect('/dashboard');

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const rows = await db
    .select({
      id: comunicaciones.id,
      titulo: comunicaciones.titulo,
      texto: comunicaciones.texto,
      categoria: comunicaciones.categoria,
      tipo: comunicaciones.tipo,
      publicar: comunicaciones.publicar,
      fecha: comunicaciones.fecha,
      imagenUrls: comunicaciones.imagenUrls,
      autorNombre: profiles.nombre,
      autorApellido: profiles.apellido,
      autorEmail: profiles.email,
    })
    .from(comunicaciones)
    .leftJoin(profiles, eq(profiles.id, comunicaciones.autorId))
    .where(eq(comunicaciones.guarderiaId, guarderiaId))
    .orderBy(desc(comunicaciones.createdAt));

  const items: Comunicacion[] = rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    texto: r.texto,
    categoria: r.categoria,
    tipo: r.tipo ?? 'socios',
    publicar: r.publicar ?? false,
    fecha: r.fecha ? r.fecha.toISOString() : null,
    imagenUrls: r.imagenUrls ?? [],
    autor:
      [r.autorNombre, r.autorApellido].filter(Boolean).join(' ').trim() || r.autorEmail || null,
  }));

  return <ComunicacionesClient comunicaciones={items} />;
}
