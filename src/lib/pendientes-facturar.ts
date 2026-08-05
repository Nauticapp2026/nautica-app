/**
 * Cómputo de "pendientes de facturar": qué ítems le corresponde cobrar a cada
 * socio, derivado en vivo de los contratos vigentes (`socio_servicios`), los
 * espacios asignados (`espacios`) y los ítems one-shot con monto custom
 * (`cargos_pendientes`, hoy solo baja anticipada).
 *
 * Modelo "los cargos nacen al emitir" (2026-07): contratar un servicio o
 * asignar un espacio NO crea ningún movimiento en cuenta corriente. La
 * emisión de comprobantes (manual desde /ventas o automática el día de
 * facturación) llama a `listarPendientesFacturar`, muestra/toma estos ítems
 * y crea los cargos dentro de la misma transacción de emisión, vinculados al
 * comprobante. La cuenta corriente solo contiene deuda con comprobante.
 *
 * "¿Ya facturado?" se resuelve con anti-join contra movimientos:
 *  - camino nuevo: `socio_servicio_id` + `periodo` (o one-shot sin período),
 *    respaldado por los índices únicos parciales de la mig 0133;
 *  - guarda legacy (transición): cargos del cron viejo sin `socio_servicio_id`
 *    dentro de la ventana de 27 días — evita doble cobro del mes del cutover.
 *    Se retira cuando el pool legacy drene (ver plan del refactor).
 */

import { and, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  cargosPendientes,
  espacios,
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  servicios,
  socioServicios,
  socioServiciosCancelados,
} from '@/lib/db/schema';
import { precioConIva } from '@/lib/iva';
import { calcularProporcionalMes, primerDiaHabilDelMes } from '@/lib/movimientos-mensuales';

/** Executor: el `db` global o la `tx` de una transacción en curso. */
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ItemPendienteKey =
  | { origen: 'contrato'; contratoId: string; periodo: string | null }
  | { origen: 'espacio'; espacioId: string; socioId: string; periodo: string | null }
  | { origen: 'baja'; cargoPendienteId: string };

export type ItemPendiente = {
  key: ItemPendienteKey;
  origen: 'contrato' | 'espacio' | 'baja';
  socioId: string;
  servicioId: string | null;
  /** socio_servicios.id — también para espacios cuando existe la fila espejo. */
  contratoId: string | null;
  espacioId: string | null;
  concepto: string;
  /** Importe final: con IVA si es fiscal, precio base si es interno. */
  importe: number;
  alicuotaIva: number | null;
  /** Plazo de cobro (días) de la tarifa — para sugerir el vencimiento al emitir. */
  plazoPagoDias: number | null;
  /** Categoría del servicio (espacio_guarda, cuota_social, …) para filtros de UI. */
  servicioTipo: string | null;
  comprobanteInterno: boolean;
  esProporcional: boolean;
  cantidadDias: number | null;
  /** 'YYYY-MM-01' para ciclos mensuales; null en one-shots. */
  periodo: string | null;
  tipoMovimiento: 'mensual' | 'otro';
  /** true = contrato Variable: se cierra (fechaBaja) al emitir. */
  esVariable: boolean;
  /** true = cuota Fija del mes siguiente facturada por adelantado (opt-in). */
  esAdelanto?: boolean;
};

/** Serializa una key para matchear la selección del cliente con el re-cómputo. */
export function claveItem(key: ItemPendienteKey): string {
  switch (key.origen) {
    case 'contrato':
      return `c:${key.contratoId}:${key.periodo ?? ''}`;
    case 'espacio':
      return `e:${key.espacioId}:${key.socioId}:${key.periodo ?? ''}`;
    case 'baja':
      return `b:${key.cargoPendienteId}`;
  }
}

function periodoDe(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function periodoAnterior(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return periodoDe(prev);
}

function periodoSiguiente(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  // m es 1-based; el índice de mes de Date es 0-based, así que `m` ya apunta al
  // mes siguiente.
  const next = new Date(Date.UTC(y, m, 1));
  return periodoDe(next);
}

const MESES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Etiqueta legible de un período 'YYYY-MM-01' → 'septiembre 2026'. */
function etiquetaMes(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  return `${MESES_ES[m - 1]} ${y}`;
}

/** Mismo criterio de ventana que los generadores legacy (ver hace27Dias). */
function hace27Dias(now: Date): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 27);
  return d;
}

