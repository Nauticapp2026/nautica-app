import { redirect } from 'next/navigation';
import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  documentos,
  embarcaciones,
  invitados,
  memberships,
  movimientosCuentaCorriente,
  profiles,
  servicios as serviciosTable,
} from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createAdminClient } from '@/lib/supabase/admin';
import { SocioDetail } from './socio-detail';

export default async function SocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;

  const rows = await db
    .select({
      id: profiles.id,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      email: profiles.email,
      telefono: profiles.telefono,
      tipoDocumento: profiles.tipoDocumento,
      numeroDocumento: profiles.numeroDocumento,
      direccion: profiles.direccion,
      razonSocial: profiles.razonSocial,
      condicionIva: profiles.condicionIva,
      estadoSocio: profiles.estadoSocio,
      deuda: profiles.deuda,
      memberSince: memberships.createdAt,
    })
    .from(profiles)
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, profiles.id),
        eq(memberships.guarderiaId, gId),
        eq(memberships.rol, 'socio'),
      ),
    )
    .where(eq(profiles.id, id))
    .limit(1);

  if (!rows.length) redirect('/usuarios');

  const socio = rows[0];

  const [embarcacionesList, movimientosList, serviciosList, invitadosList, documentosList] =
    await Promise.all([
      db
        .select({
          id: embarcaciones.id,
          nombre: embarcaciones.nombre,
          matricula: embarcaciones.matricula,
          modelo: embarcaciones.modelo,
          seguro: embarcaciones.seguro,
        })
        .from(embarcaciones)
        .where(and(eq(embarcaciones.profileId, id), eq(embarcaciones.guarderiaId, gId))),

      db
        .select({
          id: movimientosCuentaCorriente.id,
          fecha: movimientosCuentaCorriente.fecha,
          concepto: movimientosCuentaCorriente.concepto,
          tipo: movimientosCuentaCorriente.tipo,
          estado: movimientosCuentaCorriente.estado,
          debe: movimientosCuentaCorriente.debe,
          haber: movimientosCuentaCorriente.haber,
          servicioNombre: serviciosTable.nombre,
          servicioId: movimientosCuentaCorriente.servicioId,
        })
        .from(movimientosCuentaCorriente)
        .leftJoin(serviciosTable, eq(serviciosTable.id, movimientosCuentaCorriente.servicioId))
        .where(eq(movimientosCuentaCorriente.socioId, id))
        .orderBy(desc(movimientosCuentaCorriente.fecha)),

      db
        .select({
          id: serviciosTable.id,
          nombre: serviciosTable.nombre,
          precio: serviciosTable.precio,
        })
        .from(serviciosTable)
        .where(and(eq(serviciosTable.guarderiaId, gId), eq(serviciosTable.estado, 'activo'))),

      db
        .select({
          id: invitados.id,
          nombre: invitados.nombre,
          apellido: invitados.apellido,
          email: invitados.email,
          telefono: invitados.telefono,
          motivo: invitados.motivo,
          estado: invitados.estado,
          validoHasta: invitados.validoHasta,
          createdAt: invitados.createdAt,
        })
        .from(invitados)
        .where(and(eq(invitados.socioId, id), eq(invitados.guarderiaId, gId)))
        .orderBy(desc(invitados.createdAt)),

      db
        .select({
          id: documentos.id,
          nombre: documentos.nombre,
          tipo: documentos.tipo,
          documentoUrl: documentos.documentoUrl,
          vencimiento: documentos.vencimiento,
          createdAt: documentos.createdAt,
        })
        .from(documentos)
        .where(eq(documentos.profileId, id))
        .orderBy(desc(documentos.createdAt)),
    ]);

  // Generar signed URLs (el bucket es privado por RLS).
  const admin = createAdminClient();
  const documentosConUrl = await Promise.all(
    documentosList.map(async (d) => {
      let signedUrl: string | null = null;
      if (d.documentoUrl) {
        const { data } = await admin.storage
          .from('documentos')
          .createSignedUrl(d.documentoUrl, 60 * 60); // 1 hora
        signedUrl = data?.signedUrl ?? null;
      }
      return {
        id: d.id,
        nombre: d.nombre,
        tipo: d.tipo ?? null,
        createdAt: d.createdAt.toISOString(),
        signedUrl,
      };
    }),
  );

  return (
    <SocioDetail
      socio={{
        ...socio,
        memberSince: socio.memberSince.toISOString(),
        tipoDocumento: socio.tipoDocumento ?? null,
        condicionIva: socio.condicionIva ?? null,
        estadoSocio: socio.estadoSocio ?? null,
      }}
      embarcaciones={embarcacionesList}
      movimientos={movimientosList.map((m) => ({
        ...m,
        fecha: m.fecha?.toISOString() ?? null,
      }))}
      servicios={serviciosList}
      invitados={invitadosList.map((i) => ({
        ...i,
        validoHasta: i.validoHasta?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
      }))}
      documentos={documentosConUrl}
    />
  );
}
