import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { servicios } from '@/lib/db/schema';

import { TarifarioClient, type Tarifa } from './tarifario-client';

export default async function TarifarioPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const isAdmin = ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
  if (!isAdmin) redirect('/dashboard');

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const rows = await db
    .select({
      id: servicios.id,
      nombre: servicios.nombre,
      tipo: servicios.tipo,
      precio: servicios.precio,
      estado: servicios.estado,
      medida: servicios.medida,
      locacion: servicios.locacion,
      unidadMetraje: servicios.unidadMetraje,
      eslora: servicios.eslora,
      manga: servicios.manga,
      puntual: servicios.puntual,
    })
    .from(servicios)
    .where(eq(servicios.guarderiaId, guarderiaId))
    .orderBy(asc(servicios.tipo), asc(servicios.nombre));

  const toNum = (v: string | null) => (v != null ? Number(v) : null);

  const tarifas: Tarifa[] = rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo,
    precio: r.precio != null ? Number(r.precio) : 0,
    estado: r.estado ?? 'activo',
    medida: r.medida,
    locacion: r.locacion,
    unidadMetraje: r.unidadMetraje,
    eslora: toNum(r.eslora),
    manga: toNum(r.manga),
    puntual: toNum(r.puntual),
  }));

  return <TarifarioClient tarifas={tarifas} />;
}
