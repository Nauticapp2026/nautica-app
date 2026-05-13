import { desc, eq } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { platformPublicidades, profiles } from '@/lib/db/schema';

import { PlatformPublicidadesClient, type PlatformPublicidad } from './publicidades-client';

export const dynamic = 'force-dynamic';

export default async function SuperAdminPublicidadesPage() {
  await requireSuperAdmin();

  const rows = await db
    .select({
      id: platformPublicidades.id,
      titulo: platformPublicidades.titulo,
      texto: platformPublicidades.texto,
      tamano: platformPublicidades.tamano,
      secciones: platformPublicidades.secciones,
      fechaInicio: platformPublicidades.fechaInicio,
      fechaFin: platformPublicidades.fechaFin,
      linkUrl: platformPublicidades.linkUrl,
      publicar: platformPublicidades.publicar,
      imagenUrls: platformPublicidades.imagenUrls,
      createdAt: platformPublicidades.createdAt,
      autorNombre: profiles.nombre,
      autorApellido: profiles.apellido,
      autorEmail: profiles.email,
    })
    .from(platformPublicidades)
    .leftJoin(profiles, eq(profiles.id, platformPublicidades.autorId))
    .orderBy(desc(platformPublicidades.createdAt));

  const items: PlatformPublicidad[] = rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    texto: r.texto,
    tamano: r.tamano,
    secciones: r.secciones ?? [],
    fechaInicio: r.fechaInicio,
    fechaFin: r.fechaFin,
    linkUrl: r.linkUrl,
    publicar: r.publicar,
    imagenUrls: r.imagenUrls ?? [],
    createdAt: r.createdAt.toISOString(),
    autor:
      [r.autorNombre, r.autorApellido].filter(Boolean).join(' ').trim() || r.autorEmail || null,
  }));

  return <PlatformPublicidadesClient publicidades={items} />;
}
