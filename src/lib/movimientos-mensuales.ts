/**
 * Helpers para generar movimientos mensuales en la cuenta corriente del socio.
 *
 * Modelo de cobro (post deploy 0019):
 *  - Cada guardería elige un `diaFacturacion` (1-28) en Configuración.
 *  - El cron diario corre en todas las guarderías y, para las cuyo
 *    `diaFacturacion === hoy`, crea el movimiento mensual de cada espacio
 *    asignado.
 *  - Adicionalmente, dispara la auto-emisión de facturas para los socios
 *    con pendientes (ver `auto-facturacion.ts`). La primera factura de
 *    cada socio sigue siendo manual.
 *
 * Regla Fijo/Variable (post deploy — Comprobante interno / servicios
 * recurrentes): las tarifas **Fijas** se cobran mensual automático. Las
 * **Variables** se cobran una sola vez. Hay dos caminos, y lo que decide
 * cuál corresponde es si el cargo está atado a un espacio asignado, no la
 * categoría de la tarifa:
 *  - `runMonthlyGeneration` — cargos con `espacio_id` (vienen de "Asignar
 *    espacio").
 *  - `runMonthlyGeneracionServiciosRecurrentes` — cargos sin `espacio_id`
 *    (vienen de "Cargar Servicio", sea cual sea la categoría de la
 *    tarifa). A diferencia de Espacios, acá la fuente de verdad de a quién
 *    cobrar es directamente la tabla de contratos `socio_servicios`
 *    (fechaInicio/fechaBaja) — "Cargar Servicio" ya NO crea ningún
 *    movimiento en cuenta corriente al contratar, así que la cuenta
 *    corriente del socio recién se mueve cuando este cron efectivamente
 *    factura (Fijo: cada ciclo mensual; Variable: la primera vez que corre
 *    después de la fecha de inicio del contrato, una sola vez).
 *
 * Uso:
 *  - updateEspacioAction: al asociar un socio a un espacio con tarifa,
 *    creamos el movimiento del mes corriente prorrateado por los días
 *    que quedan hasta fin de mes (sin tocar — comportamiento al alta).
 *  - Cron diario (/api/cron/mensuales): genera mensuales + auto-emite.
 *
 * La columna `espacios.fecha_asignacion` queda en la DB pero deja de
 * usarse para decidir cuándo cobrar (era el modelo aniversario, ahora
 * deprecado). Sigue siendo útil como historial del alta.
 */

import { and, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  espacios,
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  servicios,
  socioServicios,
  socioServiciosCancelados,
} from '@/lib/db/schema';
import { precioConIva } from '@/lib/iva';

function nextMonthStart(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * Dado un día N restando 27 días desde `now`. Sirve como ventana de
 * idempotencia: garantizamos que no se cobre dos veces dentro de un
 * ciclo (el ciclo más corto entre cobros consecutivos es 28 días en
 * febrero no bisiesto).
 */
function hace27Dias(now: Date): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 27);
  return d;
}

/**
 * Para asignaciones a mitad de mes, cobramos solo los días que quedan
 * (incluye el día de asignación). Si la fecha es el día 1, devuelve el
 * mes completo. El cron mensual usa siempre el precio completo.
 *
 * `precio` tiene que venir YA con IVA sumado (lo que se le cobra al socio) —
 * `servicios.precio` se guarda neto, así que el caller debe pasarlo por
 * `precioConIva()` antes de llamar a esta función.
 */
export function calcularProporcionalMes(
  precio: number,
  fecha: Date = new Date(),
): {
  importe: number;
  diasRestantes: number;
  diasMes: number;
  esProporcional: boolean;
} {
  const diasMes = daysInMonth(fecha);
  const diaActual = fecha.getUTCDate();
  const diasRestantes = diasMes - diaActual + 1;
  const importe = Math.round((precio / diasMes) * diasRestantes * 100) / 100;
  return {
    importe,
    diasRestantes,
    diasMes,
    esProporcional: diasRestantes !== diasMes,
  };
}

/**
 * Devuelve el día del mes (1-3) correspondiente al primer día hábil
 * (lunes a viernes). Si el 1º es sábado → día 3; si es domingo → día 2.
 */
export function primerDiaHabilDelMes(d: Date): number {
  const dow = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).getUTCDay();
  if (dow === 6) return 3; // sábado → lunes 3
  if (dow === 0) return 2; // domingo → lunes 2
  return 1;
}

/**
 * Determina si `hoy` es el día de cobro de la guardería. Como
 * `diaFacturacion` está restringido a 1-28 (check en DB), siempre existe
 * en cualquier mes — no hace falta el clamp con daysInMonth.
 * Si `primerHabil` es true, usa el primer día hábil del mes en lugar del
 * día fijo.
 */
