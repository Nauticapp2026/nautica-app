import { redirect } from 'next/navigation';
import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  areas,
  documentos,
  embarcaciones,
  espacios,
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  invitados,
  lados,
  marinas,
  memberships,
  movimientosCuentaCorriente,
  pisos,
  porteria,
  profiles,
  servicios as serviciosTable,
} from '@/lib/db/schema';
import { eq, and, desc, inArray, isNull, asc } from 'drizzle-orm';
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

  const [
    embarcacionesList,
    movimientosList,
    serviciosList,
    invitadosList,
    documentosList,
    salidasList,
    espacioActualRow,
    espaciosDisponibles,
  ] = await Promise.all([
    db
      .select({
        id: embarcaciones.id,
        nombre: embarcaciones.nombre,
        matricula: embarcaciones.matricula,
        modelo: embarcaciones.modelo,
        seguro: embarcaciones.seguro,
        esloraM: embarcaciones.esloraM,
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
      .where(
        and(
          eq(invitados.socioId, id),
          eq(invitados.guarderiaId, gId),
          eq(invitados.estado, 'activo'),
        ),
      )
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

    db
      .select({
        id: porteria.id,
        desde: porteria.desde,
        hasta: porteria.hasta,
        arribadaEn: porteria.arribadaEn,
        estado: porteria.estado,
        motivo: porteria.motivo,
        embarcacionNombre: embarcaciones.nombre,
        embarcacionMatricula: embarcaciones.matricula,
        createdAt: porteria.createdAt,
      })
      .from(porteria)
      .leftJoin(embarcaciones, eq(embarcaciones.id, porteria.embarcacionId))
      .where(
        and(eq(porteria.socioId, id), eq(porteria.guarderiaId, gId), eq(porteria.tipo, 'salida')),
      )
      .orderBy(desc(porteria.createdAt)),

    // Espacio actualmente asignado al socio (si tiene).
    db
      .select({
        id: espacios.id,
        nomenclatura: espacios.nomenclatura,
        areaNombre: areas.nombre,
        marinaNombre: marinas.nombre,
        ladoNombre: lados.nombre,
        pisoNombre: pisos.nombre,
      })
      .from(espacios)
      .leftJoin(areas, eq(areas.id, espacios.areaId))
      .leftJoin(marinas, eq(marinas.id, espacios.marinaId))
      .leftJoin(lados, eq(lados.id, espacios.ladoId))
      .leftJoin(pisos, eq(pisos.id, espacios.pisoId))
      .where(and(eq(espacios.ocupanteId, id), eq(espacios.guarderiaId, gId)))
      .limit(1),

    // Espacios disponibles para asignar/cambiar. Ya no exigimos tarifa
    // configurada: si el espacio no tiene tarifa, se asigna igual y el
    // movimiento se genera cuando el admin cargue la tarifa después.
    // Para validar tamaño en el cambio de espacio traemos también la
    // eslora del espacio y la unidad de su tarifa (puede ser null si no
    // tiene tarifa todavía).
    db
      .select({
        id: espacios.id,
        nomenclatura: espacios.nomenclatura,
        areaNombre: areas.nombre,
        marinaNombre: marinas.nombre,
        ladoNombre: lados.nombre,
        pisoNombre: pisos.nombre,
        orden: espacios.orden,
        eslora: espacios.eslora,
        unidadMetraje: serviciosTable.unidadMetraje,
      })
      .from(espacios)
      .leftJoin(areas, eq(areas.id, espacios.areaId))
      .leftJoin(marinas, eq(marinas.id, espacios.marinaId))
      .leftJoin(lados, eq(lados.id, espacios.ladoId))
      .leftJoin(pisos, eq(pisos.id, espacios.pisoId))
      .leftJoin(serviciosTable, eq(serviciosTable.id, espacios.servicioId))
      .where(
        and(
          eq(espacios.guarderiaId, gId),
          eq(espacios.estado, 'disponible'),
          isNull(espacios.ocupanteId),
        ),
      )
      .orderBy(asc(areas.nombre), asc(espacios.orden)),
  ]);

  // Para cada movimiento facturado, traer el código de la factura. Lo
  // hacemos en una query separada para no duplicar filas con el JOIN M:N
  // (facturacion_item_movimientos puede tener varios matches por movimiento).
  const movimientoIds = movimientosList.map((m) => m.id);
  const facturasPorMovimiento = new Map<string, string>();
  if (movimientoIds.length > 0) {
    const rows = await db
      .selectDistinct({
        movimientoId: facturacionItemMovimientos.movimientoId,
        codigo: facturacion.codigo,
      })
      .from(facturacionItemMovimientos)
      .innerJoin(
        facturacionItems,
        eq(facturacionItems.id, facturacionItemMovimientos.facturacionItemId),
      )
      .innerJoin(facturacion, eq(facturacion.id, facturacionItems.facturacionId))
      .where(inArray(facturacionItemMovimientos.movimientoId, movimientoIds));
    for (const r of rows) {
      if (r.codigo) facturasPorMovimiento.set(r.movimientoId, r.codigo);
    }
  }

  // Resolver URL de cada documento. Soportamos dos formatos en
  // documento_url (histórico y nuevo):
  //  - URL completa ("https://…/storage/v1/object/…"): se usa tal cual.
  //  - Path relativo del bucket ("{socioId}/{filename}"): se genera signed URL.
  const admin = createAdminClient();
  const documentosConUrl = await Promise.all(
    documentosList.map(async (d) => {
      let signedUrl: string | null = null;
      if (d.documentoUrl) {
        if (/^https?:\/\//i.test(d.documentoUrl)) {
          signedUrl = d.documentoUrl;
        } else {
          const { data } = await admin.storage
            .from('documentos')
            .createSignedUrl(d.documentoUrl, 60 * 60); // 1 hora
          signedUrl = data?.signedUrl ?? null;
        }
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

  function labelEspacio(e: {
    nomenclatura: string | null;
    areaNombre: string | null;
    marinaNombre: string | null;
    ladoNombre: string | null;
    pisoNombre: string | null;
  }): string {
    const partes: string[] = [];
    if (e.areaNombre) partes.push(e.areaNombre);
    if (e.marinaNombre) partes.push(e.marinaNombre);
    if (e.ladoNombre) partes.push(e.ladoNombre);
    if (e.pisoNombre) partes.push(e.pisoNombre);
    if (e.nomenclatura) partes.push(e.nomenclatura);
    return partes.join(' · ') || 'Espacio';
  }

  const espacioActual = espacioActualRow[0]
    ? { id: espacioActualRow[0].id, label: labelEspacio(espacioActualRow[0]) }
    : null;

  // Eslora máxima de las embarcaciones del socio (siempre en metros).
  // Sirve para filtrar espacios destino cuando el socio ya tiene espacio
  // (es una mudanza). El barco tiene que entrar — eslora del espacio
  // tiene que ser ≥ eslora del barco más grande del socio.
  const esloraMaxBarcoM = embarcacionesList.reduce((max, e) => {
    const v = e.esloraM != null ? Number(e.esloraM) : 0;
    return v > max ? v : max;
  }, 0);

  function espacioAceptaBarco(e: {
    eslora: string | null;
    unidadMetraje: 'metros' | 'pies' | null;
  }): boolean {
    if (e.eslora == null) return true; // sin eslora seteada → no se valida
    const esloraNum = Number(e.eslora);
    const esloraM = e.unidadMetraje === 'pies' ? esloraNum * 0.3048 : esloraNum;
    return esloraM + 0.01 >= esloraMaxBarcoM;
  }

  // Solo filtramos por tamaño cuando es un cambio (el socio ya tiene
  // espacio). En la asignación inicial no validamos — el admin elige
  // libremente.
  const esCambio = espacioActual != null;
  const espaciosFiltrados =
    esCambio && esloraMaxBarcoM > 0
      ? espaciosDisponibles.filter(espacioAceptaBarco)
      : espaciosDisponibles;

  const espaciosDisponiblesView = espaciosFiltrados.map((e) => ({
    id: e.id,
    label: labelEspacio(e),
  }));

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
      espacioActual={espacioActual}
      espaciosDisponibles={espaciosDisponiblesView}
      movimientos={movimientosList.map((m) => ({
        ...m,
        fecha: m.fecha?.toISOString() ?? null,
        facturaCodigo: facturasPorMovimiento.get(m.id) ?? null,
      }))}
      servicios={serviciosList}
      invitados={invitadosList.map((i) => ({
        ...i,
        validoHasta: i.validoHasta?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
      }))}
      documentos={documentosConUrl}
      salidas={salidasList.map((s) => ({
        id: s.id,
        desde: s.desde?.toISOString() ?? null,
        hasta: s.hasta?.toISOString() ?? null,
        arribadaEn: s.arribadaEn?.toISOString() ?? null,
        estado: s.estado ?? null,
        motivo: s.motivo ?? null,
        embarcacion: s.embarcacionMatricula
          ? `${s.embarcacionNombre ?? ''} (${s.embarcacionMatricula})`.trim()
          : (s.embarcacionNombre ?? null),
        createdAt: s.createdAt.toISOString(),
      }))}
    />
  );
}
