import { and, count, desc, eq, gte, inArray, lte, sum } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  embarcaciones,
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  guarderiaCentrosEmisores,
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  profiles,
  servicios,
  socioServicios,
} from '@/lib/db/schema';
import { identidadFacturacion } from '@/lib/facturacion/identidad';
import { claveItem, listarPendientesFacturar } from '@/lib/pendientes-facturar';
import { getCargosSaldadosFifo } from '@/lib/reconciliar-cuenta';

import { VentasClient } from './ventas-client';

// "factura_a" → "A", "nota_credito_b" → "B", "recibo" → "—".
function letraDeComprobante(tipoFactura: string | null): string {
  if (!tipoFactura) return '—';
  const letra = tipoFactura.split('_').pop();
  return letra && letra.length === 1 ? letra.toUpperCase() : '—';
}

/**
 * Nº de operación del Servicio Contratado asociado a cada factura, resuelto
 * por mejor esfuerzo (no hay FK directa entre movimientos y socio_servicios):
 * para cada movimiento linkeado, busca el Servicio Contratado vigente a la
 * fecha del movimiento para ese (socio, servicio). Si una factura junta
 * movimientos de más de un Servicio Contratado, devuelve "Varios".
 */
async function resolverNumeroOperacionPorFactura(
  facturaIds: string[],
): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  if (facturaIds.length === 0) return resultado;

  const items = await db
    .select({ id: facturacionItems.id, facturacionId: facturacionItems.facturacionId })
    .from(facturacionItems)
    .where(inArray(facturacionItems.facturacionId, facturaIds));
  if (items.length === 0) return resultado;

  const itemToFactura = new Map(items.map((i) => [i.id, i.facturacionId]));
  const links = await db
    .select({
      facturacionItemId: facturacionItemMovimientos.facturacionItemId,
      movimientoId: facturacionItemMovimientos.movimientoId,
    })
    .from(facturacionItemMovimientos)
    .where(
      inArray(
        facturacionItemMovimientos.facturacionItemId,
        items.map((i) => i.id),
      ),
    );
  if (links.length === 0) return resultado;

  const movimientoIds = links.map((l) => l.movimientoId);
  const movs = await db
    .select({
      id: movimientosCuentaCorriente.id,
      socioId: movimientosCuentaCorriente.socioId,
      servicioId: movimientosCuentaCorriente.servicioId,
      socioServicioId: movimientosCuentaCorriente.socioServicioId,
      fecha: movimientosCuentaCorriente.fecha,
    })
    .from(movimientosCuentaCorriente)
    .where(inArray(movimientosCuentaCorriente.id, movimientoIds));
  const movById = new Map(movs.map((m) => [m.id, m]));

  // Camino exacto (modelo "los cargos nacen al emitir"): el movimiento lleva
  // el id del contrato que lo originó.
  const contratoIds = [
    ...new Set(movs.map((m) => m.socioServicioId).filter((x): x is string => !!x)),
  ];
  const numeroPorContrato = new Map<string, number>();
  if (contratoIds.length > 0) {
    const rows = await db
      .select({ id: socioServicios.id, numeroOperacion: socioServicios.numeroOperacion })
      .from(socioServicios)
      .where(inArray(socioServicios.id, contratoIds));
    for (const r of rows) numeroPorContrato.set(r.id, r.numeroOperacion);
  }

  const socioIds = [...new Set(movs.map((m) => m.socioId))];
  const servicioIds = [...new Set(movs.map((m) => m.servicioId).filter((x): x is string => !!x))];

  const scRows =
    socioIds.length > 0 && servicioIds.length > 0
      ? await db
          .select({
            socioId: socioServicios.socioId,
            servicioId: socioServicios.servicioId,
            fechaInicio: socioServicios.fechaInicio,
            fechaBaja: socioServicios.fechaBaja,
            numeroOperacion: socioServicios.numeroOperacion,
          })
          .from(socioServicios)
          .where(
            and(
              inArray(socioServicios.socioId, socioIds),
              inArray(socioServicios.servicioId, servicioIds),
            ),
          )
      : [];

  // Por (facturacionId) → set de números de operación encontrados.
  const porFactura = new Map<string, Set<number>>();
  for (const l of links) {
    const facturaId = itemToFactura.get(l.facturacionItemId);
    const mov = movById.get(l.movimientoId);
    if (!facturaId || !mov) continue;

    // Exacto si el movimiento trae su contrato; best-effort por vigencia para
    // los movimientos pre-refactor.
    let numeroOperacion: number | undefined;
    if (mov.socioServicioId) {
      numeroOperacion = numeroPorContrato.get(mov.socioServicioId);
    } else if (mov.servicioId && mov.fecha) {
      const fechaYmd = mov.fecha.toISOString().slice(0, 10);
      numeroOperacion = scRows.find(
        (r) =>
          r.socioId === mov.socioId &&
          r.servicioId === mov.servicioId &&
          r.fechaInicio <= fechaYmd &&
          (!r.fechaBaja || r.fechaBaja >= fechaYmd),
      )?.numeroOperacion;
    }
    if (numeroOperacion == null) continue;
    if (!porFactura.has(facturaId)) porFactura.set(facturaId, new Set());
    porFactura.get(facturaId)!.add(numeroOperacion);
  }

  for (const [facturaId, nums] of porFactura) {
    if (nums.size === 1) {
      resultado.set(facturaId, String([...nums][0]).padStart(6, '0'));
    } else if (nums.size > 1) {
      resultado.set(facturaId, 'Varios');
    }
  }
  return resultado;
}