export function esDiaDeCobro(
  diaFacturacion: number,
  hoy: Date = new Date(),
  primerHabil = false,
): boolean {
  const diaObjetivo = primerHabil ? primerDiaHabilDelMes(hoy) : diaFacturacion;
  return hoy.getUTCDate() === diaObjetivo;
}

/**
 * Se asegura de que exista un movimiento mensual para (socio, espacio)
 * en los últimos 27 días. Si ya hay uno, no hace nada. Devuelve el id si
 * se creó, o null si ya existía.
 *
 * La ventana de 27 días cubre tanto el modelo viejo (cobros mensuales el
 * día 1) como el modelo aniversario (ciclos de 28-31 días) sin permitir
 * duplicados.
 */
export async function ensureMonthlyMovimiento(params: {
  socioId: string;
  espacioId: string;
  servicioId: string;
  precio: number;
  concepto: string;
  now?: Date;
}): Promise<string | null> {
  const now = params.now ?? new Date();

  const [existing] = await db
    .select({ id: movimientosCuentaCorriente.id })
    .from(movimientosCuentaCorriente)
    .where(
      and(
        eq(movimientosCuentaCorriente.socioId, params.socioId),
        eq(movimientosCuentaCorriente.espacioId, params.espacioId),
        eq(movimientosCuentaCorriente.tipo, 'mensual'),
        gte(movimientosCuentaCorriente.fecha, hace27Dias(now)),
      ),
    )
    .limit(1);

  if (existing) return null;

  const importe = params.precio.toFixed(2);

  const [row] = await db
    .insert(movimientosCuentaCorriente)
    .values({
      socioId: params.socioId,
      espacioId: params.espacioId,
      servicioId: params.servicioId,
      concepto: params.concepto,
      tipo: 'mensual',
      estado: 'no_pagado',
      debe: importe,
      importeSigned: importe,
      fecha: now,
      proximoPago: nextMonthStart(now),
    })
    .returning({ id: movimientosCuentaCorriente.id });

  return row?.id ?? null;
}

/**
 * Recorre todos los espacios asignados de las guarderías cuyo
 * `diaFacturacion === hoy.getUTCDate()` y crea el movimiento mensual
 * para cada uno. Se ejecuta diariamente desde el cron.
 *
 * Devuelve además el set de guarderías procesadas, así el caller
 * (cron) puede disparar la auto-emisión de facturas sobre esas
 * mismas guarderías sin volver a calcular qué cumplen hoy.
 */
