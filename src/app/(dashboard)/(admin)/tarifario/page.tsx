import { redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { guarderias, servicios, serviciosAjustesProgramados } from '@/lib/db/schema';
import { ADMIN_ROLES } from '@/config/roles';

import { TarifarioClient, type Tarifa } from './tarifario-client';

export default async function TarifarioPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const isAdmin =
    ctx.profile.isSuperAdmin ||
    ADMIN_ROLES.includes(ctx.activeMembership.rol as (typeof ADMIN_ROLES)[number]);
  if (!isAdmin) redirect('/dashboard');

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // Un club Monotributista emite siempre Factura C, sin discriminar IVA: el
  // selector de alícuota del tarifario se bloquea en "Exento / No gravado".
  const [guarderiaRow] = await db
    .select({ condicionIva: guarderias.condicionIva })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);
  const clubMonotributo = guarderiaRow?.condicionIva === 'monotributo';

  const rows = await db
    .select({
      id: servicios.id,
      nombre: servicios.nombre,
      tipo: servicios.tipo,
      tipoCobro: servicios.tipoCobro,
      tarifaVariable: servicios.tarifaVariable,
      precio: servicios.precio,
      estado: servicios.estado,
      medida: servicios.medida,
      locacion: servicios.locacion,
      unidadMetraje: servicios.unidadMetraje,
      eslora: servicios.eslora,
      manga: servicios.manga,
      puntual: servicios.puntual,
      vigenciaDesde: servicios.vigenciaDesde,
      vigenciaHasta: servicios.vigenciaHasta,
      alicuotaIva: servicios.alicuotaIva,
      plazoPagoDias: servicios.plazoPagoDias,
      politicaBajaAnticipada: servicios.politicaBajaAnticipada,
    })
    .from(servicios)
    .where(eq(servicios.guarderiaId, guarderiaId))
    .orderBy(asc(servicios.tipo), asc(servicios.nombre));

  // Ajustes de precio programados a futuro y todavía sin aplicar (uno por
  // servicio: índice único parcial). Se muestran como cambio pendiente.
  const ajustesRows = await db
    .select({
      servicioId: serviciosAjustesProgramados.servicioId,
      precioNuevo: serviciosAjustesProgramados.precioNuevo,
      fechaAplicacion: serviciosAjustesProgramados.fechaAplicacion,
    })
    .from(serviciosAjustesProgramados)
    .where(
      and(
        eq(serviciosAjustesProgramados.guarderiaId, guarderiaId),
        eq(serviciosAjustesProgramados.aplicado, false),
      ),
    );

  const ajustePorServicio = new Map(ajustesRows.map((a) => [a.servicioId, a]));

  const toNum = (v: string | null) => (v != null ? Number(v) : null);

  const tarifas: Tarifa[] = rows.map((r) => {
    const aj = ajustePorServicio.get(r.id);
    return {
      id: r.id,
      nombre: r.nombre,
      tipo: r.tipo,
      tipoCobro: r.tipoCobro ?? 'fijo',
      tarifaVariable: r.tarifaVariable,
      precio: r.precio != null ? Number(r.precio) : 0,
      estado: r.estado ?? 'activo',
      medida: r.medida,
      locacion: r.locacion,
      unidadMetraje: r.unidadMetraje,
      eslora: toNum(r.eslora),
      manga: toNum(r.manga),
      puntual: toNum(r.puntual),
      vigenciaDesde: r.vigenciaDesde,
      vigenciaHasta: r.vigenciaHasta,
      alicuotaIva: r.alicuotaIva != null ? Number(r.alicuotaIva) : 21,
      plazoPagoDias: r.plazoPagoDias ?? 0,
      politicaBajaAnticipada: r.politicaBajaAnticipada,
      ajusteProgramado: aj
        ? { precioNuevo: Number(aj.precioNuevo), fechaAplicacion: aj.fechaAplicacion }
        : null,
    };
  });

  return <TarifarioClient tarifas={tarifas} clubMonotributo={clubMonotributo} />;
}
