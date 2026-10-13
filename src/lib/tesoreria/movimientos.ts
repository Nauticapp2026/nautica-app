/**
 * Tesorería: el libro de caja del club, por instrumento.
 *
 * Junta dos fuentes en una sola línea de tiempo:
 *  - Recibos de cobranza (facturacion RC-/RI-): cada forma de pago del recibo
 *    es un INGRESO en su instrumento (un recibo de $100 cobrado $60 en
 *    efectivo y $40 por transferencia son dos líneas). Si el recibo se anuló,
 *    además aparece un EGRESO por cada forma en la fecha de la anulación — el
 *    ingreso original no se borra, igual que en el modelo Excel del cliente
 *    ("R8" y después "Anulación R8").
 *  - Movimientos manuales (tesoreria_movimientos): retiros, gastos, depósitos,
 *    ingresos que no son cobranzas.
 *
 * El saldo inicial de un período es la suma de TODO lo anterior a `desde`,
 * desde el primer movimiento del club: no hay "apertura de caja" cargada a
 * mano, el saldo final de un día es el inicial del siguiente (así lo pide el
 * modelo Excel). Se cargan todas las líneas del club y se parte en memoria:
 * son cientos o pocos miles de filas, no vale la pena una query por tramo.
 */

import { and, asc, eq, like, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  movimientosCuentaCorriente,
  profiles,
  tesoreriaMovimientos,
} from '@/lib/db/schema';
import { PATRONES_RECIBO_COBRANZA } from '@/lib/recibo-codigos';
import { codigoMovimiento } from './codigos';
import { numeroDecimal } from './datos-instrumento';
import { argYmd } from '@/lib/dates';
import {
  INSTRUMENTOS,
  instrumentoDesde,
  type Instrumento,
  type TipoMovimientoTesoreria,
} from './instrumentos';

export type LineaTesoreria = {
  /** Único en la lista: `rc-{reciboId}-{n}`, `an-{reciboId}-{n}` o `tm-{id}`. */
  id: string;
  origen: 'recibo' | 'anulacion' | 'manual';
  /** Día calendario argentino, YYYY-MM-DD. */
  fecha: string;
  /** Marca de tiempo ISO para ordenar dentro del día. */
  orden: string;
  /** "RC-00012" para recibos, "12" para manuales. */
  numero: string;
  detalle: string;
  instrumento: Instrumento;
  tipo: TipoMovimientoTesoreria;
  /** Siempre positivo; el signo lo da `tipo`. */
  monto: number;
  /** Para el link al recibo (/ventas/recibo/{id}). */
  reciboId: string | null;
  rubro: string | null;
  subrubro: string | null;
  observaciones: string | null;
  adjuntoPath: string | null;
  adjuntoNombre: string | null;
  /** Datos adicionales del instrumento (solo manuales): banco, nº operación, etc. */
  datos: Record<string, string> | null;
  /** Solo "Efectivo (dólares)": el monto en USD (el `monto` es siempre en pesos). */
  montoUsd: number | null;
  /** Id de `tesoreria_movimientos` (solo manuales): para editar y anular. */
  movimientoId: string | null;
  /** Manual anulado: se lista tachado y no suma en los saldos. */
  anulado: boolean;
  anuladoAt: string | null;
  /** Saldo acumulado (instrumentos elegidos) después de esta línea. */
  saldo: number;
};

export type SaldosUsd = {
  saldoInicial: number;
  ingresos: number;
  egresos: number;
  saldoFinal: number;
};

export type ResumenInstrumento = {
  instrumento: Instrumento | 'consolidado';
  saldoInicial: number;
  ingresos: number;
  egresos: number;
  saldoFinal: number;
  /**
   * Solo para "Efectivo (dólares)": los mismos saldos pero en USD, sumando el
   * monto en dólares de cada movimiento (pedido del cliente 2026-10-13: "el
   * cierre de caja me deberá mostrar saldo en dólares"). El resto va en null.
   */
  usd: SaldosUsd | null;
};

