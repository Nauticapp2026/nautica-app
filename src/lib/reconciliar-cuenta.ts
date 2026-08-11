/**
 * Reconciliación FIFO de la cuenta corriente de un socio.
 *
 * Persiste lo que el display ya calcula (`calcularSaldoYEstado` en socio-detail):
 * los pagos (haber) cubren los cargos del más viejo al más nuevo, y un cargo
 * cubierto pasa a `pagado`. Sin esto, un pago "neto" (Payway, débito automático)
 * deja el cargo en `no_pagado` y la auto-emisión lo vuelve a facturar → deuda
 * fantasma (cargos ya cobrados re-facturados como pendientes).
 *
 * Se llama después de registrar un haber neto que no mapea 1:1 a cargos
 * puntuales (hoy: cobro Payway aprobado).
 *
 * Criterio (idéntico al display):
 *  - El pool de haberes se consume sobre TODOS los cargos con debe>0, del más
 *    viejo al más nuevo, salvo los ya `pagado`.
 *  - Solo se PERSISTE el cambio (`no_pagado` → `pagado`) en cargos no_pagado y
 *    sin comprobante interno. Los `facturado` se dejan como están (su cobro se
 *    refleja por la factura) y los de comprobante interno se saldan vía Cobranza
 *    (que mantiene cargo + recibo en sync). Igual se consume el pool por ellos
 *    para respetar el orden FIFO.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  movimientosCuentaCorriente,
} from '@/lib/db/schema';
import {
  calcularCoberturaTargeted,
  calcularCoberturaTargetedBatch,
} from '@/lib/cobranza-cobertura';

/**
 * Read-only. Devuelve el conjunto de ids de cargos (movimientos con debe>0) que
 * están saldados para el socio: los ya `pagado`, más los cubiertos por el pool
 * de haberes vía FIFO (del más viejo al más nuevo). Mismo criterio exacto que
 * `calcularSaldoYEstado` en el display de Cuenta Corriente.
 *
 * Incluye cargos en cualquier estado (no_pagado, facturado, pagado) que el pool
 * cubre — por eso sirve tanto para decidir qué NO facturar (auto-emisión) como
 * para detectar qué comprobantes quedaron 100% saldados.
 */
export async function getCargosSaldadosFifo(socioId: string): Promise<Set<string>> {
  return (await getEstadoFifo(socioId)).saldados;
}

/**
 * Igual que getCargosSaldadosFifo pero además devuelve el pool de haberes que
 * sobra después de la pasada FIFO (`poolRestante`): crédito ya pagado por el
 * socio que cubre PARCIALMENTE el cargo no saldado más viejo. El débito
 * automático lo necesita para descontarlo del cobro y no cobrar de más.
 * Invariante: poolRestante < debe del primer cargo no saldado (si alcanzara,
 * ese cargo estaría en `saldados`).
 *
 * `coberturaParcial`: cobertura targeted (NC de su factura o pago parcial de
 * Cobranzas) que cubre un cargo SOLO en parte (el cargo no llega a `saldados`,
 * pero ese monto ya está acreditado y no debe volver a cobrarse).
 *
 * `opts.excluirAdelantos`: ver `calcularPoolRestante`. Default false (el
 * débito automático y la auto-facturación llaman sin esto — su
 * comportamiento no cambia).
 */
export async function getEstadoFifo(
  socioId: string,
  opts?: { excluirAdelantos?: boolean },
): Promise<{
  saldados: Set<string>;
  poolRestante: number;
  coberturaParcial: Map<string, number>;
}> {
  const cobertura = await calcularCoberturaTargeted(socioId);
  const movs = await getMovimientosOrdenados(socioId);
  return calcularPoolRestante(movs, cobertura, { excluirAdelantos: opts?.excluirAdelantos });
}

/**
 * Saldo a favor disponible (`poolRestante`) de varios socios, con las mismas
 * queries. Es la versión batcheada de `getEstadoFifo` para el listado de socios:
 * el criterio es idéntico (comparten `calcularPoolRestante`), pero resolver
 * cientos de socios de a uno serían cientos de tandas de queries.
 */
