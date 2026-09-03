/**
 * Criterio de saldo/estado de la Cuenta Corriente. Módulo plano (sin `'use
 * server'` ni `'use client'`) porque lo comparten los dos lados:
 *
 *   - la tabla de la ficha del socio (client component) para las filas y la
 *     card "Saldo deudor" / "Saldo a favor";
 *   - `getDeudaPendienteBatch` (server) para la columna Deuda de la lista de
 *     socios y el flag de moroso.
 *
 * Vivía dentro de socio-detail.tsx y la lista tenía su propio cálculo (el neto
 * crudo Σdebe − Σhaber). Los dos números no coincidían: el neto le resta un
 * adelanto todavía sin aplicar y el criterio por fila no. Un socio con deuda
 * $2.451,61 y un adelanto sin usar de $10.050 figuraba con deuda $0 en la lista
 * y "Saldo a favor" en la card, tapando la deuda entera (reporte del cliente
 * 2026-09-03, punto 9). Una sola implementación es la única forma de que no se
 * vuelvan a separar.
 */

// Agrega a cada movimiento (orden desc: más nuevo primero) el saldo acumulado y
// el estado MOSTRADO. Un cargo figura "Anulado (NC)" cuando lo cubre puntualmente
// una Nota de Crédito de SU PROPIA factura (`montoCubiertoNc`, calculado en el
// server — ver src/lib/nc-cobertura.ts — nunca una bolsa común: una NC que anula
// una factura de $X no puede "sobrar" para cubrir cargos que nunca tuvo
// intención de cancelar). "Cobrado" es cuando lo cubren pagos reales (pool
// genérico FIFO), "Parcial" cuando lo cubierto (NC + pagos) es menor al total
// del cargo, y "Pendiente" cuando todavía no se le asignó nada — asignando del
// más viejo al más nuevo. Es cálculo de display: no cambia el estado guardado
// (la facturación sigue mirando el real). No confundir con la columna
// "Situación" (En Plazo / Vencido), que compara la fecha de vencimiento contra
// hoy — son dos ejes independientes.
//
// Los movimientos con `esMovimientoNc` (el propio asiento-crédito de una NC ya
// aplicada puntualmente arriba) NO suman al pool genérico — si no, esa plata
// "sobra" y vuelve a cubrir cargos no relacionados (el bug original).
//
// Un cargo ya `pagado` (cobranza/Payway/factura marcada pagada) CONSUME su parte
// del pool: su pago ya está comprometido con ese cargo. Si no se descontara, ese
// haber quedaría como "crédito fantasma" cubriendo otros cargos más nuevos y
// mostrándolos pagados de más (doble conteo). Así el total de cargos que figuran
// impagos queda consistente con el saldo neto (Σdebe − Σhaber). Ojo: lo que ya le
// acreditó una NC de su propia factura NO sale del pool (es crédito puntual), y
// una NC emitida DESPUÉS del cobro reescribe el estado a Parcial/Anulado — si no,
// la fila quedaba "Cobrado" para siempre ignorando la acreditación.
//
// Devuelve además `pendiente` por fila: lo que falta cobrar de ese cargo una vez
// descontada la cobertura (NC + pagos targeted + pool). Es la columna "Importe
// pendiente"; en un cargo cancelado al 100% da 0.
export function calcularSaldoYEstado<
  T extends {
    tipo: string | null;
    debe: string | null;
    haber: string | null;
    estado: string | null;
    montoCubiertoNc: string | null;
    montoCubiertoRecibo: string | null;
    haberComprometido: string | null;
    esMovimientoNc: boolean;
    esAdelanto: boolean;
    facturaEstado: string | null;
  },