export type FiltrosTesoreria = {
  /** YYYY-MM-DD o null = desde el primer movimiento. */
  desde: string | null;
  /** YYYY-MM-DD o null = hasta hoy inclusive (sin tope). */
  hasta: string | null;
  instrumentos: Instrumento[];
};

export type ResultadoTesoreria = {
  lineas: LineaTesoreria[];
  /** Un resumen por instrumento elegido, en el orden de INSTRUMENTOS. */
  resumen: ResumenInstrumento[];
  consolidado: ResumenInstrumento;
};

export type LineaBase = Omit<LineaTesoreria, 'saldo'>;

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

function nombreSocio(p: {
  razonSocial: string | null;
  nombre: string | null;
  apellido: string | null;
}): string {
  const razon = p.razonSocial?.trim();
  if (razon) return razon;
  const nombre = [p.apellido, p.nombre].filter(Boolean).join(', ').trim();
  return nombre || 'Socio';
}

/**
 * Todas las líneas del club (sin filtrar), ordenadas por fecha y hora. Se
 * cargan una sola vez por request y después se calculan dos vistas sobre el
 * mismo arreglo: el cierre de caja y el registro de movimientos (filtros
 * independientes, pedido del cliente 2026-10-13).
 */
export async function cargarLineasTesoreria(gId: string): Promise<LineaBase[]> {
  const [recibos, manuales] = await Promise.all([
    db
      .select({
        id: facturacion.id,
        codigo: facturacion.codigo,
        importe: facturacion.importe,
        emision: facturacion.emision,
        createdAt: facturacion.createdAt,
        anulada: facturacion.anulada,
        anuladaAt: facturacion.anuladaAt,
        medioPago: facturacion.medioPago,
        socioRazonSocial: profiles.razonSocial,
        socioNombre: profiles.nombre,
        socioApellido: profiles.apellido,
        datosPago: movimientosCuentaCorriente.datosPago,
      })
      .from(facturacion)
      .leftJoin(profiles, eq(profiles.id, facturacion.socioId))
      .leftJoin(
        movimientosCuentaCorriente,
        eq(movimientosCuentaCorriente.id, facturacion.movimientoId),
      )
      .where(
        and(
          eq(facturacion.guarderiaId, gId),
          or(...PATRONES_RECIBO_COBRANZA.map((p) => like(facturacion.codigo, p))),
          // Un recibo fiscal rechazado por ARCA nunca cobró nada.
          sql`${facturacion.estado}::text <> 'rechazada'`,
        ),
      )
      .orderBy(asc(facturacion.emision), asc(facturacion.createdAt)),

    db
      .select()
      .from(tesoreriaMovimientos)
      .where(
        // Los anulados también se cargan: se listan tachados en el registro,
        // pero no suman en los saldos (ver calcularTesoreria).
        eq(tesoreriaMovimientos.guarderiaId, gId),
      )
      .orderBy(asc(tesoreriaMovimientos.fecha), asc(tesoreriaMovimientos.numero)),
  ]);

  const lineas: LineaBase[] = [];

  for (const r of recibos) {
    const cuando = r.emision ?? r.createdAt;
    const fecha = argYmd(cuando);
    if (!fecha) continue;
    const socio = nombreSocio({
      razonSocial: r.socioRazonSocial,
      nombre: r.socioNombre,
      apellido: r.socioApellido,
    });
    const codigo = r.codigo ?? 'Recibo';

    // Formas de pago con plata. Recibos sin formas (débito automático Payway,
    // recibos viejos): una sola línea con el medio del recibo por el total.
    const dp = r.datosPago as {
      formas?: { tipo: string; monto: string; datos?: Record<string, string> }[];
    } | null;
    const formas = (dp?.formas ?? [])
      .map((f) => ({
        tipo: f.tipo,
        monto: parseFloat(f.monto) || 0,
        // Cobranzas guarda el monto en dólares y el tipo de cambio en `datos`.
        usd: f.tipo === 'efectivo_usd' ? montoUsdDe(f.datos?.usd) : null,
      }))
      .filter((f) => f.monto > 0.005);
    const partes =
      formas.length > 0
        ? formas
        : [
            {
              tipo: r.medioPago ?? 'otro',
              monto: parseFloat(r.importe ?? '0') || 0,
              usd: null as number | null,
            },
          ];

    partes.forEach((f, i) => {
      if (f.monto <= 0.005) return;
      lineas.push({
        id: `rc-${r.id}-${i}`,
        origen: 'recibo',
        fecha,
        orden: cuando.toISOString(),
        numero: codigo,
        detalle: `Recibo ${codigo} · ${socio}`,
        instrumento: instrumentoDesde(f.tipo),
        tipo: 'ingreso',
        monto: redondear(f.monto),
        reciboId: r.id,
        rubro: 'Cobranzas',
        subrubro: null,
        observaciones: null,
        adjuntoPath: null,
        adjuntoNombre: null,
        datos: null,
        montoUsd: f.usd,
        movimientoId: null,
        anulado: false,
        anuladoAt: null,
      });
    });

    if (r.anulada && r.anuladaAt) {
      const fechaAnulacion = argYmd(r.anuladaAt);
      if (!fechaAnulacion) continue;
      partes.forEach((f, i) => {
        if (f.monto <= 0.005) return;
        lineas.push({
          id: `an-${r.id}-${i}`,
          origen: 'anulacion',
          fecha: fechaAnulacion,
          orden: r.anuladaAt!.toISOString(),
          numero: codigo,
          detalle: `Anulación ${codigo} · ${socio}`,
          instrumento: instrumentoDesde(f.tipo),
          tipo: 'egreso',
          monto: redondear(f.monto),
          reciboId: r.id,
          rubro: 'Cobranzas',
          subrubro: 'Anulación',
          observaciones: null,
          adjuntoPath: null,
          adjuntoNombre: null,
          datos: null,
          montoUsd: f.usd,
          movimientoId: null,
          anulado: false,
          anuladoAt: null,
        });
      });
    }
  }

  for (const m of manuales) {
    const datosManual = (m.datosInstrumento as Record<string, string> | null) ?? null;
    lineas.push({
      id: `tm-${m.id}`,
      origen: 'manual',
      fecha: m.fecha,
      // La fecha la elige el admin; la hora de carga desempata dentro del día.
      orden: `${m.fecha}T${m.createdAt.toISOString().slice(11)}`,
      numero: codigoMovimiento(m.tipo === 'egreso' ? 'egreso' : 'ingreso', m.numero),
      detalle: m.detalle,
      instrumento: instrumentoDesde(m.instrumento),
      tipo: m.tipo === 'egreso' ? 'egreso' : 'ingreso',
      monto: redondear(parseFloat(m.monto) || 0),
      reciboId: null,
      rubro: m.rubro,
      subrubro: m.subrubro,
      observaciones: m.observaciones || null,
      adjuntoPath: m.adjuntoPath,
      adjuntoNombre: m.adjuntoNombre,
      datos: datosManual,
      montoUsd: m.instrumento === 'efectivo_usd' ? montoUsdDe(datosManual?.usd) : null,
      movimientoId: m.id,
      anulado: m.anulado,
      anuladoAt: m.anuladoAt ? m.anuladoAt.toISOString() : null,
    });
  }

  lineas.sort((a, b) =>
    a.fecha !== b.fecha
      ? a.fecha.localeCompare(b.fecha)
      : a.orden !== b.orden
        ? a.orden.localeCompare(b.orden)
        : a.id.localeCompare(b.id),
  );
  return lineas;
}