export async function getPoolRestanteBatch(
  socioIds: string[],
  opts?: { excluirAdelantos?: boolean },
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (socioIds.length === 0) return out;

  const [coberturaPorSocio, movs] = await Promise.all([
    calcularCoberturaTargetedBatch(socioIds),
    db
      .select({
        socioId: movimientosCuentaCorriente.socioId,
        id: movimientosCuentaCorriente.id,
        tipo: movimientosCuentaCorriente.tipo,
        debe: movimientosCuentaCorriente.debe,
        haber: movimientosCuentaCorriente.haber,
        estado: movimientosCuentaCorriente.estado,
        esAdelanto: movimientosCuentaCorriente.esAdelanto,
      })
      .from(movimientosCuentaCorriente)
      .where(inArray(movimientosCuentaCorriente.socioId, socioIds))
      .orderBy(asc(movimientosCuentaCorriente.fecha), asc(movimientosCuentaCorriente.createdAt)),
  ]);

  // Agrupar preservando el orden cronológico que trajo el query.
  const movsPorSocio = new Map<string, MovimientoFifo[]>();
  for (const id of socioIds) movsPorSocio.set(id, []);
  for (const m of movs) {
    if (!m.socioId) continue;
    movsPorSocio.get(m.socioId)?.push(m);
  }

  for (const socioId of socioIds) {
    const cobertura = coberturaPorSocio.get(socioId);
    if (!cobertura) {
      out.set(socioId, 0);
      continue;
    }
    const { poolRestante } = calcularPoolRestante(movsPorSocio.get(socioId) ?? [], cobertura, {
      excluirAdelantos: opts?.excluirAdelantos,
    });
    out.set(socioId, poolRestante);
  }

  return out;
}

/** Movimiento tal como lo necesita el recorrido FIFO, en orden cronológico. */
type MovimientoFifo = {
  id: string;
  tipo: string | null;
  debe: string | null;
  haber: string | null;
  estado: string | null;
  concepto?: string | null;
  fecha?: Date | null;
  esAdelanto?: boolean | null;
};

/** Cobertura targeted que consume el recorrido FIFO. */
type CoberturaFifo = {
  montoPorMovimiento: Map<string, number>;
  montoNcPorMovimiento: Map<string, number>;
  montoReciboPorMovimiento: Map<string, number>;
  movimientosDeNc: Set<string>;
  haberComprometido: Map<string, number>;
};

async function getMovimientosOrdenados(socioId: string): Promise<MovimientoFifo[]> {
  return db
    .select({
      id: movimientosCuentaCorriente.id,
      tipo: movimientosCuentaCorriente.tipo,
      debe: movimientosCuentaCorriente.debe,
      haber: movimientosCuentaCorriente.haber,
      estado: movimientosCuentaCorriente.estado,
      concepto: movimientosCuentaCorriente.concepto,
      fecha: movimientosCuentaCorriente.fecha,
      esAdelanto: movimientosCuentaCorriente.esAdelanto,
    })
    .from(movimientosCuentaCorriente)
    .where(eq(movimientosCuentaCorriente.socioId, socioId))
    .orderBy(asc(movimientosCuentaCorriente.fecha), asc(movimientosCuentaCorriente.createdAt));
}

/**
 * Recorrido FIFO puro (sin queries) sobre los movimientos de UN socio en orden
 * cronológico. Es la única implementación del pool genérico: la usan
 * `getEstadoFifo` (un socio), `getPoolRestanteBatch` (el listado) y
 * `getLedgerSaldoAFavor` (el historial), así que cualquier corrección de
 * criterio se aplica una sola vez y las tres vistas no pueden divergir.
 *
 * `onPoolChange` se llama cada vez que el pool sube (excedente de un haber que
 * queda a favor) o baja (crédito consumido por un cargo) — es lo que el
 * historial narra fila por fila.
 */