function sufijoProporcional(diasRestantes: number, diasMes: number): string {
  return ` (proporcional ${diasRestantes}/${diasMes} días)`;
}

/**
 * Importe final de un servicio según el canal del contrato: los internos no
 * pasan por ARCA y cobran el precio base tal cual; los fiscales suman IVA.
 * Misma regla que usaba el cron viejo (movimientos-mensuales.ts).
 */
function importeFinal(precioNeto: number, alicuotaIva: number, interno: boolean): number {
  return interno ? precioNeto : precioConIva(precioNeto, alicuotaIva);
}

export async function listarPendientesFacturar(
  guarderiaId: string,
  opts?: {
    socioId?: string;
    now?: Date;
    dbx?: DbExecutor;
    // Suma, además del período corriente, la cuota Fija del mes siguiente
    // (mes completo) como ítem de adelanto opt-in. Solo lo usa la emisión
    // manual desde /ventas; el cron mensual nunca adelanta.
    incluirMesSiguiente?: boolean;
  },
): Promise<ItemPendiente[]> {
  const dbx = opts?.dbx ?? db;
  const now = opts?.now ?? new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const periodoActual = periodoDe(now);
  const periodoSig = periodoSiguiente(periodoActual);
  const incluirMesSiguiente = opts?.incluirMesSiguiente ?? false;
  const items: ItemPendiente[] = [];

  // ── 1. Contratos sin espacio (Cargar Servicio) ────────────────────────────
  const contratos = await dbx
    .select({
      contratoId: socioServicios.id,
      socioId: socioServicios.socioId,
      servicioId: socioServicios.servicioId,
      fechaAsignacion: socioServicios.fechaAsignacion,
      fechaInicio: socioServicios.fechaInicio,
      fechaBaja: socioServicios.fechaBaja,
      concepto: socioServicios.concepto,
      comprobanteInterno: socioServicios.comprobanteInterno,
      cantidadDias: socioServicios.cantidadDias,
      servicioNombre: servicios.nombre,
      servicioTipo: servicios.tipo,
      servicioPrecio: servicios.precio,
      servicioAlicuotaIva: servicios.alicuotaIva,
      servicioPlazoPagoDias: servicios.plazoPagoDias,
      servicioVigenciaHasta: servicios.vigenciaHasta,
      tipoCobro: servicios.tipoCobro,
      tarifaVariable: servicios.tarifaVariable,
      politicaBaja: servicios.politicaBajaAnticipada,
    })
    .from(socioServicios)
    .innerJoin(servicios, eq(servicios.id, socioServicios.servicioId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, socioServicios.socioId),
        eq(memberships.guarderiaId, socioServicios.guarderiaId),
        eq(memberships.rol, 'socio'),
        eq(memberships.status, 'active'),
      ),
    )
    .where(
      and(
        eq(socioServicios.guarderiaId, guarderiaId),
        opts?.socioId ? eq(socioServicios.socioId, opts.socioId) : undefined,
        isNull(socioServicios.espacioId),
        lte(socioServicios.fechaInicio, todayStr),
        or(isNull(socioServicios.fechaBaja), gte(socioServicios.fechaBaja, todayStr)),
        eq(servicios.estado, 'activo'),
        lte(servicios.vigenciaDesde, todayStr),
        gte(servicios.vigenciaHasta, todayStr),
      ),
    );

  // ── 2. Espacios asignados ────────────────────────────────────────────────
  // Fuente de verdad: la tabla `espacios` (hay asignaciones legacy sin fila
  // espejo en socio_servicios). Left join a la fila espejo abierta para
  // heredar contratoId / canal interno / concepto — arregla de paso el bug
  // del cron viejo que nunca propagaba comprobanteInterno a espacios. Si no
  // hay fila espejo (asignaciones legacy), el canal cae al tilde
  // "Comprobante interno" del socio (memberships, mig 0132).
  const filasEspacios = await dbx
    .select({
      espacioId: espacios.id,
      socioId: espacios.ocupanteId,
      servicioId: espacios.servicioId,
      fechaAsignacion: espacios.fechaAsignacion,
      servicioNombre: servicios.nombre,
      servicioTipo: servicios.tipo,
      servicioPrecio: servicios.precio,
      servicioAlicuotaIva: servicios.alicuotaIva,
      servicioPlazoPagoDias: servicios.plazoPagoDias,
      servicioVigenciaHasta: servicios.vigenciaHasta,
      tipoCobro: servicios.tipoCobro,
      politicaBaja: servicios.politicaBajaAnticipada,
      socioTildeInterno: memberships.comprobanteInterno,
      contratoId: socioServicios.id,
      contratoConcepto: socioServicios.concepto,
      contratoInterno: socioServicios.comprobanteInterno,
      contratoFechaInicio: socioServicios.fechaInicio,
    })
    .from(espacios)
    .innerJoin(servicios, eq(servicios.id, espacios.servicioId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, espacios.ocupanteId),
        eq(memberships.guarderiaId, espacios.guarderiaId),
        eq(memberships.rol, 'socio'),
        eq(memberships.status, 'active'),
      ),
    )
    .leftJoin(
      socioServicios,
      and(
        eq(socioServicios.espacioId, espacios.id),
        eq(socioServicios.socioId, espacios.ocupanteId),
        eq(socioServicios.servicioId, espacios.servicioId),
        isNull(socioServicios.fechaBaja),
      ),
    )
    .where(
      and(
        eq(espacios.guarderiaId, guarderiaId),
        opts?.socioId ? eq(espacios.ocupanteId, opts.socioId) : undefined,
        isNotNull(espacios.ocupanteId),
        isNotNull(espacios.servicioId),
        eq(servicios.estado, 'activo'),
        lte(servicios.vigenciaDesde, todayStr),
        gte(servicios.vigenciaHasta, todayStr),
      ),
    );

  // ── Cancelados: un (socio, servicio) cancelado no genera más cargos ──────
  const socioIds = [
    ...new Set([
      ...contratos.map((c) => c.socioId),
      ...filasEspacios.map((f) => f.socioId).filter((s): s is string => s != null),
    ]),
  ];
  const servicioIds = [
    ...new Set([
      ...contratos.map((c) => c.servicioId),
      ...filasEspacios.map((f) => f.servicioId).filter((s): s is string => s != null),
    ]),
  ];
  const canceladosSet = new Set<string>();
  if (socioIds.length > 0 && servicioIds.length > 0) {
    const cancelados = await dbx
      .select({
        socioId: socioServiciosCancelados.socioId,
        servicioId: socioServiciosCancelados.servicioId,
      })
      .from(socioServiciosCancelados)
      .where(
        and(
          eq(socioServiciosCancelados.guarderiaId, guarderiaId),
          inArray(socioServiciosCancelados.socioId, socioIds),
          inArray(socioServiciosCancelados.servicioId, servicioIds),
        ),
      );
    for (const c of cancelados) canceladosSet.add(`${c.socioId}:${c.servicioId}`);
  }

  // ── Anti-joins: qué ya se facturó ────────────────────────────────────────
  const contratoIds = [
    ...new Set([
      ...contratos.map((c) => c.contratoId),
      ...filasEspacios.map((f) => f.contratoId).filter((c): c is string => c != null),
    ]),
  ];

  // Camino nuevo: movimientos con socio_servicio_id de los candidatos.
  const facturadoPorContrato = new Set<string>(); // `${contratoId}:${periodo|''}`
  const contratosConCargo = new Set<string>(); // contratoId con al menos un cargo
  if (contratoIds.length > 0) {
    const movs = await dbx
      .select({
        socioServicioId: movimientosCuentaCorriente.socioServicioId,
        periodo: movimientosCuentaCorriente.periodo,
      })
      .from(movimientosCuentaCorriente)
      .where(inArray(movimientosCuentaCorriente.socioServicioId, contratoIds));
    for (const m of movs) {
      if (!m.socioServicioId) continue;
      facturadoPorContrato.add(`${m.socioServicioId}:${m.periodo ?? ''}`);
      contratosConCargo.add(m.socioServicioId);
    }
  }

  // Camino nuevo espacios + historial completo del par (socio, espacio) para
  // detectar primer ciclo (proporcional) — incluye cargos legacy.
  const facturadoPorEspacio = new Set<string>(); // `${espacioId}:${socioId}:${periodo}`
  const espacioPairConCargo = new Set<string>(); // `${espacioId}:${socioId}`
  const espacioPairLegacyReciente = new Set<string>(); // legacy dentro de 27 días
  const espacioIds = filasEspacios.map((f) => f.espacioId);
  if (espacioIds.length > 0) {
    const movs = await dbx
      .select({
        espacioId: movimientosCuentaCorriente.espacioId,
        socioId: movimientosCuentaCorriente.socioId,
        periodo: movimientosCuentaCorriente.periodo,
        socioServicioId: movimientosCuentaCorriente.socioServicioId,
        fecha: movimientosCuentaCorriente.fecha,
      })
      .from(movimientosCuentaCorriente)
      .where(
        and(
          inArray(movimientosCuentaCorriente.espacioId, espacioIds),
          eq(movimientosCuentaCorriente.tipo, 'mensual'),
        ),
      );
    for (const m of movs) {
      if (!m.espacioId) continue;
      const pair = `${m.espacioId}:${m.socioId}`;
      espacioPairConCargo.add(pair);
      if (m.periodo) facturadoPorEspacio.add(`${pair}:${m.periodo}`);
      if (!m.socioServicioId && !m.periodo && m.fecha && m.fecha >= hace27Dias(now)) {
        espacioPairLegacyReciente.add(pair);
      }
    }
  }

  // Guarda legacy para contratos sin espacio: cargos del cron viejo (sin
  // socio_servicio_id) del mismo (socio, servicio) — mensuales dentro de la
  // ventana de 27 días, variables desde la fecha de alta del contrato.
  const legacyMensualServicio = new Set<string>(); // `${socioId}:${servicioId}`
  const legacyMovsServicio: { socioId: string; servicioId: string | null; fecha: Date | null }[] =
    [];
  if (contratos.length > 0) {
    const minFecha = contratos.reduce(
      (min, c) => (c.fechaAsignacion < min ? c.fechaAsignacion : min),
      hace27Dias(now),
    );
    const movs = await dbx
      .select({
        socioId: movimientosCuentaCorriente.socioId,
        servicioId: movimientosCuentaCorriente.servicioId,
        tipo: movimientosCuentaCorriente.tipo,
        fecha: movimientosCuentaCorriente.fecha,
      })
      .from(movimientosCuentaCorriente)
      .where(
        and(
          inArray(movimientosCuentaCorriente.socioId, [
            ...new Set(contratos.map((c) => c.socioId)),
          ]),
          inArray(movimientosCuentaCorriente.servicioId, [
            ...new Set(contratos.map((c) => c.servicioId)),
          ]),
          isNull(movimientosCuentaCorriente.espacioId),
          isNull(movimientosCuentaCorriente.socioServicioId),
          gte(movimientosCuentaCorriente.fecha, minFecha),
        ),
      );
    for (const m of movs) {
      legacyMovsServicio.push(m);
      if (m.tipo === 'mensual' && m.fecha && m.fecha >= hace27Dias(now)) {
        legacyMensualServicio.add(`${m.socioId}:${m.servicioId}`);
      }
    }
  }

  // ── Armar ítems: contratos ───────────────────────────────────────────────
  for (const c of contratos) {
    if (canceladosSet.has(`${c.socioId}:${c.servicioId}`)) continue;

    const precioNeto = c.servicioPrecio != null ? Number(c.servicioPrecio) : 0;
    const alicuotaIva = c.servicioAlicuotaIva != null ? Number(c.servicioAlicuotaIva) : 0;
    const conceptoBase = c.concepto ?? c.servicioNombre;

    if (c.tipoCobro === 'variable') {
      // One-shot: pendiente desde fechaInicio hasta que se emita.
      if (facturadoPorContrato.has(`${c.contratoId}:`)) continue;
      // Guarda legacy: el cron viejo ya lo cobró (cargo posterior al alta).
      const yaLegacy = legacyMovsServicio.some(
        (m) =>
          m.socioId === c.socioId &&
          m.servicioId === c.servicioId &&
          m.fecha != null &&
          m.fecha >= c.fechaAsignacion,
      );
      if (yaLegacy) continue;

      const dias = c.tarifaVariable === 'diaria' ? c.cantidadDias : null;
      const importe =
        dias != null
          ? importeFinal(precioNeto * dias, alicuotaIva, c.comprobanteInterno)
          : importeFinal(precioNeto, alicuotaIva, c.comprobanteInterno);
      items.push({
        key: { origen: 'contrato', contratoId: c.contratoId, periodo: null },
        origen: 'contrato',
        socioId: c.socioId,
        servicioId: c.servicioId,
        contratoId: c.contratoId,
        espacioId: null,
        concepto:
          dias != null ? `${conceptoBase} (${dias} ${dias === 1 ? 'día' : 'días'})` : conceptoBase,
        importe,
        alicuotaIva,
        plazoPagoDias: c.servicioPlazoPagoDias,
        servicioTipo: c.servicioTipo,
        comprobanteInterno: c.comprobanteInterno,
        esProporcional: false,
        cantidadDias: dias,
        periodo: null,
        tipoMovimiento: 'otro',
        esVariable: true,
      });
      continue;
    }

    // Fijo mensual: un ítem por el período corriente.
    const yaFacturadoActual =
      facturadoPorContrato.has(`${c.contratoId}:${periodoActual}`) ||
      legacyMensualServicio.has(`${c.socioId}:${c.servicioId}`);

    if (!yaFacturadoActual) {
      // Primer ciclo iniciado este mes → proporcional desde fechaInicio, salvo
      // que el tarifario diga 'mes_completo': esa política manda también en el
      // alta, no solo en la baja anticipada.
      const inicioEnMesActual = c.fechaInicio.slice(0, 8) === periodoActual.slice(0, 8);
      let importe = importeFinal(precioNeto, alicuotaIva, c.comprobanteInterno);
      let concepto = conceptoBase;
      let esProporcional = false;
      if (
        inicioEnMesActual &&
        !contratosConCargo.has(c.contratoId) &&
        c.politicaBaja !== 'mes_completo'
      ) {
        const base = new Date(`${c.fechaInicio}T00:00:00Z`);
        const prop = calcularProporcionalMes(importe, base);
        if (prop.esProporcional) {
          importe = prop.importe;
          concepto = `${conceptoBase}${sufijoProporcional(prop.diasRestantes, prop.diasMes)}`;
          esProporcional = true;
        }
      }

      items.push({
        key: { origen: 'contrato', contratoId: c.contratoId, periodo: periodoActual },
        origen: 'contrato',
        socioId: c.socioId,
        servicioId: c.servicioId,
        contratoId: c.contratoId,
        espacioId: null,
        concepto,
        importe,
        alicuotaIva,
        plazoPagoDias: c.servicioPlazoPagoDias,
        servicioTipo: c.servicioTipo,
        comprobanteInterno: c.comprobanteInterno,
        esProporcional,
        cantidadDias: null,
        periodo: periodoActual,
        tipoMovimiento: 'mensual',
        esVariable: false,
      });
    }

    // Adelanto opt-in del mes siguiente: siempre mes completo. Se ofrece
    // aunque el mes corriente ya esté facturado (el club puede adelantar sin
    // haber cobrado el actual). Guardas: que no esté ya facturado ese período,
    // que la tarifa siga vigente y que el contrato no se dé de baja antes.
    if (incluirMesSiguiente) {
      const yaFacturadoSig = facturadoPorContrato.has(`${c.contratoId}:${periodoSig}`);
      const vigenteMesSig =
        c.servicioVigenciaHasta == null || c.servicioVigenciaHasta >= periodoSig;
      const bajaAntesDeSig = c.fechaBaja != null && c.fechaBaja < periodoSig;
      if (!yaFacturadoSig && vigenteMesSig && !bajaAntesDeSig) {
        items.push({
          key: { origen: 'contrato', contratoId: c.contratoId, periodo: periodoSig },
          origen: 'contrato',
          socioId: c.socioId,
          servicioId: c.servicioId,
          contratoId: c.contratoId,
          espacioId: null,
          concepto: `${conceptoBase} (adelanto ${etiquetaMes(periodoSig)})`,
          importe: importeFinal(precioNeto, alicuotaIva, c.comprobanteInterno),
          alicuotaIva,
          plazoPagoDias: c.servicioPlazoPagoDias,
          servicioTipo: c.servicioTipo,
          comprobanteInterno: c.comprobanteInterno,
          esProporcional: false,
          cantidadDias: null,
          periodo: periodoSig,
          tipoMovimiento: 'mensual',
          esVariable: false,
          esAdelanto: true,
        });
      }
    }
  }

  // ── Armar ítems: espacios ────────────────────────────────────────────────
  // Dedup: si el mismo (socio, servicio) ya entró por un contrato sin espacio
  // (la misma tarifa cargada a mano con "Cargar Servicio"), el ítem del
  // espacio se omite para no ofrecer el mismo servicio dos veces. El contrato
  // explícito manda — es donde el admin eligió el canal Interno/Fiscal.
  const cubiertoPorContrato = new Set(items.map((i) => `${i.socioId}:${i.servicioId}`));

  for (const f of filasEspacios) {
    if (!f.socioId || !f.servicioId) continue;
    if (canceladosSet.has(`${f.socioId}:${f.servicioId}`)) continue;
    if (cubiertoPorContrato.has(`${f.socioId}:${f.servicioId}`)) continue;

    const pair = `${f.espacioId}:${f.socioId}`;
    const precioNeto = f.servicioPrecio != null ? Number(f.servicioPrecio) : 0;
    const alicuotaIva = f.servicioAlicuotaIva != null ? Number(f.servicioAlicuotaIva) : 0;
    const interno = f.contratoInterno ?? f.socioTildeInterno ?? false;
    const conceptoBase = f.contratoConcepto ?? f.servicioNombre;
    const importeMes = importeFinal(precioNeto, alicuotaIva, interno);
    const primerCiclo = !espacioPairConCargo.has(pair);
    // Fecha de alta efectiva para el prorrateo del primer ciclo.
    const alta = f.contratoFechaInicio
      ? new Date(`${f.contratoFechaInicio}T00:00:00Z`)
      : (f.fechaAsignacion ?? null);
    const altaPeriodo = alta ? periodoDe(alta) : null;

    const pushEspacio = (params: {
      periodo: string | null;
      importe: number;
      concepto: string;
      esProporcional: boolean;
      tipoMovimiento: 'mensual' | 'otro';
      esVariable: boolean;
      esAdelanto?: boolean;
    }) => {
      items.push({
        key: {
          origen: 'espacio',
          espacioId: f.espacioId,
          socioId: f.socioId!,
          periodo: params.periodo,
        },
        origen: 'espacio',
        socioId: f.socioId!,
        servicioId: f.servicioId,
        contratoId: f.contratoId,
        espacioId: f.espacioId,
        concepto: params.concepto,
        importe: params.importe,
        alicuotaIva,
        plazoPagoDias: f.servicioPlazoPagoDias,
        servicioTipo: f.servicioTipo,
        comprobanteInterno: interno,
        esProporcional: params.esProporcional,
        cantidadDias: null,
        periodo: params.periodo,
        tipoMovimiento: params.tipoMovimiento,
        esVariable: params.esVariable,
        esAdelanto: params.esAdelanto,
      });
    };

    if (f.tipoCobro === 'variable') {
      // Tarifa Variable atada a espacio: bajo el modelo viejo se cobraba una
      // única vez (el proporcional al asignar). Acá: one-shot si el par nunca
      // tuvo cargo.
      if (!primerCiclo) continue;
      if (f.contratoId && facturadoPorContrato.has(`${f.contratoId}:`)) continue;
      const prop =
        alta && altaPeriodo === periodoActual
          ? calcularProporcionalMes(importeMes, alta)
          : { importe: importeMes, diasRestantes: 0, diasMes: 0, esProporcional: false };
      pushEspacio({
        periodo: null,
        importe: prop.importe,
        concepto: prop.esProporcional
          ? `${conceptoBase}${sufijoProporcional(prop.diasRestantes, prop.diasMes)}`
          : conceptoBase,
        esProporcional: prop.esProporcional,
        tipoMovimiento: 'otro',
        esVariable: f.contratoId != null,
      });
      continue;
    }

    // Fijo mensual.
    const yaEsteMes =
      facturadoPorEspacio.has(`${pair}:${periodoActual}`) ||
      espacioPairLegacyReciente.has(pair) ||
      (f.contratoId != null && facturadoPorContrato.has(`${f.contratoId}:${periodoActual}`));

    // Adelanto opt-in del mes siguiente: siempre mes completo. Independiente
    // del mes corriente; guardas por ya-facturado y vigencia de la tarifa.
    if (incluirMesSiguiente) {
      const yaSig =
        facturadoPorEspacio.has(`${pair}:${periodoSig}`) ||
        (f.contratoId != null && facturadoPorContrato.has(`${f.contratoId}:${periodoSig}`));
      const vigenteMesSig =
        f.servicioVigenciaHasta == null || f.servicioVigenciaHasta >= periodoSig;
      if (!yaSig && vigenteMesSig) {
        pushEspacio({
          periodo: periodoSig,
          importe: importeMes,
          concepto: `${conceptoBase} (adelanto ${etiquetaMes(periodoSig)})`,
          esProporcional: false,
          tipoMovimiento: 'mensual',
          esVariable: false,
          esAdelanto: true,
        });
      }
    }

    if (primerCiclo && alta && altaPeriodo != null) {
      if (altaPeriodo === periodoActual) {
        // Asignado este mes → proporcional por los días restantes, salvo
        // política 'mes_completo' (cobra el mes entero desde el alta).
        if (!yaEsteMes) {
          const prop =
            f.politicaBaja === 'mes_completo'
              ? { importe: importeMes, diasRestantes: 0, diasMes: 0, esProporcional: false }
              : calcularProporcionalMes(importeMes, alta);
          pushEspacio({
            periodo: periodoActual,
            importe: prop.importe,
            concepto: prop.esProporcional
              ? `${conceptoBase}${sufijoProporcional(prop.diasRestantes, prop.diasMes)}`
              : conceptoBase,
            esProporcional: prop.esProporcional,
            tipoMovimiento: 'mensual',
            esVariable: false,
          });
        }
        continue;
      }
      if (altaPeriodo === periodoAnterior(periodoActual)) {
        // Asignado el mes pasado y nunca facturado: se ofrece el proporcional
        // de ese mes (que el modelo viejo cobraba al asignar) además del mes
        // corriente.
        if (!facturadoPorEspacio.has(`${pair}:${altaPeriodo}`)) {
          if (f.politicaBaja === 'mes_completo') {
            pushEspacio({
              periodo: altaPeriodo,
              importe: importeMes,
              concepto: conceptoBase,
              esProporcional: false,
              tipoMovimiento: 'mensual',
              esVariable: false,
            });
          } else {
            const prop = calcularProporcionalMes(importeMes, alta);
            if (prop.esProporcional) {
              pushEspacio({
                periodo: altaPeriodo,
                importe: prop.importe,
                concepto: `${conceptoBase}${sufijoProporcional(prop.diasRestantes, prop.diasMes)}`,
                esProporcional: true,
                tipoMovimiento: 'mensual',
                esVariable: false,
              });
            }
          }
        }
      }
    }

    if (!yaEsteMes) {
      pushEspacio({
        periodo: periodoActual,
        importe: importeMes,
        concepto: conceptoBase,
        esProporcional: false,
        tipoMovimiento: 'mensual',
        esVariable: false,
      });
    }
  }

  // ── 3. Ítems one-shot con monto custom (baja anticipada) ────────────────
  const bajas = await dbx
    .select({
      id: cargosPendientes.id,
      socioId: cargosPendientes.socioId,
      servicioId: cargosPendientes.servicioId,
      socioServicioId: cargosPendientes.socioServicioId,
      concepto: cargosPendientes.concepto,
      importe: cargosPendientes.importe,
      alicuotaIva: cargosPendientes.alicuotaIva,
      comprobanteInterno: cargosPendientes.comprobanteInterno,
    })
    .from(cargosPendientes)
    .where(
      and(
        eq(cargosPendientes.guarderiaId, guarderiaId),
        opts?.socioId ? eq(cargosPendientes.socioId, opts.socioId) : undefined,
        isNull(cargosPendientes.movimientoId),
        eq(cargosPendientes.anulado, false),
      ),
    );

  for (const b of bajas) {
    items.push({
      key: { origen: 'baja', cargoPendienteId: b.id },
      origen: 'baja',
      socioId: b.socioId,
      servicioId: b.servicioId,
      contratoId: b.socioServicioId,
      espacioId: null,
      concepto: b.concepto,
      importe: Number(b.importe),
      alicuotaIva: b.alicuotaIva != null ? Number(b.alicuotaIva) : null,
      plazoPagoDias: null,
      servicioTipo: null,
      comprobanteInterno: b.comprobanteInterno,
      esProporcional: false,
      cantidadDias: null,
      periodo: null,
      tipoMovimiento: 'otro',
      esVariable: false,
    });
  }

  return items;
}

/**
 * Guarderías cuyo día de facturación es hoy y agrupación por socio — helpers
 * para la auto-emisión del cron.
 */
export function agruparPorSocio(items: ItemPendiente[]): Map<string, ItemPendiente[]> {
  const porSocio = new Map<string, ItemPendiente[]>();
  for (const item of items) {
    const list = porSocio.get(item.socioId) ?? [];
    list.push(item);
    porSocio.set(item.socioId, list);
  }
  return porSocio;
}

export { primerDiaHabilDelMes };
