import { and, desc, eq, like } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  embarcaciones,
  facturacion,
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  paywayCobros,
  profiles,
} from '@/lib/db/schema';
import { identidadFacturacion } from '@/lib/facturacion/identidad';

import { CobranzaClient, type SocioOption } from './cobranza-client';
import { CobranzasTabsClient } from './cobranzas-tabs-client';
import { type CobranzaRow } from './cobranza-tabla';

export default async function CobranzasPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;

  const [socios, barcos, recibos, [guarderiaInfo], cobrosLista] = await Promise.all([
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
        tipoRecibo: facturacion.tipoRecibo,
        socioNombre: profiles.nombre,
        socioApellido: profiles.apellido,
        socioEmail: profiles.email,
        socioEmailFacturacion: profiles.emailFacturacion,
        socioRazonSocial: profiles.razonSocial,
        socioTipoDocumento: profiles.tipoDocumento,
        socioNumeroDocumento: profiles.numeroDocumento,
        socioCuit: profiles.cuit,
        socioCondicionIva: profiles.condicionIva,
        socioCondicionIvaPersonal: profiles.condicionIvaPersonal,
        socioFacturaFiscal: memberships.facturaFiscal,
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

    db
      .select({ nombre: guarderias.nombre, razonSocial: guarderias.razonSocial })
      .from(guarderias)
      .where(eq(guarderias.id, gId))
      .limit(1),

    db
      .select({
        id: paywayCobros.id,
        socioId: paywayCobros.socioId,
        socioNombre: profiles.nombre,
        socioApellido: profiles.apellido,
        monto: paywayCobros.monto,
        estado: paywayCobros.estado,
        errorMensaje: paywayCobros.errorMensaje,
        movimientosIds: paywayCobros.movimientosIds,
        createdAt: paywayCobros.createdAt,
      })
      .from(paywayCobros)
      .leftJoin(profiles, eq(profiles.id, paywayCobros.socioId))
      .where(eq(paywayCobros.guarderiaId, gId))
      .orderBy(desc(paywayCobros.createdAt))
      .limit(200),
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

  const entreEmisor = guarderiaInfo?.razonSocial?.trim() || guarderiaInfo?.nombre || '—';

  const cobranzas: CobranzaRow[] = recibos.map((r) => {
    // `datosPago.formas` = [{ tipo, monto, datos }] — solo se muestra
    // tipo+monto en la tabla, los campos de `datos` quedan en el recibo.
    const datosPago = r.datosPago as { formas?: { tipo: string; monto: string }[] } | null;
    const formas = (datosPago?.formas ?? []).map((f) => ({ tipo: f.tipo, monto: f.monto }));
    const identidad = identidadFacturacion({
      id: r.id,
      email: r.socioEmail ?? '',
      emailFacturacion: r.socioEmailFacturacion,
      nombre: r.socioNombre,
      apellido: r.socioApellido,
      razonSocial: r.socioRazonSocial,
      tipoDocumento: r.socioTipoDocumento,
      numeroDocumento: r.socioNumeroDocumento,
      cuit: r.socioCuit,
      direccion: null,
      direccionFiscal: null,
      condicionIva: r.socioCondicionIva,
      condicionIvaPersonal: r.socioCondicionIvaPersonal,
      facturaFiscal: r.socioFacturaFiscal ?? false,
    });
    return {
      id: r.id,
      codigo: r.codigo,
      fecha: r.emision ? r.emision.toISOString() : null,
      importe: r.importe ?? '0',
      anulada: r.anulada,
      anuladaAt: r.anuladaAt ? r.anuladaAt.toISOString() : null,
      tipoRecibo: r.tipoRecibo,
      socioNombre: [r.socioNombre, r.socioApellido].filter(Boolean).join(' ') || '—',
      socioRazonSocial: identidad.razon,
      numeroSocio: r.numeroSocio,
      entreEmisor,
      formas,
    };
  });

  const cobrosPayway = cobrosLista.map((c) => ({
    id: c.id,
    socioId: c.socioId,
    socioNombre: [c.socioNombre, c.socioApellido].filter(Boolean).join(' ') || '—',
    monto: c.monto,
    estado: c.estado,
    errorMensaje: c.errorMensaje,
    movimientosIds: c.movimientosIds,
    createdAt: c.createdAt.toISOString(),
  }));

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
      <CobranzasTabsClient cobranzas={cobranzas} cobrosPayway={cobrosPayway} />
    </div>
  );
}