export function calcularPoolRestante(
  movs: MovimientoFifo[],
  cobertura: CoberturaFifo,
  opts?: {
    // Un adelanto sin comprobante (Cobranzas -> "Continuar sin comprobantes")
    // suma como crédito disponible pero NO se usa para saldar otro cargo
    // solo — el club (o el débito automático, que llama sin esto) tiene que
    // aplicarlo a propósito. Pedido cliente 2026-08-11. Default false: el
    // débito automático y la auto-facturación no cambian su comportamiento.
    excluirAdelantos?: boolean;
    onPoolChange?: (evento: {
      mov: MovimientoFifo;
      delta: number;
      motivo: 'excedente' | 'consumo';
      poolResultante: number;
    }) => void;
  },
): { saldados: Set<string>; poolRestante: number; coberturaParcial: Map<string, number> } {
  const { montoPorMovimiento, movimientosDeNc } = cobertura;
  const excluirAdelantos = opts?.excluirAdelantos ?? false;
  const onPoolChange = opts?.onPoolChange;

  const saldados = new Set<string>();
  const debeById = new Map(movs.map((m) => [m.id, parseFloat(m.debe ?? '0')]));
  for (const [movId, monto] of montoPorMovimiento) {
    const debe = debeById.get(movId);
    if (debe != null && monto >= debe - 0.001) saldados.add(movId);
  }

  // Cobertura targeted que quedó parcial (no alcanzó para saldar el cargo entero).
  const coberturaParcial = new Map<string, number>();
  for (const [movId, monto] of montoPorMovimiento) {
    if (!saldados.has(movId)) coberturaParcial.set(movId, monto);
  }

  // Pool genérico: excluye los movimientos que son el asiento de una NC ya
  // aplicada puntualmente arriba, y de los pagos de Cobranza targeted solo
  // suma el excedente no aplicado (haber − comprometido: adelanto / saldo a
  // favor). Los contraasientos de anulación de recibo (debe) restan del pool:
  // anulan exactamente el haber del pago anulado, que sigue sumando — el neto
  // del par es cero y esa plata no cubre ningún cargo.
  //
  // Partido en dos baldes para poder excluir uno de la pasada de consumo sin
  // duplicar todo el recorrido: `poolNormal` (excedente de un cobro real) y
  // `poolAdelanto` (adelantos sin comprobante). Sin excluirAdelantos se
  // tratan como uno solo (se suman en cada chequeo) — mismo resultado que la
  // versión vieja de un solo pool.
  //
  // El aporte de cada movimiento se calcula fila por fila (y no con un reduce
  // previo) para que el historial pueda narrar en qué momento entró cada peso.
  let poolNormal = 0;
  let poolAdelanto = 0;
  const aporteAlPool = (m: MovimientoFifo): number =>
    movimientosDeNc.has(m.id)
      ? 0
      : parseFloat(m.haber ?? '0') -
        (cobertura.haberComprometido.get(m.id) ?? 0) -
        (m.tipo === 'anulacion_recibo' ? parseFloat(m.debe ?? '0') : 0);

  for (const m of movs) {
    const aporte = aporteAlPool(m);
    if (Math.abs(aporte) > 0.001) {
      if (m.esAdelanto) poolAdelanto += aporte;
      else poolNormal += aporte;
      onPoolChange?.({
        mov: m,
        delta: aporte,
        motivo: 'excedente',
        poolResultante: poolNormal + poolAdelanto,
      });
    }
  }

  // Consume `poolNormal` primero; si no alcanza, sigue con `poolAdelanto`.
  // Se usa tanto para un cargo YA pagado (hecho consumado, no depende del
  // flag) como, si no se excluyen adelantos, para saldar uno nuevo.
  function consumir(monto: number): void {
    const deNormal = Math.min(poolNormal, monto);
    poolNormal -= deNormal;
    poolAdelanto -= monto - deNormal;
  }

  // Segunda pasada: los cargos consumen el pool del más viejo al más nuevo.
  for (const m of movs) {
    if (saldados.has(m.id)) continue;
    // El contraasiento no es un cargo cobrable: ya se descontó del pool.
    if (m.tipo === 'anulacion_recibo') continue;
    const debe = parseFloat(m.debe ?? '0');
    if (debe <= 0) continue;
    if (m.estado === 'pagado') {
      // Ya pagado: consume su parte del pool (su haber está comprometido), para
      // no inflar la cobertura de otros cargos. Igual que calcularSaldoYEstado.
      // Lo que ya cubrió una NC de su propia factura o un recibo targeted no
      // está en el pool (es crédito puntual, no genérico): solo se descuenta el
      // resto. Sin descontar la NC, una nota emitida sobre un cargo ya cobrado
      // desaparecía del saldo a favor disponible.
      saldados.add(m.id);
      const consumo = Math.max(0, debe - (montoPorMovimiento.get(m.id) ?? 0));
      if (consumo > 0.001) {
        consumir(consumo);
        onPoolChange?.({
          mov: m,
          delta: -consumo,
          motivo: 'consumo',
          poolResultante: poolNormal + poolAdelanto,
        });
      }
      continue;
    }
    // La cobertura targeted parcial ya acreditó una parte: el pool solo tiene
    // que cubrir el resto.
    const resto = debe - (coberturaParcial.get(m.id) ?? 0);
    const disponible = excluirAdelantos ? poolNormal : poolNormal + poolAdelanto;
    if (disponible >= resto - 0.001) {
      consumir(resto);
      saldados.add(m.id);
      if (resto > 0.001) {
        onPoolChange?.({
          mov: m,
          delta: -resto,
          motivo: 'consumo',
          poolResultante: poolNormal + poolAdelanto,
        });
      }
    }
  }

  return { saldados, poolRestante: Math.max(0, poolNormal + poolAdelanto), coberturaParcial };
}