export async function runMonthlyGeneration(now: Date = new Date()): Promise<{
  created: number;
  scanned: number;
  skipped: number;
  guarderiaIds: string[];
}> {
  const diaHoy = now.getUTCDate();
  const todayStr = now.toISOString().slice(0, 10);

  const primerHabilDelMes = primerDiaHabilDelMes(now);

  const rows = await db
    .select({
      espacioId: espacios.id,
      guarderiaId: espacios.guarderiaId,
      ocupanteId: espacios.ocupanteId,
      servicioId: espacios.servicioId,
      servicioNombre: servicios.nombre,
      servicioPrecio: servicios.precio,
      servicioAlicuotaIva: servicios.alicuotaIva,
      diaFacturacion: guarderias.diaFacturacion,
      facturacionPrimerHabil: guarderias.facturacionPrimerHabil,
    })
    .from(espacios)
    .innerJoin(servicios, eq(servicios.id, espacios.servicioId))
    .innerJoin(guarderias, eq(guarderias.id, espacios.guarderiaId))
    .where(
      and(
        isNotNull(espacios.ocupanteId),
        isNotNull(espacios.servicioId),
        // Solo facturar tarifas vigentes en la fecha de cobro
        lte(servicios.vigenciaDesde, todayStr),
        gte(servicios.vigenciaHasta, todayStr),
        // Una tarifa pausada o inactiva no genera cargos nuevos, aunque el
        // espacio siga ocupado con esa tarifa asignada.
        eq(servicios.estado, 'activo'),
        // Solo tarifas Fijas se cobran mensual automático. Las Variables se
        // cobran una sola vez (al asignar el espacio) y no vuelven a
        // generarse solas — hay que cargarlas a mano cada vez.
        eq(servicios.tipoCobro, 'fijo'),
      ),
    );

  // Servicios cancelados por socio: si un (socio, servicio) está en
  // socio_servicios_cancelados, NO se vuelve a generar el cargo mensual aunque
  // el espacio siga asignado. El proporcional hasta la baja ya se cobró al
  // cancelar; de acá en más no se cobra más. Liberar el espacio es aparte.
  const ocupanteIds = [...new Set(rows.map((r) => r.ocupanteId).filter(Boolean) as string[])];
  const servicioIds = [...new Set(rows.map((r) => r.servicioId).filter(Boolean) as string[])];
  const canceladosSet = new Set<string>();
  if (ocupanteIds.length > 0 && servicioIds.length > 0) {
    const cancelados = await db
      .select({
        socioId: socioServiciosCancelados.socioId,
        servicioId: socioServiciosCancelados.servicioId,
      })
      .from(socioServiciosCancelados)
      .where(
        and(
          inArray(socioServiciosCancelados.socioId, ocupanteIds),
          inArray(socioServiciosCancelados.servicioId, servicioIds),
        ),
      );
    for (const c of cancelados) canceladosSet.add(`${c.socioId}:${c.servicioId}`);
  }

  let created = 0;
  let skipped = 0;
  const guarderiasProcesadas = new Set<string>();

  for (const r of rows) {
    if (!r.ocupanteId || !r.servicioId) continue;

    // Servicio cancelado para este socio → no generar el cargo mensual.
    if (canceladosSet.has(`${r.ocupanteId}:${r.servicioId}`)) {
      skipped++;
      continue;
    }

    const usaPrimerHabil = r.facturacionPrimerHabil ?? false;
    const diaObjetivo = usaPrimerHabil ? primerHabilDelMes : (r.diaFacturacion ?? 1);
    if (diaObjetivo !== diaHoy) {
      skipped++;
      continue;
    }

    guarderiasProcesadas.add(r.guarderiaId);

    const precioNeto = r.servicioPrecio != null ? Number(r.servicioPrecio) : 0;
    const alicuotaIva = r.servicioAlicuotaIva != null ? Number(r.servicioAlicuotaIva) : 0;
    const precio = precioConIva(precioNeto, alicuotaIva);
    const res = await ensureMonthlyMovimiento({
      socioId: r.ocupanteId,
      espacioId: r.espacioId,
      servicioId: r.servicioId,
      precio,
      concepto: r.servicioNombre,
      now,
    });
    if (res) created++;
  }

  return {
    created,
    scanned: rows.length,
    skipped,
    guarderiaIds: Array.from(guarderiasProcesadas),
  };
}

/**
 * Se asegura de que exista un movimiento mensual para (socio, servicio) en
 * los últimos 27 días. Análogo a `ensureMonthlyMovimiento` pero sin espacio
 * — para las categorías que no son Espacio de guarda.
 */
async function ensureMonthlyMovimientoServicio(params: {
  socioId: string;
  servicioId: string;
  precio: number;
  concepto: string;
  comprobanteInterno: boolean;
  now?: Date;
}): Promise<string | null> {
  const now = params.now ?? new Date();

  const [existing] = await db
    .select({ id: movimientosCuentaCorriente.id })
    .from(movimientosCuentaCorriente)
    .where(
      and(
        eq(movimientosCuentaCorriente.socioId, params.socioId),
        eq(movimientosCuentaCorriente.servicioId, params.servicioId),
        isNull(movimientosCuentaCorriente.espacioId),
        eq(movimientosCuentaCorriente.tipo, 'mensual'),
        gte(movimientosCuentaCorriente.fecha, hace27Dias(now)),
      ),
    )
    .limit(1);

  if (existing) return null;

  const importe = params.precio.toFixed(2);

  const [row] = await db
    .insert(movimientosCuentaCorriente)
    .values({
      socioId: params.socioId,
      servicioId: params.servicioId,
      concepto: params.concepto,
      tipo: 'mensual',
      estado: 'no_pagado',
      debe: importe,
      importeSigned: importe,
      fecha: now,
      proximoPago: nextMonthStart(now),
      comprobanteInterno: params.comprobanteInterno,
    })
    .returning({ id: movimientosCuentaCorriente.id });

  return row?.id ?? null;
}

/**
 * Análoga a `ensureMonthlyMovimientoServicio` pero para tarifas Variable:
 * el cargo es único POR CONTRATO — si ya existe un movimiento del (socio,
 * servicio) creado después de `contratadoEn` (la fecha de alta del contrato),
 * no se vuelve a cobrar. Un contrato nuevo del mismo servicio (re-contratar
 * un lavado, por ejemplo) sí genera su propio cargo, porque los movimientos
 * anteriores son previos a su alta.
 */
