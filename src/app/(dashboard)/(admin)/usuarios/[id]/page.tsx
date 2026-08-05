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
  guarderias,
  invitados,
  lados,
  marinas,
  memberships,
  movimientosCuentaCorriente,
  paywayTokens,
  pisos,
  porteria,
  porteriaInvitados,
  profiles,
  servicios as serviciosTable,
  socioServicios,
} from '@/lib/db/schema';
import { eq, and, desc, gte, inArray, isNull, asc, lte } from 'drizzle-orm';
import { createAdminClient } from '@/lib/supabase/admin';
import { addDiasYmd, argYmd } from '@/lib/dates';
import { calcularCoberturaTargeted } from '@/lib/cobranza-cobertura';
import { SocioDetail } from './socio-detail';

export default async function SocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;
  const todayStr = new Date().toISOString().slice(0, 10);

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
      ciudad: profiles.ciudad,
      provincia: profiles.provincia,
      codigoPostal: profiles.codigoPostal,
      contactoEmergencia: profiles.contactoEmergencia,
      razonSocial: profiles.razonSocial,
      cuit: profiles.cuit,
      direccionFiscal: profiles.direccionFiscal,
      condicionIva: profiles.condicionIva,
      condicionIvaPersonal: profiles.condicionIvaPersonal,
      condicionIibb: profiles.condicionIibb,
      emailFacturacion: profiles.emailFacturacion,
      estadoSocio: profiles.estadoSocio,
      deuda: profiles.deuda,
      memberSince: memberships.createdAt,
      membershipStatus: memberships.status,
      numeroSocio: memberships.numeroSocio,
      facturaFiscal: memberships.facturaFiscal,
      comprobanteInterno: memberships.comprobanteInterno,
      cobroAutomaticoPayway: memberships.cobroAutomaticoPayway,
      cobroAutomaticoBaja: memberships.cobroAutomaticoBaja,
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
    navegantesList,
    invitadosSocioList,
    documentosList,
    salidasList,
    espaciosSocioRows,
    espaciosDisponibles,
    guarderiaRow,
    paywayTokenRow,
    serviciosContratadosList,
  ] = await Promise.all([
    db
      .select({
        id: embarcaciones.id,
        nombre: embarcaciones.nombre,
        matricula: embarcaciones.matricula,
        astillero: embarcaciones.astillero,
        modelo: embarcaciones.modelo,
        seguro: embarcaciones.seguro,
        esloraM: embarcaciones.esloraM,
        esPrincipal: embarcaciones.esPrincipal,
        espacioId: embarcaciones.espacioId,
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
        servicioTipo: serviciosTable.tipo,
        servicioTipoCobro: serviciosTable.tipoCobro,
        servicioAlicuotaIva: serviciosTable.alicuotaIva,
        plazoPagoDias: serviciosTable.plazoPagoDias,
        comprobanteInterno: movimientosCuentaCorriente.comprobanteInterno,
        // Nº de operación del Servicio Contratado que originó el cargo
        // (movimientos.socio_servicio_id, modelo "los cargos nacen al
        // emitir"). Null en pagos, notas y cargos pre-refactor.
        numeroOperacion: socioServicios.numeroOperacion,
      })
      .from(movimientosCuentaCorriente)
      .leftJoin(serviciosTable, eq(serviciosTable.id, movimientosCuentaCorriente.servicioId))
      .leftJoin(socioServicios, eq(socioServicios.id, movimientosCuentaCorriente.socioServicioId))
      .where(eq(movimientosCuentaCorriente.socioId, id))
      // Desempate por created_at: si varios movimientos comparten la misma fecha
      // (típico al cargar varios el mismo día), sin este segundo criterio el orden
      // sería arbitrario y "saltaría" en cada alta. Además fija el orden del FIFO de
      // "Pagado por cobertura" (el creado primero = el más viejo).
      .orderBy(desc(movimientosCuentaCorriente.fecha), desc(movimientosCuentaCorriente.createdAt)),

    db
      .select({
        id: serviciosTable.id,
        nombre: serviciosTable.nombre,
        tipo: serviciosTable.tipo,
        tipoCobro: serviciosTable.tipoCobro,
        tarifaVariable: serviciosTable.tarifaVariable,
        precio: serviciosTable.precio,
        alicuotaIva: serviciosTable.alicuotaIva,
      })
      .from(serviciosTable)
      .where(
        and(
          eq(serviciosTable.guarderiaId, gId),
          eq(serviciosTable.estado, 'activo'),
          lte(serviciosTable.vigenciaDesde, todayStr),
          gte(serviciosTable.vigenciaHasta, todayStr),
        ),
      ),

    db
      .select({
        id: porteriaInvitados.id,
        nombre: invitados.nombre,
        apellido: invitados.apellido,
        estado: porteria.estado,
        desde: porteria.desde,
        hasta: porteria.hasta,
        arribadaEn: porteria.arribadaEn,
        createdAt: porteria.createdAt,
        esNavegante: porteriaInvitados.esNavegante,
      })
      .from(porteriaInvitados)
      .innerJoin(porteria, eq(porteria.id, porteriaInvitados.porteriaId))
      .innerJoin(invitados, eq(invitados.id, porteriaInvitados.invitadoId))
      .where(
        and(
          eq(porteria.socioId, id),
          eq(porteria.guarderiaId, gId),
          eq(porteria.tipo, 'acceso_externo'),
        ),
      )
      .orderBy(desc(porteria.createdAt)),

    db
      .select({
        id: invitados.id,
        nombre: invitados.nombre,
        apellido: invitados.apellido,
        email: invitados.email,
        telefono: invitados.telefono,
        dni: invitados.dni,
        motivo: invitados.motivo,
        tipo: invitados.tipo,
        estado: invitados.estado,
        validoHasta: invitados.validoHasta,
        createdAt: invitados.createdAt,
      })
      .from(invitados)
      // Excluir los que son acceso externo (tienen porteria_invitados): esos van
      // a la solapa "Accesos Externos". Misma regla que el desplegable de la
      // lista de socios.
      .leftJoin(porteriaInvitados, eq(porteriaInvitados.invitadoId, invitados.id))
      .where(
        and(
          eq(invitados.socioId, id),
          eq(invitados.guarderiaId, gId),
          eq(invitados.estado, 'activo'),
          isNull(porteriaInvitados.id),
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

    // Espacios de los que el socio es ocupante (uno por embarcación).
    // Incluye el servicio/tarifa del espacio para mostrar en "Servicios Contratados".
    db
      .select({
        id: espacios.id,
        nomenclatura: espacios.nomenclatura,
        areaNombre: areas.nombre,
        marinaNombre: marinas.nombre,
        ladoNombre: lados.nombre,
        pisoNombre: pisos.nombre,
        servicioNombre: serviciosTable.nombre,
        servicioPrecio: serviciosTable.precio,
      })
      .from(espacios)
      .leftJoin(areas, eq(areas.id, espacios.areaId))
      .leftJoin(marinas, eq(marinas.id, espacios.marinaId))
      .leftJoin(lados, eq(lados.id, espacios.ladoId))
      .leftJoin(pisos, eq(pisos.id, espacios.pisoId))
      .leftJoin(serviciosTable, eq(serviciosTable.id, espacios.servicioId))
      .where(and(eq(espacios.ocupanteId, id), eq(espacios.guarderiaId, gId))),

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
        precio: serviciosTable.precio,
        alicuotaIva: serviciosTable.alicuotaIva,
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

    db
      .select({
        paywayPublicKey: guarderias.paywayPublicKey,
        mediosCobroInternos: guarderias.mediosCobroInternos,
      })
      .from(guarderias)
      .where(eq(guarderias.id, gId))
      .limit(1),

    db
      .select({
        lastFour: paywayTokens.lastFour,
        paymentMethodId: paywayTokens.paymentMethodId,
        activo: paywayTokens.activo,
      })
      .from(paywayTokens)
      .where(and(eq(paywayTokens.socioId, id), eq(paywayTokens.guarderiaId, gId)))
      .limit(1),

    // Servicios Contratados: un registro por contrato (socio + servicio),
    // no por cobro. El más reciente primero.
    db
      .select({
        id: socioServicios.id,
        servicioId: socioServicios.servicioId,
        servicioNombre: serviciosTable.nombre,
        servicioTipo: serviciosTable.tipo,
        servicioTipoCobro: serviciosTable.tipoCobro,
        servicioPrecio: serviciosTable.precio,
        servicioAlicuotaIva: serviciosTable.alicuotaIva,
        servicioPoliticaBajaAnticipada: serviciosTable.politicaBajaAnticipada,
        espacioId: socioServicios.espacioId,
        numeroOperacion: socioServicios.numeroOperacion,
        fechaAsignacion: socioServicios.fechaAsignacion,
        fechaInicio: socioServicios.fechaInicio,
        fechaBaja: socioServicios.fechaBaja,
        concepto: socioServicios.concepto,
        comprobanteInterno: socioServicios.comprobanteInterno,
        debitoAutomatico: socioServicios.debitoAutomatico,
        cantidadDias: socioServicios.cantidadDias,
      })
      .from(socioServicios)
      .innerJoin(serviciosTable, eq(serviciosTable.id, socioServicios.servicioId))
      .where(and(eq(socioServicios.socioId, id), eq(socioServicios.guarderiaId, gId)))
      .orderBy(desc(socioServicios.fechaAsignacion)),
  ]);

  // Contratos que ya tienen al menos un cargo emitido (modelo "los cargos
  // nacen al emitir": el movimiento lleva socio_servicio_id). Permite
  // distinguir en la UI "Concluido" (Variable ya facturada, se cerró sola)
  // de "Dado de baja" (baja manual del admin).
  const contratoIdsSC = serviciosContratadosList.map((s) => s.id);
  const contratosConCargo = new Set<string>();
  if (contratoIdsSC.length > 0) {
    const conCargo = await db
      .select({ socioServicioId: movimientosCuentaCorriente.socioServicioId })
      .from(movimientosCuentaCorriente)
      .where(inArray(movimientosCuentaCorriente.socioServicioId, contratoIdsSC));
    for (const r of conCargo) {
      if (r.socioServicioId) contratosConCargo.add(r.socioServicioId);
    }
  }

  // Para cada movimiento facturado, traer el código de la factura. Lo
  // hacemos en una query separada para no duplicar filas con el JOIN M:N
  // (facturacion_item_movimientos puede tener varios matches por movimiento).
  const movimientoIds = movimientosList.map((m) => m.id);
  const facturasPorMovimiento = new Map<
    string,
    {
      facturacionId: string;
      codigo: string | null;
      archivo: string | null;
      tipo: string | null;
      tipoRecibo: 'fiscal' | 'interno' | null;
      descripcion: string | null;
      emision: Date | null;
      vencimiento: Date | null;
    }
  >();
  if (movimientoIds.length > 0) {
    const rows = await db
      .selectDistinct({
        movimientoId: facturacionItemMovimientos.movimientoId,
        facturacionId: facturacion.id,
        codigo: facturacion.codigo,
        archivo: facturacion.archivo,
        tipoFactura: facturacion.tipoFactura,
        tipoRecibo: facturacion.tipoRecibo,
        descripcion: facturacion.descripcion,
        emision: facturacion.emision,
        vencimiento: facturacion.vencimiento,
      })
      .from(facturacionItemMovimientos)
      .innerJoin(
        facturacionItems,
        eq(facturacionItems.id, facturacionItemMovimientos.facturacionItemId),
      )
      .innerJoin(facturacion, eq(facturacion.id, facturacionItems.facturacionId))
      .where(inArray(facturacionItemMovimientos.movimientoId, movimientoIds));
    for (const r of rows) {
      facturasPorMovimiento.set(r.movimientoId, {
        facturacionId: r.facturacionId,
        codigo: r.codigo,
        // Comprobantes internos (CM-/CL-) no tienen PDF externo: se ven/imprimen
        // en su página dedicada, igual que los recibos con vínculo directo.
        archivo:
          r.archivo ?? (r.tipoFactura === 'recibo' ? `/ventas/recibo/${r.facturacionId}` : null),
        tipo: r.tipoFactura,
        tipoRecibo: r.tipoRecibo,
        descripcion: r.descripcion,
        emision: r.emision,
        vencimiento: r.vencimiento,
      });
    }

    // Comprobantes internos (y cualquier facturación con vínculo directo
    // movimiento↔comprobante): se guardan con facturacion.movimientoId, no por
    // la tabla M:N de arriba. Los traemos aparte para mostrar su N° y tipo en la
    // cuenta corriente. No pisan un vínculo M:N ya resuelto.
    const directas = await db
      .select({
        id: facturacion.id,
        movimientoId: facturacion.movimientoId,
        codigo: facturacion.codigo,
        archivo: facturacion.archivo,
        tipoFactura: facturacion.tipoFactura,
        tipoRecibo: facturacion.tipoRecibo,
        descripcion: facturacion.descripcion,
        emision: facturacion.emision,
        vencimiento: facturacion.vencimiento,
      })
      .from(facturacion)
      .where(inArray(facturacion.movimientoId, movimientoIds));
    for (const r of directas) {
      if (!r.movimientoId || facturasPorMovimiento.has(r.movimientoId)) continue;
      facturasPorMovimiento.set(r.movimientoId, {
        facturacionId: r.id,
        codigo: r.codigo,
        // Sin PDF: el recibo interno se ve/imprime en su página dedicada.
        archivo: r.archivo ?? `/ventas/recibo/${r.id}`,
        tipo: r.tipoFactura,
        tipoRecibo: r.tipoRecibo,
        descripcion: r.descripcion,
        emision: r.emision,
        vencimiento: r.vencimiento,
      });
    }
  }

  // Una fila de cuenta corriente por comprobante: la emisión (manual, en lote,
  // interna o del cron) crea UN movimiento por cargo/Servicio Contratado, todos
  // vinculados a la misma factura. Para el socio eso es una sola venta, así que
  // acá se consolidan en una fila (importes sumados, concepto de la factura).
  // Los movimientos sin comprobante quedan uno por fila, como siempre. El orden
  // desc se preserva: el grupo ocupa la posición de su miembro más nuevo (en la
  // práctica los miembros son contiguos: nacen en la misma transacción).
  type MovimientoRow = (typeof movimientosList)[number];
  const filasCuentaCorriente: { base: MovimientoRow; miembros: MovimientoRow[] }[] = [];
  const grupoPorFactura = new Map<string, { base: MovimientoRow; miembros: MovimientoRow[] }>();
  for (const m of movimientosList) {
    const facId = facturasPorMovimiento.get(m.id)?.facturacionId;
    if (!facId) {
      filasCuentaCorriente.push({ base: m, miembros: [m] });
      continue;
    }
    const grupo = grupoPorFactura.get(facId);
    if (grupo) {
      grupo.miembros.push(m);
    } else {
      const nuevo = { base: m, miembros: [m] };
      grupoPorFactura.set(facId, nuevo);
      filasCuentaCorriente.push(nuevo);
    }
  }

  // Resolver URL de cada documento. Soportamos dos formatos en
  // documento_url:
  //  - Path relativo del bucket ("{socioId}/{filename}"): genera signed URL.
  //  - URL pública de Supabase Storage (subidos desde mobile antes del fix):
  //    extrae el path y genera signed URL igual.
  //  - URL externa genuina (no Supabase): se usa tal cual.
  const admin = createAdminClient();

  // Resolver el path de cada documento (o marcarlo como URL externa que se usa
  // tal cual). Después firmamos TODOS los paths del bucket en una sola request
  // con createSignedUrls(), en vez de una llamada de red por documento.
  const resueltos = documentosList.map((d) => {
    if (!d.documentoUrl) return { d, kind: 'none' as const };
    let path = d.documentoUrl;
    const supabaseMatch = path.match(/\/object\/(?:public|sign)\/documentos\/(.+?)(?:\?|$)/);
    if (supabaseMatch) path = decodeURIComponent(supabaseMatch[1]);
    if (/^https?:\/\//i.test(path)) return { d, kind: 'url' as const, url: path };
    return { d, kind: 'path' as const, path };
  });

  const pathsAFirmar: string[] = [];
  for (const r of resueltos) {
    if (r.kind === 'path') pathsAFirmar.push(r.path);
  }

  const firmadas = new Map<string, string>();
  if (pathsAFirmar.length > 0) {
    const { data } = await admin.storage.from('documentos').createSignedUrls(pathsAFirmar, 60 * 60); // 1 hora
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) firmadas.set(item.path, item.signedUrl);
    }
  }

  const documentosConUrl = resueltos.map((r) => {
    let signedUrl: string | null = null;
    if (r.kind === 'url') signedUrl = r.url;
    else if (r.kind === 'path') signedUrl = firmadas.get(r.path) ?? null;
    return {
      id: r.d.id,
      nombre: r.d.nombre,
      tipo: r.d.tipo ?? null,
      createdAt: r.d.createdAt.toISOString(),
      signedUrl,
    };
  });

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

  // Mapa espacioId → label para enriquecer las embarcaciones.
  const espacioLabelMap = new Map<string, string>();
  for (const e of espaciosSocioRows) {
    espacioLabelMap.set(e.id, labelEspacio(e));
  }

  // El filtro por eslora se hace por barco en EspacioEmbarcacionRow.
  // Acá pasamos todos los espacios disponibles con sus datos de eslora y precio.
  const espaciosDisponiblesView = espaciosDisponibles.map((e) => ({
    id: e.id,
    label: labelEspacio(e),
    eslora: e.eslora ?? null,
    unidadMetraje: e.unidadMetraje ?? null,
    precio: e.precio ?? null,
    alicuotaIva: e.alicuotaIva ?? null,
  }));

  // Cobertura targeted del socio: a qué cargo puntual aplica cada Nota de
  // Crédito y cada pago (parcial o total) de Cobranzas — el display de Cuenta
  // Corriente la necesita para mostrar "Anulado (NC)" / "Parcial" en el cargo
  // correcto en vez de repartir una bolsa común de crédito genérico (ver
  // src/lib/cobranza-cobertura.ts).
  const { montoNcPorMovimiento, montoReciboPorMovimiento, movimientosDeNc, haberComprometido } =
    await calcularCoberturaTargeted(id);

  return (
    <SocioDetail
      paywayPublicKey={guarderiaRow[0]?.paywayPublicKey ?? null}
      internosHabilitados={(guarderiaRow[0]?.mediosCobroInternos ?? []).length > 0}
      debitoInternoHabilitado={(guarderiaRow[0]?.mediosCobroInternos ?? []).includes(
        'debito_automatico',
      )}
      paywayToken={
        paywayTokenRow[0]
          ? {
              lastFour: paywayTokenRow[0].lastFour,
              paymentMethodId: paywayTokenRow[0].paymentMethodId,
              activo: paywayTokenRow[0].activo,
            }
          : null
      }
      socio={{
        ...socio,
        memberSince: socio.memberSince.toISOString(),
        tipoDocumento: socio.tipoDocumento ?? null,
        condicionIva: socio.condicionIva ?? null,
        condicionIvaPersonal: socio.condicionIvaPersonal ?? null,
        estadoSocio: socio.estadoSocio ?? null,
        facturaFiscal: socio.facturaFiscal ?? false,
        comprobanteInterno: socio.comprobanteInterno ?? false,
        cobroAutomaticoPayway: socio.cobroAutomaticoPayway ?? false,
        cobroAutomaticoBaja: socio.cobroAutomaticoBaja ?? null,
      }}
      embarcaciones={embarcacionesList.map((e) => ({
        ...e,
        esloraM: e.esloraM ?? null,
        esPrincipal: e.esPrincipal ?? false,
        espacioId: e.espacioId ?? null,
        espacioLabel: e.espacioId ? (espacioLabelMap.get(e.espacioId) ?? null) : null,
      }))}
      espaciosDisponibles={espaciosDisponiblesView}
      movimientos={filasCuentaCorriente.map(({ base, miembros }) => {
        const fac = facturasPorMovimiento.get(base.id);
        const consolidado = miembros.length > 1;
        const debe = miembros.reduce((t, x) => t + parseFloat(x.debe ?? '0'), 0);
        const haber = miembros.reduce((t, x) => t + parseFloat(x.haber ?? '0'), 0);
        const montoNc = miembros.reduce((t, x) => t + (montoNcPorMovimiento.get(x.id) ?? 0), 0);
        const montoRecibo = miembros.reduce(
          (t, x) => t + (montoReciboPorMovimiento.get(x.id) ?? 0),
          0,
        );
        const comprometido = miembros.reduce((t, x) => t + (haberComprometido.get(x.id) ?? 0), 0);
        // Estado consolidado: 'pagado' solo si TODOS los cargos del
        // comprobante lo están; si no, manda el primero impago.
        const estado = miembros.find((x) => x.estado !== 'pagado')?.estado ?? base.estado;
        // Fecha de vencimiento: si el comprobante guardó un vencimiento REAL
        // (fiscal, se elige al emitir), usamos ese. Los comprobantes internos
        // no lo guardan: se estima como emisión + plazo de pago de la tarifa
        // de cada servicio (si difieren entre los cargos consolidados, rige
        // el que vence primero). Sin comprobante ni plazo queda vacía.
        const emisionYmd = argYmd(fac?.emision);
        const vencimientoFactura = argYmd(fac?.vencimiento);
        let fechaVencimiento = vencimientoFactura;
        if (fechaVencimiento == null && emisionYmd != null) {
          const estimados = miembros
            .filter((x) => x.plazoPagoDias != null)
            .map((x) => addDiasYmd(emisionYmd, x.plazoPagoDias!));
          fechaVencimiento = estimados.length > 0 ? estimados.sort()[0] : null;
        }
        return {
          ...base,
          debe: debe.toFixed(2),
          haber: haber.toFixed(2),
          estado,
          // En filas consolidadas el detalle es el de la factura ("X (+2)"):
          // listar un solo servicio del grupo sería engañoso.
          concepto: consolidado
            ? (fac?.descripcion ??
              `${base.concepto ?? 'Varios servicios'} (+${miembros.length - 1})`)
            : base.concepto,
          servicioNombre: consolidado ? null : base.servicioNombre,
          // Consolidado: listar los Nº de operación de TODOS los Servicios
          // Contratados agrupados en el comprobante (trazabilidad 1 a 1),
          // no perderlos como antes al mostrar la fila fusionada.
          numeroOperacion: consolidado
            ? [...new Set(miembros.map((x) => x.numeroOperacion).filter((n) => n != null))]
            : base.numeroOperacion != null
              ? [base.numeroOperacion]
              : null,
          fecha: base.fecha?.toISOString() ?? null,
          facturaCodigo: fac?.codigo ?? null,
          facturaArchivo: fac?.archivo ?? null,
          facturaTipo: fac?.tipo ?? null,
          facturaTipoRecibo: fac?.tipoRecibo ?? null,
          fechaVencimiento,
          montoCubiertoNc: montoNc > 0 ? montoNc.toFixed(2) : null,
          montoCubiertoRecibo: montoRecibo > 0 ? montoRecibo.toFixed(2) : null,
          haberComprometido: comprometido > 0 ? comprometido.toFixed(2) : null,
          esMovimientoNc: miembros.some((x) => movimientosDeNc.has(x.id)),
        };
      })}
      servicios={serviciosList}
      serviciosContratados={serviciosContratadosList.map((s) => ({
        id: s.id,
        servicioId: s.servicioId,
        servicioNombre: s.servicioNombre,
        servicioTipo: s.servicioTipo,
        servicioTipoCobro: s.servicioTipoCobro,
        servicioPrecio: s.servicioPrecio,
        servicioAlicuotaIva: s.servicioAlicuotaIva,
        servicioPoliticaBajaAnticipada: s.servicioPoliticaBajaAnticipada,
        espacioId: s.espacioId,
        numeroOperacion: s.numeroOperacion,
        fechaAsignacion: s.fechaAsignacion.toISOString(),
        fechaInicio: s.fechaInicio,
        fechaBaja: s.fechaBaja,
        concepto: s.concepto,
        comprobanteInterno: s.comprobanteInterno,
        debitoAutomatico: s.debitoAutomatico,
        cantidadDias: s.cantidadDias,
        tieneCargo: contratosConCargo.has(s.id),
      }))}
      navegantes={navegantesList.map((n) => ({
        ...n,
        desde: n.desde?.toISOString() ?? null,
        hasta: n.hasta?.toISOString() ?? null,
        arribadaEn: n.arribadaEn?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
        esNavegante: n.esNavegante ?? false,
      }))}
      invitados={invitadosSocioList.map((iv) => ({
        ...iv,
        validoHasta: iv.validoHasta?.toISOString() ?? null,
        createdAt: iv.createdAt.toISOString(),
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