>(movimientos: T[]): (T & { saldo: number; estadoDisplay: string | null; pendiente: number })[] {
  const asc = [...movimientos].reverse();
  let acum = 0;
  // Partido en dos baldes, igual que calcularPoolRestante (reconciliar-cuenta.ts,
  // fuente de verdad de este mismo criterio): un adelanto sin comprobante suma
  // a `poolAdelanto` pero NO se usa para inferir "Cobrado" en otro cargo — solo
  // `poolNormal` (excedente de un cobro real) puede hacerlo. Sigue disponible
  // entero hasta que el club lo aplique a mano o el débito automático lo
  // consuma de verdad (pedido 2026-08-11).
  let poolNormal = 0;
  let poolAdelanto = 0;
  for (const m of movimientos) {
    if (m.esMovimientoNc) continue;
    // De un pago de Cobranzas targeted solo entra al pool el excedente no
    // aplicado a comprobantes puntuales (adelanto / saldo a favor).
    const aporte = parseFloat(m.haber ?? '0') - parseFloat(m.haberComprometido ?? '0');
    if (m.esAdelanto) poolAdelanto += aporte;
    else poolNormal += aporte;
    // Contraasiento de anulación de recibo: su debe anula el haber del pago
    // anulado (que sigue sumando arriba) — el neto del par es cero y esa
    // plata no cubre ningún cargo. Resta del mismo balde que sumó el pago
    // anulado (un adelanto anulado siempre tiene esAdelanto=true).
    if (m.tipo === 'anulacion_recibo') {
      if (m.esAdelanto) poolAdelanto -= parseFloat(m.debe ?? '0');
      else poolNormal -= parseFloat(m.debe ?? '0');
    }
  }
  // Consume `poolNormal` primero; si no alcanza, sigue con `poolAdelanto` —
  // solo para un cargo YA `pagado` (hecho consumado: evita inflar la
  // cobertura de otros cargos, no depende de si eso vino de un adelanto).
  function consumirPool(monto: number): void {
    const deNormal = Math.min(poolNormal, monto);
    poolNormal -= deNormal;
    poolAdelanto -= monto - deNormal;
  }
  const conSaldo = asc.map((m) => {
    const venta = parseFloat(m.debe ?? '0');
    const cobranza = parseFloat(m.haber ?? '0');
    acum = acum + venta - cobranza;
    let estadoDisplay = m.estado;
    // Fila de una NC: su asiento nace 'pagado' siempre, así que ese estado no
    // dice nada. Lo que importa es si el comprobante sigue sin usar
    // (Pendiente) o ya se aplicó en una cobranza (Aplicada).
    if (m.esMovimientoNc) {
      estadoDisplay = m.facturaEstado === 'pendiente' ? 'nc_pendiente' : 'nc_aplicada';
    }
    const montoNc = parseFloat(m.montoCubiertoNc ?? '0');
    const montoRecibo = parseFloat(m.montoCubiertoRecibo ?? '0');
    // Lo que falta cobrar de ESTE cargo. Las filas que no son un cargo (pagos,
    // asientos de NC, contraasientos) no deben nada.
    let pendiente = 0;
    if (venta > 0 && m.tipo !== 'anulacion_recibo') {
      if (m.estado === 'pagado') {
        // Ya pagado: consume el pool (su pago ya está comprometido con ese
        // cargo), no se reescribe. Lo que le aplicó una NC de su factura o un
        // recibo targeted no está en el pool: solo el resto.
        consumirPool(Math.max(0, venta - montoNc - montoRecibo));
        // Una NC parcial emitida DESPUÉS de que el cargo se cobró le acredita
        // una parte: la fila tiene que mostrarlo en vez de quedar "Cobrado"
        // para siempre.
        if (montoNc >= venta - 0.001) estadoDisplay = 'anulado_nc';
        else if (montoNc > 0.001) estadoDisplay = 'parcial';
      } else if (montoNc >= venta - 0.001) {
        // Cubierto puntualmente por la NC de su propia factura.
        estadoDisplay = 'anulado_nc';
      } else if (montoNc + montoRecibo >= venta - 0.001) {
        // Cubierto entero entre la NC y pagos targeted de Cobranzas.
        estadoDisplay = 'pagado';
      } else if (montoNc + montoRecibo + poolNormal >= venta - 0.001) {
        // La cobertura targeted cubre una parte, el pool genérico (sin contar
        // adelantos) completa el resto.
        estadoDisplay = montoNc > 0.001 ? 'anulado_nc' : 'pagado';
        consumirPool(venta - montoNc - montoRecibo);
      } else if (montoNc + montoRecibo + poolNormal > 0.001) {
        // Cubierto solo en parte: consume todo lo que queda de poolNormal y no
        // alcanza para el resto de este cargo ni para otro más nuevo.
        estadoDisplay = 'parcial';
        pendiente = venta - montoNc - montoRecibo - poolNormal;
        poolNormal = 0;
      } else {
        // Sin nada asignado todavía: debe todo.
        pendiente = venta;
      }
    }
    return { ...m, saldo: acum, estadoDisplay, pendiente: Math.max(0, pendiente) };
  });
  return conSaldo.reverse();
}