/** Un movimiento del saldo a favor: de dónde salió el crédito y en qué se usó. */
export type LedgerSaldoAFavor = {
  movimientoId: string;
  fecha: string | null;
  concepto: string;
  tipo: 'generado' | 'usado';
  monto: number;
  /** Saldo a favor acumulado después de este evento. */
  saldoResultante: number;
};

/**
 * Historial del saldo a favor de un socio: una fila por cada evento que sube o
 * baja el crédito disponible, con el saldo corriendo. Contesta "de dónde salió
 * este saldo y en qué se usó", que el número agregado solo no responde.
 *
 * Comparte el recorrido con `getEstadoFifo` (vía `calcularPoolRestante`), así que
 * narra exactamente los mismos movimientos de crédito que producen el disponible
 * que ofrece Cobranzas. Las entradas se ordenan por fecha y el saldo se re-acumula
 * en ese orden: el recorrido interno resuelve primero todos los créditos y después
 * los consumos, y esa secuencia no es la que el club espera leer.
 *
 * `saldoResultante` es la suma corrida cruda (cada fila = la anterior ± el monto),
 * que es lo que hace auditable un ledger. Puede quedar por debajo del disponible
 * que informa `getEstadoFifo`, que lo acota a 0: un cargo ya `pagado` consume su
 * parte del pool sin tope, así que la corrida puede pasar a negativo. Para "cuánto
 * hay hoy" manda `poolRestante`, no la última fila.
 */
export async function getLedgerSaldoAFavor(socioId: string): Promise<LedgerSaldoAFavor[]> {
  const cobertura = await calcularCoberturaTargeted(socioId);
  const movs = await getMovimientosOrdenados(socioId);

  const eventos: Omit<LedgerSaldoAFavor, 'saldoResultante'>[] = [];
  // excluirAdelantos: true — mismo criterio que el disponible que muestra la
  // ficha y que ofrece Cobranzas (ver calcularPoolRestante); si no, el
  // historial narraría un adelanto "consumido" por un cargo viejo que el
  // club nunca eligió pagar con eso.
  calcularPoolRestante(movs, cobertura, {
    excluirAdelantos: true,
    onPoolChange: ({ mov, delta, motivo }) => {
      const generado = delta > 0;
      eventos.push({
        movimientoId: mov.id,
        fecha: mov.fecha?.toISOString() ?? null,
        concepto: describirEvento(mov, motivo, generado),
        tipo: generado ? 'generado' : 'usado',
        monto: Math.abs(delta),
      });
    },
  });

  eventos.sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''));

  let saldo = 0;
  return eventos.map((e) => {
    saldo += e.tipo === 'generado' ? e.monto : -e.monto;
    return { ...e, saldoResultante: saldo };
  });
}

