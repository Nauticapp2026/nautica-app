import { and, desc, eq, like } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  embarcaciones,
  facturacion,
  memberships,
  movimientosCuentaCorriente,
  profiles,
} from '@/lib/db/schema';

import { CobranzaClient, type SocioOption } from './cobranza-client';
import { CobranzaTabla, type CobranzaRow } from './cobranza-tabla';

export default async function CobranzasPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;

  const [socios, barcos, recibos] = await Promise.all([
    db
      .select({
        id: profiles.id,
        nombre: profiles.nombre,
        apellido: profiles.apellido,
        numeroSocio: memberships.numeroSocio,
      })
      .from(memberships)
      .innerJoin(profiles, eq(profiles.id, memberships.userId))
      .where(
        and(
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
          eq(memberships.status, 'active'),
        ),
      )
      .orderBy(profiles.apellido, profiles.nombre),

    db
      .select({
        profileId: embarcaciones.profileId,
        nombre: embarcaciones.nombre,
        matricula: embarcaciones.matricula,
      })
      .from(embarcaciones)
      .where(eq(embarcaciones.guarderiaId, gId)),

    // Recibos de cobranza (RC-).
    db
      .select({
        id: facturacion.id,
        codigo: facturacion.codigo,
        emision: facturacion.emision,
        importe: facturacion.importe,
        anulada: facturacion.anulada,
        anuladaAt: facturacion.anuladaAt,
        socioNombre: profiles.nombre,
        socioApellido: profiles.apellido,
        numeroSocio: memberships.numeroSocio,
        datosPago: movimientosCuentaCorriente.datosPago,
      })
      .from(facturacion)
      .leftJoin(profiles, eq(profiles.id, facturacion.socioId))
      .leftJoin(
        memberships,
        and(eq(memberships.userId, facturacion.socioId), eq(memberships.guarderiaId, gId)),
      )
      .leftJoin(
        movimientosCuentaCorriente,
        eq(movimientosCuentaCorriente.id, facturacion.movimientoId),
      )
      .where(
        and(
          eq(facturacion.guarderiaId, gId),
          eq(facturacion.tipoFactura, 'recibo'),
          like(facturacion.codigo, 'RC-%'),
        ),
      )
      .orderBy(desc(facturacion.emision))
      .limit(300),
  ]);

  // Agrupar embarcaciones (nombre/matrícula) por socio para el filtro.
  const barcosPorSocio = new Map<string, string[]>();
  for (const b of barcos) {
    if (!b.profileId) continue;
    const arr = barcosPorSocio.get(b.profileId) ?? [];
    if (b.nombre) arr.push(b.nombre);
    if (b.matricula) arr.push(b.matricula);
    barcosPorSocio.set(b.profileId, arr);
  }

  const sociosOptions: SocioOption[] = socios.map((s) => ({
    id: s.id,
    nombre: [s.nombre, s.apellido].filter(Boolean).join(' ') || 'Sin nombre',
    numeroSocio: s.numeroSocio,
    embarcaciones: barcosPorSocio.get(s.id) ?? [],
  }));

  const cobranzas: CobranzaRow[] = recibos.map((r) => {
    // `datosPago.formas` = [{ tipo, monto, datos }] — solo se muestra
    // tipo+monto en la tabla, los campos de `datos` quedan en el recibo.
    const datosPago = r.datosPago as { formas?: { tipo: string; monto: string }[] } | null;
    const formas = (datosPago?.formas ?? []).map((f) => ({ tipo: f.tipo, monto: f.monto }));
    return {
      id: r.id,
      codigo: r.codigo,
      fecha: r.emision ? r.emision.toISOString() : null,
      importe: r.importe ?? '0',
      anulada: r.anulada,
      anuladaAt: r.anuladaAt ? r.anuladaAt.toISOString() : null,
      socioNombre: [r.socioNombre, r.socioApellido].filter(Boolean).join(' ') || '—',
      numeroSocio: r.numeroSocio,
      formas,
    };
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Registro de Cobranza</h1>
          <p className="page-subtitle">
            Registrá los pagos de tus socios y aplicalos a sus comprobantes.
          </p>
        </div>
        <CobranzaClient socios={sociosOptions} />
      </div>
      <CobranzaTabla cobranzas={cobranzas} />
    </div>
  );
}