async function ensureOnceMovimientoServicio(params: {
  socioId: string;
  servicioId: string;
  precio: number;
  concepto: string;
  comprobanteInterno: boolean;
  contratadoEn: Date;
  now?: Date;
}): Promise<string | null> {
  const now = params.now ?? new Date();

  const [existing] = await db
    .select({ id: movimientosCuentaCorriente.id })
    .from(movimientosCuentaCorriente)
    .where(
      and(
        eq(movimientosCuentaCorriente.socioId, params.socioId),
        eq(movimientosCuentaCorriente.servicioId, params.servicioId),
        isNull(movimientosCuentaCorriente.espacioId),
        gte(movimientosCuentaCorriente.fecha, params.contratadoEn),
      ),
    )
    .limit(1);

  if (existing) return null;

  const importe = params.precio.toFixed(2);

  const [row] = await db
    .insert(movimientosCuentaCorriente)
    .values({
      socioId: params.socioId,
      servicioId: params.servicioId,
      concepto: params.concepto,
      tipo: 'otro',
      estado: 'no_pagado',
      debe: importe,
      importeSigned: importe,
      fecha: now,
      comprobanteInterno: params.comprobanteInterno,
    })
    .returning({ id: movimientosCuentaCorriente.id });

  return row?.id ?? null;
}

/**
 * Recorre los contratos vigentes en `socio_servicios` sin espacio asociado
 * (vienen de "Cargar Servicio", sea cual sea la categoría de la tarifa) y
 * genera el cargo correspondiente, salvo que el socio lo haya cancelado
 * (Servicios Contratados).
 *
 * La categoría de la tarifa no importa acá — lo que decide si un contrato lo
 * cobra esta función o `runMonthlyGeneration` es si está atado a un espacio
 * (`socio_servicios.espacio_id`) o no. Un contrato de una tarifa "Espacio de
 * guarda" cargado a mano con "Cargar Servicio" (sin pasar por "Asignar
 * espacio") también recurre por acá.
 *
 * Fijo: se cobra el día de facturación de la guardería, todos los meses,
 * mientras el contrato siga vigente (`ensureMonthlyMovimientoServicio`).
 * Variable: se cobra una única vez, en la primera corrida del cron desde
 * que el contrato está vigente — no espera al día de facturación, porque es
 * un cargo puntual, no un ciclo mensual (`ensureOnceMovimientoServicio`).
 *
 * Se ejecuta diariamente desde el cron, junto con `runMonthlyGeneration`.
 */