function describirEvento(
  mov: MovimientoFifo,
  motivo: 'excedente' | 'consumo',
  generado: boolean,
): string {
  const concepto = mov.concepto?.trim();
  if (motivo === 'consumo') {
    return concepto ? `Aplicado a ${concepto}` : 'Aplicado a un cargo';
  }
  if (!generado) {
    // Aporte negativo al pool: el contraasiento de un recibo anulado devuelve
    // la plata que ese pago había dejado a favor.
    return concepto ? `Anulación de ${concepto}` : 'Anulación de un pago';
  }
  return concepto ?? 'Pago a cuenta';
}

export async function reconciliarCuentaSocio(socioId: string): Promise<string[]> {
  const { montoPorMovimiento, movimientosDeNc, haberComprometido } =
    await calcularCoberturaTargeted(socioId);

  const movs = await db
    .select({
      id: movimientosCuentaCorriente.id,
      tipo: movimientosCuentaCorriente.tipo,
      debe: movimientosCuentaCorriente.debe,
      haber: movimientosCuentaCorriente.haber,
      estado: movimientosCuentaCorriente.estado,
      comprobanteInterno: movimientosCuentaCorriente.comprobanteInterno,
    })
    .from(movimientosCuentaCorriente)
    .where(eq(movimientosCuentaCorriente.socioId, socioId))
    .orderBy(asc(movimientosCuentaCorriente.fecha), asc(movimientosCuentaCorriente.createdAt));

  // Excluye los asientos de NC ya aplicadas puntualmente a su propia factura,
  // y de los pagos de Cobranza targeted suma solo el excedente no aplicado —
  // esta función solo reconcilia pagos genéricos (ej. Payway), no créditos
  // ya targeteados. Los contraasientos de anulación restan del pool (anulan
  // el haber del pago anulado, ver getEstadoFifo).
  let pool = movs
    .filter((m) => !movimientosDeNc.has(m.id))
    .reduce(
      (acc, m) =>
        acc +
        parseFloat(m.haber ?? '0') -
        (haberComprometido.get(m.id) ?? 0) -
        (m.tipo === 'anulacion_recibo' ? parseFloat(m.debe ?? '0') : 0),
      0,
    );
  const toMark: string[] = [];

  for (const m of movs) {
    if (m.tipo === 'anulacion_recibo') continue;
    const debe = parseFloat(m.debe ?? '0');
    if (debe <= 0) continue;
    if (m.estado === 'pagado') {
      // Ya pagado: consume su parte del pool (su haber está comprometido), para
      // no inflar la cobertura de otros cargos. Igual que calcularPoolRestante.
      // Lo aplicado por una NC de su factura o un recibo targeted no está en el
      // pool: solo el resto.
      pool -= Math.max(0, debe - (montoPorMovimiento.get(m.id) ?? 0));
      continue;
    }
    const cubierto = montoPorMovimiento.get(m.id) ?? 0;
    const resto = debe - cubierto;
    // Cubierto entero por cobertura targeted: no consume pool y no se marca
    // acá (los flujos targeted ya marcan lo suyo al registrarse).
    if (resto <= 0.001) continue;
    if (pool >= resto - 0.001) {
      pool -= resto;
      if (m.estado === 'no_pagado' && !m.comprobanteInterno) toMark.push(m.id);
    }
  }

  if (toMark.length > 0) {
    await db
      .update(movimientosCuentaCorriente)
      .set({ estado: 'pagado' })
      .where(inArray(movimientosCuentaCorriente.id, toMark));
  }

  return toMark;
}

