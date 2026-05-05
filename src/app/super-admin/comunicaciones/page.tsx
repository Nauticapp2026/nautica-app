import { desc, eq } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { platformComunicaciones, profiles } from '@/lib/db/schema';

import { PlatformComunicacionesClient, type PlatformComunicacion } from './comunicaciones-client';

export const dynamic = 'force-dynamic';

export default async function SuperAdminComunicacionesPage() {
  await requireSuperAdmin();

  const rows = await db
    .select({
      id: platformComunicaciones.id,
      titulo: platformComunicaciones.titulo,
      texto: platformComunicaciones.texto,
      categoria: platformComunicaciones.categoria,
      tipo: platformComunicaciones.tipo,
      publicar: platformComunicaciones.publicar,
      fecha: platformComunicaciones.fecha,
      imagenUrls: platformComunicaciones.imagenUrls,
      autorNombre: profiles.nombre,
      autorApellido: profiles.apellido,
      autorEmail: profiles.email,
    })
    .from(platformComunicaciones)
    .leftJoin(profiles, eq(profiles.id, platformComunicaciones.autorId))
    .orderBy(desc(platformComunicaciones.createdAt));

  const items: PlatformComunicacion[] = rows.map((r) => ({
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

  return <PlatformComunicacionesClient comunicaciones={items} />;
}