export default async function VentasPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [
    [{ pendientesCount }],
    [{ pagadasMes }],
    [{ vencidas }],
    [{ totalFacturado }],
    lista,
    sociosList,
    [guarderiaInfo],
    movsPendientesList,
    movsPendientesInternoList,
    embarcacionesList,
    centrosEmisoresList,
  ] = await Promise.all([
    db
      .select({ pendientesCount: count() })
      .from(facturacion)
      .where(and(eq(facturacion.guarderiaId, gId), eq(facturacion.estado, 'pendiente'))),

    db
      .select({ pagadasMes: count() })
      .from(facturacion)
      .where(
        and(
          eq(facturacion.guarderiaId, gId),
          eq(facturacion.estado, 'pagada'),
          gte(facturacion.emision, startOfMonth),
          lte(facturacion.emision, endOfMonth),
        ),
      ),

    db
      .select({ vencidas: count() })
      .from(facturacion)
      .where(and(eq(facturacion.guarderiaId, gId), eq(facturacion.estado, 'vencida'))),

    db
      .select({ totalFacturado: sum(facturacion.importe) })
      .from(facturacion)
      .where(eq(facturacion.guarderiaId, gId)),

    db
      .select({
        id: facturacion.id,
        codigo: facturacion.codigo,
        folioLocal: facturacion.folioLocal,
        tipoFactura: facturacion.tipoFactura,
        tipoRecibo: facturacion.tipoRecibo,
        importe: facturacion.importe,
        montoNeto: facturacion.montoNeto,
        montoExento: facturacion.montoExento,
        montoIva: facturacion.montoIva,
        estado: facturacion.estado,
        emision: facturacion.emision,
        vencimiento: facturacion.vencimiento,
        caeVencimiento: facturacion.caeVencimiento,
        desde: facturacion.desde,
        hasta: facturacion.hasta,
        archivo: facturacion.archivo,
        descripcion: facturacion.descripcion,
        socioId: facturacion.socioId,
        cae: facturacion.cae,
        facturaOriginalId: facturacion.facturaOriginalId,
        rechazada: facturacion.rechazada,
        motivoError: facturacion.motivoError,
        condicionVenta: facturacion.condicionVenta,
        medioPago: facturacion.medioPago,
        centroEmisorId: facturacion.centroEmisorId,
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
        socioNumeroSocio: memberships.numeroSocio,
        socioFacturaFiscal: memberships.facturaFiscal,
      })
      .from(facturacion)
      .leftJoin(profiles, eq(profiles.id, facturacion.socioId))
      .leftJoin(
        memberships,
        and(eq(memberships.userId, facturacion.socioId), eq(memberships.guarderiaId, gId)),
      )
      .where(eq(facturacion.guarderiaId, gId))
      .orderBy(desc(facturacion.createdAt))
      .limit(200),

    // Socios activos — la lista base para el combobox de facturación; los
    // pendientes/pendienteTotal se recalculan más abajo desde
    // movsPendientesFiltrados (ya filtrado por FIFO), no acá.
    db
      .select({
        profileId: profiles.id,
        nombre: profiles.nombre,
        apellido: profiles.apellido,
        email: profiles.email,
        razonSocial: profiles.razonSocial,
        direccion: profiles.direccion,
        direccionNumero: profiles.direccionNumero,
        numeroDocumento: profiles.numeroDocumento,
        tipoDocumento: profiles.tipoDocumento,
        cuit: profiles.cuit,
        condicionIva: profiles.condicionIva,
        condicionIvaPersonal: profiles.condicionIvaPersonal,
        // true = factura con datos personales (Generales); false = Datos Impositivos.
        facturaFiscal: memberships.facturaFiscal,
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
        puntoDeVenta: guarderias.puntoDeVenta,
        certificadoAfipOk: guarderias.certificadoAfipOk,
        condicionIva: guarderias.condicionIva,
        nombre: guarderias.nombre,
        razonSocial: guarderias.razonSocial,
        cuit: guarderias.cuit,
        mediosCobroInternos: guarderias.mediosCobroInternos,
      })
      .from(guarderias)
      .where(eq(guarderias.id, gId))
      .limit(1),

    // Movimientos pendientes individuales para el lote (con tipo de servicio)
    db
      .select({
        id: movimientosCuentaCorriente.id,
        socioId: movimientosCuentaCorriente.socioId,
        concepto: movimientosCuentaCorriente.concepto,
        debe: movimientosCuentaCorriente.debe,
        servicioNombre: servicios.nombre,
        tipoServicio: servicios.tipo,
        alicuotaIva: servicios.alicuotaIva,
      })
      .from(movimientosCuentaCorriente)
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, movimientosCuentaCorriente.socioId),
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
          eq(memberships.status, 'active'),
        ),
      )
      .leftJoin(servicios, eq(servicios.id, movimientosCuentaCorriente.servicioId))
      .where(
        and(
          eq(movimientosCuentaCorriente.estado, 'no_pagado'),
          eq(movimientosCuentaCorriente.comprobanteInterno, false),
        ),
      )
      .orderBy(movimientosCuentaCorriente.fecha),

    // Cargos "Interno" pendientes de consolidar en un Comprobante interno.
    db
      .select({
        id: movimientosCuentaCorriente.id,
        socioId: movimientosCuentaCorriente.socioId,
        concepto: movimientosCuentaCorriente.concepto,
        debe: movimientosCuentaCorriente.debe,
        servicioNombre: servicios.nombre,
        tipoServicio: servicios.tipo,
      })
      .from(movimientosCuentaCorriente)
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, movimientosCuentaCorriente.socioId),
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
          eq(memberships.status, 'active'),
        ),
      )
      .leftJoin(servicios, eq(servicios.id, movimientosCuentaCorriente.servicioId))
      .where(
        and(
          eq(movimientosCuentaCorriente.estado, 'no_pagado'),
          eq(movimientosCuentaCorriente.comprobanteInterno, true),
        ),
      )
      .orderBy(movimientosCuentaCorriente.fecha),

    // Embarcaciones por socio, para buscar por embarcación en Facturación
    // manual / Comprobante interno manual.
    db
      .select({ profileId: embarcaciones.profileId, nombre: embarcaciones.nombre })
      .from(embarcaciones)
      .where(eq(embarcaciones.guarderiaId, gId)),

    // Centros emisores (puntos de venta) del club, para el dropdown de
    // "Nuevo comprobante" y la columna Centro emisor de la tabla.
    db
      .select({
        id: guarderiaCentrosEmisores.id,
        nombre: guarderiaCentrosEmisores.nombre,
        puntoDeVenta: guarderiaCentrosEmisores.puntoDeVenta,
        esPrincipal: guarderiaCentrosEmisores.esPrincipal,
      })
      .from(guarderiaCentrosEmisores)
      .where(eq(guarderiaCentrosEmisores.guarderiaId, gId))
      .orderBy(desc(guarderiaCentrosEmisores.esPrincipal), guarderiaCentrosEmisores.puntoDeVenta),
  ]);

  // Nº de operación del Servicio Contratado por factura — depende de los ids
  // que trajo `lista`, así que va después del Promise.all (no se puede
  // batchear en paralelo con la query que le da el input).
  const numeroOperacionPorFactura = await resolverNumeroOperacionPorFactura(lista.map((f) => f.id));

  // Pendientes de facturar computados desde los contratos vigentes (modelo
  // "los cargos nacen al emitir") — alimentan los lotes junto con los cargos
  // legacy que quedaron en cuenta corriente sin comprobante.
  const pendientesComputados = await listarPendientesFacturar(gId);

  const entreEmisor = guarderiaInfo?.razonSocial?.trim() || guarderiaInfo?.nombre || '—';
  const entreEmisorCuit = guarderiaInfo?.cuit?.trim() || '—';

  // Centro emisor por comprobante: del prefijo del codigo ARCA
  // ("PPPPP-NNNNNNNN") si lo tiene, si no del centro registrado al emitir,
  // y como último recurso el principal (comprobantes viejos).
  const puntoVentaPorCentroId = new Map(centrosEmisoresList.map((c) => [c.id, c.puntoDeVenta]));
  const centroEmisorDefault =
    centrosEmisoresList.find((c) => c.esPrincipal)?.puntoDeVenta ??
    guarderiaInfo?.puntoDeVenta ??
    null;
  const centroEmisorDe = (f: { codigo: string | null; centroEmisorId: string | null }): string => {
    const pv = f.codigo?.match(/^(\d+)-\d+$/)?.[1];
    if (pv) return String(parseInt(pv, 10));
    const porId = f.centroEmisorId ? puntoVentaPorCentroId.get(f.centroEmisorId) : null;
    if (porId != null) return String(porId);
    return centroEmisorDefault != null ? String(centroEmisorDefault) : '—';
  };

  const facturas = lista.map((f) => {
    const identidad = identidadFacturacion({
      id: f.socioId ?? '',
      email: f.socioEmail ?? '',
      emailFacturacion: f.socioEmailFacturacion,
      nombre: f.socioNombre,
      apellido: f.socioApellido,
      razonSocial: f.socioRazonSocial,
      tipoDocumento: f.socioTipoDocumento,
      numeroDocumento: f.socioNumeroDocumento,
      cuit: f.socioCuit,
      // El domicilio no se usa acá (solo CUIT/razón social para la tabla).
      direccion: null,
      direccionNumero: null,
      ciudad: null,
      provincia: null,
      direccionFiscal: null,
      direccionFiscalNumero: null,
      ciudadFiscal: null,
      provinciaFiscal: null,
      condicionIva: f.socioCondicionIva,
      condicionIvaPersonal: f.socioCondicionIvaPersonal,
      facturaFiscal: f.socioFacturaFiscal ?? false,
    });
    return {
      id: f.id,
      codigo: f.codigo,
      folioLocal: f.folioLocal,
      tipoFactura: f.tipoFactura,
      tipoRecibo: f.tipoRecibo,
      letra: letraDeComprobante(f.tipoFactura),
      importe: f.importe,
      montoNeto: f.montoNeto,
      montoExento: f.montoExento,
      montoIva: f.montoIva,
      estado: f.estado,
      emision: f.emision ? f.emision.toISOString() : null,
      vencimiento: f.vencimiento ? f.vencimiento.toISOString() : null,
      caeVencimiento: f.caeVencimiento,
      desde: f.desde ? f.desde.toISOString() : null,
      hasta: f.hasta ? f.hasta.toISOString() : null,
      archivo: f.archivo,
      descripcion: f.descripcion,
      socioId: f.socioId,
      cae: f.cae,
      facturaOriginalId: f.facturaOriginalId,
      rechazada: f.rechazada,
      motivoError: f.motivoError,
      condicionVenta: f.condicionVenta,
      medioPago: f.medioPago,
      socioNombre:
        [f.socioNombre, f.socioApellido].filter(Boolean).join(' ') || f.socioEmail || '—',
      socioRazonSocial: identidad.razon,
      socioNumeroSocio: f.socioNumeroSocio,
      socioCuitDni: identidad.numeroDocumento || '—',
      numeroOperacionSC: numeroOperacionPorFactura.get(f.id) ?? '—',
      entreEmisor,
      entreEmisorCuit,
      centroEmisor: centroEmisorDe(f),
    };
  });

  // Excluir cargos ya cubiertos por el pool de haberes (FIFO) aunque su
  // `estado` todavía diga 'no_pagado' — mismo criterio que ya aplica
  // crearFacturaCore al facturar. Sin esto, "Facturación por lote" podía
  // mostrar como pendiente algo que un cobro Payway ya saldó en neto.
  const socioIdsConPendientes = [...new Set(movsPendientesList.map((m) => m.socioId))];
  const saldadosPorSocio = new Map(
    await Promise.all(
      socioIdsConPendientes.map(async (sId) => [sId, await getCargosSaldadosFifo(sId)] as const),
    ),
  );
  const movsPendientesFiltrados = movsPendientesList.filter(
    (m) => !saldadosPorSocio.get(m.socioId)?.has(m.id),
  );

  type FilaLote = {
    id: string;
    concepto: string | null;
    debe: string | null;
    servicioNombre: string | null;
    tipoServicio: string | null;
    alicuotaIva: number | null;
    itemKey: import('@/lib/pendientes-facturar').ItemPendienteKey | null;
  };

  const movsBySocio = new Map<string, FilaLote[]>();
  // Primero los ítems computados (servicios vigentes del período)…
  for (const item of pendientesComputados) {
    if (item.comprobanteInterno) continue;
    if (!movsBySocio.has(item.socioId)) movsBySocio.set(item.socioId, []);
    movsBySocio.get(item.socioId)!.push({
      id: claveItem(item.key),
      concepto: item.concepto,
      debe: item.importe.toFixed(2),
      servicioNombre: null,
      tipoServicio: item.servicioTipo,
      alicuotaIva: item.alicuotaIva,
      itemKey: item.key,
    });
  }
  // …después los cargos legacy de cuenta corriente sin comprobante.
  for (const m of movsPendientesFiltrados) {
    if (!movsBySocio.has(m.socioId)) movsBySocio.set(m.socioId, []);
    movsBySocio.get(m.socioId)!.push({
      id: m.id,
      concepto: m.concepto,
      debe: m.debe,
      servicioNombre: m.servicioNombre,
      tipoServicio: m.tipoServicio,
      alicuotaIva: m.alicuotaIva != null ? Number(m.alicuotaIva) : null,
      itemKey: null,
    });
  }

  const embsBySocio = new Map<string, string[]>();
  for (const e of embarcacionesList) {
    if (!e.profileId) continue;
    if (!embsBySocio.has(e.profileId)) embsBySocio.set(e.profileId, []);
    if (e.nombre) embsBySocio.get(e.profileId)!.push(e.nombre);
  }

  const socios = sociosList.map((s) => {
    const movs = movsBySocio.get(s.profileId) ?? [];
    return {
      id: s.profileId,
      nombre: [s.nombre, s.apellido].filter(Boolean).join(' ') || s.razonSocial || s.email,
      email: s.email,
      razonSocial: s.razonSocial ?? null,
      direccion: s.direccion ?? null,
      direccionNumero: s.direccionNumero ?? null,
      numeroDocumento: s.numeroDocumento ?? '',
      tipoDocumento: s.tipoDocumento ?? null,
      cuit: s.cuit ?? null,
      condicionIva: s.condicionIva ?? null,
      condicionIvaPersonal: s.condicionIvaPersonal ?? null,
      facturaFiscal: s.facturaFiscal,
      numeroSocio: s.numeroSocio,
      embarcaciones: embsBySocio.get(s.profileId) ?? [],
      // Recalculado sobre la lista ya filtrada por FIFO, no el agregado SQL
      // (que no sabe de cargos saldados en neto vía Payway).
      pendientes: movs.length,
      pendienteTotal: movs.reduce((acc, m) => acc + parseFloat(m.debe ?? '0'), 0).toFixed(2),
      movimientos: movs,
    };
  });

  // Cargos "Interno" pendientes, agrupados por socio (para Comprobante interno por lote).
  const movsInternoBySocio = new Map<string, FilaLote[]>();
  for (const item of pendientesComputados) {
    if (!item.comprobanteInterno) continue;
    if (!movsInternoBySocio.has(item.socioId)) movsInternoBySocio.set(item.socioId, []);
    movsInternoBySocio.get(item.socioId)!.push({
      id: claveItem(item.key),
      concepto: item.concepto,
      debe: item.importe.toFixed(2),
      servicioNombre: null,
      tipoServicio: item.servicioTipo,
      // Interno: sin IVA, el desglose no aplica.
      alicuotaIva: null,
      itemKey: item.key,
    });
  }
  for (const m of movsPendientesInternoList) {
    if (!movsInternoBySocio.has(m.socioId)) movsInternoBySocio.set(m.socioId, []);
    movsInternoBySocio.get(m.socioId)!.push({
      id: m.id,
      concepto: m.concepto,
      debe: m.debe,
      servicioNombre: m.servicioNombre,
      tipoServicio: m.tipoServicio,
      alicuotaIva: null,
      itemKey: null,
    });
  }
  const sociosInterno = socios
    .map((s) => ({
      id: s.id,
      nombre: s.nombre,
      email: s.email,
      movimientos: movsInternoBySocio.get(s.id) ?? [],
    }))
    .filter((s) => s.movimientos.length > 0);

  const posConfigurado = centrosEmisoresList.length > 0 || guarderiaInfo?.puntoDeVenta != null;
  const certificadoOk = guarderiaInfo?.certificadoAfipOk ?? false;
  const guarderiaCondicionIva = guarderiaInfo?.condicionIva ?? null;

  return (
    <VentasClient
      facturas={facturas}
      socios={socios}
      sociosInterno={sociosInterno}
      kpis={{
        pendientes: pendientesCount,
        pagadasMes,
        vencidas,
        totalFacturado: totalFacturado ?? '0',
      }}
      posConfigurado={posConfigurado}
      certificadoOk={certificadoOk}
      guarderiaCondicionIva={guarderiaCondicionIva}
      centrosEmisores={centrosEmisoresList}
      internosHabilitados={(guarderiaInfo?.mediosCobroInternos ?? []).length > 0}
    />
  );
}