// Tipos de comprobante fiscal que se marcan pagados al quedar cubiertos. Solo
// fiscales: los recibos internos (RB-) tienen su ciclo propio vía Cobranza.
// Las ND entran: son deuda a cobrar igual que una factura (su cargo se linkea
// directo vía facturacion.movimientoId).
const TIPOS_FISCALES = [
  'factura_a',
  'factura_b',
  'factura_c',
  'nota_debito_a',
  'nota_debito_b',
  'nota_debito_c',
] as const;

/**
 * Marca como `pagada` toda factura fiscal `pendiente`/`vencida` del socio cuyos
 * cargos vinculados quedaron TODOS saldados por los pagos (FIFO), y propaga
 * `pagado` a esos cargos. Mismo criterio que el Registro de Cobranza, pero para
 * pagos netos (Payway): sin esto, una factura cobrada por débito automático
 * sigue figurando "pendiente" en el listado de comprobantes aunque ya esté
 * cobrada. Devuelve los ids de las facturas marcadas.
 *
 * `incluirInternos`: además de los fiscales, marca los comprobantes internos
 * (tipo 'recibo') cubiertos. Solo lo usa el débito automático de canal interno
 * — en el resto de los flujos los internos se saldan vía Cobranza.
 *
 * Read-side seguro: solo toca facturas 100% cubiertas; nunca marca una factura
 * cubierta a medias (no se puede "pagar media factura").
 */
export async function marcarComprobantesSaldados(
  socioId: string,
  guarderiaId: string,
  incluirInternos = false,
): Promise<string[]> {
  const saldados = await getCargosSaldadosFifo(socioId);

  const tipos: ((typeof TIPOS_FISCALES)[number] | 'recibo')[] = [...TIPOS_FISCALES];
  if (incluirInternos) tipos.push('recibo');
  const facs = await db
    .select({
      id: facturacion.id,
      movimientoId: facturacion.movimientoId,
    })
    .from(facturacion)
    .where(
      and(
        eq(facturacion.guarderiaId, guarderiaId),
        eq(facturacion.socioId, socioId),
        inArray(facturacion.estado, ['pendiente', 'vencida']),
        inArray(facturacion.tipoFactura, tipos),
      ),
    );
  if (facs.length === 0) return [];

  // Mapear cada factura a sus cargos: link directo (movimientoId) + M:N (items).
  const facIds = facs.map((f) => f.id);
  const items = await db
    .select({ id: facturacionItems.id, facturacionId: facturacionItems.facturacionId })
    .from(facturacionItems)
    .where(inArray(facturacionItems.facturacionId, facIds));
  const itemToFac = new Map(items.map((i) => [i.id, i.facturacionId]));
  const links = items.length
    ? await db
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
        )
    : [];

  const cargosPorFac = new Map<string, Set<string>>();
  for (const f of facs) {
    const s = new Set<string>();
    if (f.movimientoId) s.add(f.movimientoId);
    cargosPorFac.set(f.id, s);
  }
  for (const l of links) {
    const facId = itemToFac.get(l.facturacionItemId);
    if (facId) cargosPorFac.get(facId)?.add(l.movimientoId);
  }

  // Factura saldada = tiene cargos vinculados y TODOS están cubiertos. Si no
  // tiene cargos vinculados no podemos inferir cobertura → se deja como está.
  const facsToMark: string[] = [];
  const movsToMark = new Set<string>();
  for (const f of facs) {
    const cargos = cargosPorFac.get(f.id);
    if (!cargos || cargos.size === 0) continue;
    let all = true;
    for (const c of cargos) {
      if (!saldados.has(c)) {
        all = false;
        break;
      }
    }
    if (all) {
      facsToMark.push(f.id);
      for (const c of cargos) movsToMark.add(c);
    }
  }

  if (facsToMark.length > 0) {
    await db
      .update(facturacion)
      .set({ estado: 'pagada', updatedAt: new Date() })
      .where(inArray(facturacion.id, facsToMark));
    if (movsToMark.size > 0) {
      await db
        .update(movimientosCuentaCorriente)
        .set({ estado: 'pagado' })
        .where(inArray(movimientosCuentaCorriente.id, [...movsToMark]));
    }
  }

  return facsToMark;
}
