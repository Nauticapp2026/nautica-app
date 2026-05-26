import { desc, eq } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { comunicaciones, guarderias, profiles, publicaciones } from '@/lib/db/schema';
import { ModeracionClient, type ComunicacionClub, type PublicacionClub } from './moderacion-client';

export const dynamic = 'force-dynamic';

export default async function SuperAdminModeracionPage() {
  await requireSuperAdmin();

  const [comunicacionesRows, publicacionesRows] = await Promise.all([
    db
      .select({
        id: comunicaciones.id,
        guarderiaId: comunicaciones.guarderiaId,
        guarderiaName: guarderias.nombre,
        titulo: comunicaciones.titulo,
        texto: comunicaciones.texto,
        categoria: comunicaciones.categoria,
        tipo: comunicaciones.tipo,
        publicar: comunicaciones.publicar,
        fecha: comunicaciones.fecha,
        imagenUrls: comunicaciones.imagenUrls,
        autorNombre: profiles.nombre,
        autorApellido: profiles.apellido,
      })
      .from(comunicaciones)
      .leftJoin(guarderias, eq(guarderias.id, comunicaciones.guarderiaId))
      .leftJoin(profiles, eq(profiles.id, comunicaciones.autorId))
      .orderBy(desc(comunicaciones.createdAt))
      .limit(500),

    db
      .select({
        id: publicaciones.id,
        guarderiaId: publicaciones.guarderiaId,
        guarderiaName: guarderias.nombre,
        tipo: publicaciones.tipo,
        ubicacion: publicaciones.ubicacion,
        eslora: publicaciones.eslora,
        manga: publicaciones.manga,
        unidadMetraje: publicaciones.unidadMetraje,
        precio: publicaciones.precio,
        expensas: publicaciones.expensas,
        servicios: publicaciones.servicios,
        imagenUrls: publicaciones.imagenUrls,
        estado: publicaciones.estado,
        createdAt: publicaciones.createdAt,
        autorNombre: profiles.nombre,
        autorApellido: profiles.apellido,
      })
      .from(publicaciones)
      .leftJoin(guarderias, eq(guarderias.id, publicaciones.guarderiaId))
      .leftJoin(profiles, eq(profiles.id, publicaciones.autorId))
      .orderBy(desc(publicaciones.createdAt))
      .limit(500),
  ]);

  const comData: ComunicacionClub[] = comunicacionesRows.map((r) => ({
    id: r.id,
    guarderiaId: r.guarderiaId,
    guarderiaName: r.guarderiaName ?? '—',
    titulo: r.titulo,
    texto: r.texto,
    categoria: r.categoria,
    tipo: r.tipo ?? 'socios',
    publicar: r.publicar ?? false,
    fecha: r.fecha ? r.fecha.toISOString() : null,
    imagenUrls: r.imagenUrls ?? [],
    autorNombre: [r.autorNombre, r.autorApellido].filter(Boolean).join(' ') || null,
  }));

  const pubData: PublicacionClub[] = publicacionesRows.map((r) => ({
    id: r.id,
    guarderiaId: r.guarderiaId,
    guarderiaName: r.guarderiaName ?? '—',
    tipo: r.tipo,
    ubicacion: r.ubicacion,
    eslora: r.eslora,
    manga: r.manga,
    unidadMetraje: r.unidadMetraje,
    precio: r.precio,
    expensas: r.expensas,
    servicios: r.servicios ?? [],
    imagenUrls: r.imagenUrls ?? [],
    estado: r.estado,
    createdAt: r.createdAt.toISOString(),
    autorNombre: [r.autorNombre, r.autorApellido].filter(Boolean).join(' ') || null,
  }));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="page-title">Moderación</h1>
        <p className="page-subtitle mt-1">
          Comunicaciones y publicaciones creadas por los clubes. Eliminá contenido que no cumpla con
          las normas.
        </p>
      </div>
      <ModeracionClient comunicaciones={comData} publicaciones={pubData} />
    </div>
  );
}