export async function runMonthlyGeneracionServiciosRecurrentes(
  now: Date = new Date(),
): Promise<{ created: number; scanned: number; skipped: number }> {
  const diaHoy = now.getUTCDate();
  const todayStr = now.toISOString().slice(0, 10);
  const primerHabilDelMes = primerDiaHabilDelMes(now);

  const contratos = await db
    .select({
      contratoId: socioServicios.id,
      fechaAsignacion: socioServicios.fechaAsignacion,
      fechaBaja: socioServicios.fechaBaja,
      socioId: socioServicios.socioId,
      servicioId: socioServicios.servicioId,
      concepto: socioServicios.concepto,
      comprobanteInterno: socioServicios.comprobanteInterno,
      servicioNombre: servicios.nombre,
      servicioPrecio: servicios.precio,
      servicioAlicuotaIva: servicios.alicuotaIva,
      tipoCobro: servicios.tipoCobro,
      tarifaVariable: servicios.tarifaVariable,
      cantidadDias: socioServicios.cantidadDias,
      diaFacturacion: guarderias.diaFacturacion,
      facturacionPrimerHabil: guarderias.facturacionPrimerHabil,
    })
    .from(socioServicios)
    .innerJoin(servicios, eq(servicios.id, socioServicios.servicioId))
    .innerJoin(guarderias, eq(guarderias.id, servicios.guarderiaId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, socioServicios.socioId),
        eq(memberships.guarderiaId, servicios.guarderiaId),
        eq(memberships.rol, 'socio'),
        eq(memberships.status, 'active'),
      ),
    )
    .where(
      and(
        // Solo contratos sin espacio asociado — los que sí lo tienen los
        // cobra runMonthlyGeneration (a partir de la tabla `espacios`).
        isNull(socioServicios.espacioId),
        lte(socioServicios.fechaInicio, todayStr),
        or(isNull(socioServicios.fechaBaja), gte(socioServicios.fechaBaja, todayStr)),
        eq(servicios.estado, 'activo'),
        lte(servicios.vigenciaDesde, todayStr),
        gte(servicios.vigenciaHasta, todayStr),
      ),
    );

  const socioIds = [...new Set(contratos.map((c) => c.socioId))];
  const servicioIdsSet = [...new Set(contratos.map((c) => c.servicioId))];
  const canceladosSet = new Set<string>();
  if (socioIds.length > 0 && servicioIdsSet.length > 0) {
    const cancelados = await db
      .select({
        socioId: socioServiciosCancelados.socioId,
        servicioId: socioServiciosCancelados.servicioId,
      })
      .from(socioServiciosCancelados)
      .where(
        and(
          inArray(socioServiciosCancelados.socioId, socioIds),
          inArray(socioServiciosCancelados.servicioId, servicioIdsSet),
        ),
      );
    for (const c of cancelados) canceladosSet.add(`${c.socioId}:${c.servicioId}`);
  }

  let created = 0;
  let skipped = 0;

  for (const c of contratos) {
    if (canceladosSet.has(`${c.socioId}:${c.servicioId}`)) {
      skipped++;
      continue;
    }

    const precioNeto = c.servicioPrecio != null ? Number(c.servicioPrecio) : 0;
    const alicuotaIva = c.servicioAlicuotaIva != null ? Number(c.servicioAlicuotaIva) : 0;
    // Contratos Interno no pasan por ARCA: se cobra el precio base del
    // tarifario tal cual, sin sumarle IVA. Solo los fiscales suman IVA.
    const precio = c.comprobanteInterno ? precioNeto : precioConIva(precioNeto, alicuotaIva);
    const concepto = c.concepto ?? c.servicioNombre;

    if (c.tipoCobro === 'variable') {
      // Tarifa Variable diaria: el precio del tarifario es por día y el
      // contrato guarda cuántos días se contrataron — el cargo único es
      // (precio neto × días), con IVA solo si es fiscal. Sin días (tarifa
      // mensual o contratos viejos), se cobra el precio tal cual, como siempre.
      const dias = c.tarifaVariable === 'diaria' ? c.cantidadDias : null;
      const res = await ensureOnceMovimientoServicio({
        socioId: c.socioId,
        servicioId: c.servicioId,
        precio:
          dias != null
            ? c.comprobanteInterno
              ? precioNeto * dias
              : precioConIva(precioNeto * dias, alicuotaIva)
            : precio,
        concepto: dias != null ? `${concepto} (${dias} ${dias === 1 ? 'día' : 'días'})` : concepto,
        comprobanteInterno: c.comprobanteInterno,
        contratadoEn: c.fechaAsignacion,
        now,
      });
      // Variable se factura UNA sola vez y el contrato se cierra al cobrarlo:
      // pasa a No vigente al instante y el socio puede volver a contratar el
      // mismo servicio (3 lavados en el mes = 3 contratos). También cierra
      // contratos viejos que ya se cobraron y quedaron abiertos (res null con
      // movimiento previo) — se marcan de baja sin generar cargo nuevo.
      if (c.fechaBaja !== todayStr) {
        await db
          .update(socioServicios)
          .set({ fechaBaja: todayStr })
          .where(eq(socioServicios.id, c.contratoId));
      }
      if (res) created++;
      else skipped++;
      continue;
    }

    const usaPrimerHabil = c.facturacionPrimerHabil ?? false;
    const diaObjetivo = usaPrimerHabil ? primerHabilDelMes : (c.diaFacturacion ?? 1);
    if (diaObjetivo !== diaHoy) {
      skipped++;
      continue;
    }

    const res = await ensureMonthlyMovimientoServicio({
      socioId: c.socioId,
      servicioId: c.servicioId,
      precio,
      concepto,
      comprobanteInterno: c.comprobanteInterno,
      now,
    });
    if (res) created++;
  }

  return { created, scanned: contratos.length, skipped };
}

/**
 * Devuelve los ids de TODAS las guarderías cuyo día de facturación es hoy,
 * independientemente de si tienen espacios ocupados. El día de cobro es una
 * propiedad de la guardería (no de los espacios), así que la auto-emisión y
 * los cobros deben correr sobre este set — no solo sobre las que generaron
 * un movimiento de espacio. Así un socio con consumos pendientes pero sin
 * espacio asignado igual se factura/cobra.
 */
export async function guarderiasQueFacturanHoy(now: Date = new Date()): Promise<string[]> {
  const rows = await db
    .select({
      id: guarderias.id,
      diaFacturacion: guarderias.diaFacturacion,
      facturacionPrimerHabil: guarderias.facturacionPrimerHabil,
    })
    .from(guarderias);

  return rows
    .filter((g) => esDiaDeCobro(g.diaFacturacion ?? 1, now, g.facturacionPrimerHabil ?? false))
    .map((g) => g.id);
}