function signo(l: { tipo: TipoMovimientoTesoreria; monto: number }): number {
  return l.tipo === 'ingreso' ? l.monto : -l.monto;
}

/** "1.234,56" / "1234.56" → 1234.56; sin valor o inválido → null. */
function montoUsdDe(v: string | undefined): number | null {
  const n = numeroDecimal(v);
  return Number.isFinite(n) && n > 0 ? redondear(n) : null;
}

function sumarUsd(acc: SaldosUsd, l: LineaBase, campo: 'saldoInicial' | 'ingresos' | 'egresos') {
  if (l.montoUsd == null) return;
  if (campo === 'saldoInicial') acc.saldoInicial += l.tipo === 'ingreso' ? l.montoUsd : -l.montoUsd;
  else acc[campo] += l.montoUsd;
}

export async function listarTesoreria(
  gId: string,
  filtros: FiltrosTesoreria,
): Promise<ResultadoTesoreria> {
  return calcularTesoreria(await cargarLineasTesoreria(gId), filtros);
}

/** Saldos por instrumento + líneas en rango con saldo acumulado, para un filtro. */
export function calcularTesoreria(
  todas: LineaBase[],
  filtros: FiltrosTesoreria,
): ResultadoTesoreria {
  const elegidos = new Set<string>(filtros.instrumentos);

  const porInstrumento = new Map<Instrumento, ResumenInstrumento>();
  for (const i of INSTRUMENTOS) {
    if (!elegidos.has(i.value)) continue;
    porInstrumento.set(i.value, {
      instrumento: i.value,
      saldoInicial: 0,
      ingresos: 0,
      egresos: 0,
      saldoFinal: 0,
      usd:
        i.value === 'efectivo_usd'
          ? { saldoInicial: 0, ingresos: 0, egresos: 0, saldoFinal: 0 }
          : null,
    });
  }

  const enRango: LineaBase[] = [];
  for (const l of todas) {
    const r = porInstrumento.get(l.instrumento);
    if (!r) continue;
    if (filtros.desde && l.fecha < filtros.desde) {
      if (l.anulado) continue;
      r.saldoInicial += signo(l);
      if (r.usd) sumarUsd(r.usd, l, 'saldoInicial');
      continue;
    }
    if (filtros.hasta && l.fecha > filtros.hasta) continue;
    // Un manual anulado se muestra en el registro pero no mueve la caja.
    if (!l.anulado) {
      if (l.tipo === 'ingreso') r.ingresos += l.monto;
      else r.egresos += l.monto;
      if (r.usd) sumarUsd(r.usd, l, l.tipo === 'ingreso' ? 'ingresos' : 'egresos');
    }
    enRango.push(l);
  }

  const resumen: ResumenInstrumento[] = [];
  const consolidado: ResumenInstrumento = {
    instrumento: 'consolidado',
    saldoInicial: 0,
    ingresos: 0,
    egresos: 0,
    saldoFinal: 0,
    usd: null,
  };
  for (const r of porInstrumento.values()) {
    r.saldoInicial = redondear(r.saldoInicial);
    r.ingresos = redondear(r.ingresos);
    r.egresos = redondear(r.egresos);
    r.saldoFinal = redondear(r.saldoInicial + r.ingresos - r.egresos);
    if (r.usd) {
      r.usd.saldoInicial = redondear(r.usd.saldoInicial);
      r.usd.ingresos = redondear(r.usd.ingresos);
      r.usd.egresos = redondear(r.usd.egresos);
      r.usd.saldoFinal = redondear(r.usd.saldoInicial + r.usd.ingresos - r.usd.egresos);
    }
    consolidado.saldoInicial += r.saldoInicial;
    consolidado.ingresos += r.ingresos;
    consolidado.egresos += r.egresos;
    resumen.push(r);
  }
  consolidado.saldoInicial = redondear(consolidado.saldoInicial);
  consolidado.ingresos = redondear(consolidado.ingresos);
  consolidado.egresos = redondear(consolidado.egresos);
  consolidado.saldoFinal = redondear(
    consolidado.saldoInicial + consolidado.ingresos - consolidado.egresos,
  );

  // Saldo acumulado "en el momento exacto de la transacción", sobre los
  // instrumentos elegidos, arrancando del saldo inicial consolidado.
  let acumulado = consolidado.saldoInicial;
  const lineas: LineaTesoreria[] = enRango.map((l) => {
    if (!l.anulado) acumulado = redondear(acumulado + signo(l));
    return { ...l, saldo: acumulado };
  });

  return {
    lineas,
    resumen,
    consolidado,
  };
}
