/**
 * Auto-emisión de facturas mensuales.
 *
 * Disparada por el cron diario, después de generar movimientos mensuales.
 * Para cada socio de las guarderías que cumplen `diaFacturacion === hoy`:
 *   1. Idempotencia: si ya hay factura creada hoy para este socio, skip.
 *   2. Solo emite si el socio tiene movimientos pendientes (debe > 0).
 *   3. Copia tipo/condicion/medioPago de la última factura del socio, si
 *      tiene una, como heurística para que el formato siga siendo el que
 *      usó el admin la vez anterior. Si es la primera factura de este
 *      socio (ya no hace falta que un admin la haya cargado antes a
 *      mano), usa defaults: condicionVenta "cuenta_corriente" y medioPago
 *      según lo que el socio tenga configurado (débito automático si
 *      tiene token Payway activo, "efectivo" si no).
 *
 * Errores: si tusfacturas falla para un socio, se loguea y se sigue
 * con el siguiente.
 */

import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  paywayTokens,
  profiles,
} from '@/lib/db/schema';
import { crearFacturaCore } from '@/app/actions/facturacion';
import { derivarTipoFactura } from '@/lib/derivar-tipo-factura';
import { getCargosSaldadosFifo } from '@/lib/reconciliar-cuenta';

type AutoEmisionResult = {
  emitted: number;
  skippedSinPendientes: number;
  skippedYaEmitidaHoy: number;
  failed: { socioId: string; error: string }[];
};

const VENCIMIENTO_DIAS_DEFAULT = 10;

// Tipos de comprobante fiscal (excluye "recibo", que documenta cobros/
// comprobantes internos y no tiene condicionVenta/medioPago propios). Mismo
// criterio que TIPOS_FISCALES en reconciliar-cuenta.ts.
const TIPOS_FISCALES = ['factura_a', 'factura_b', 'factura_c'] as const;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function runAutoEmision(
  guarderiaIds: string[],
  now: Date = new Date(),
): Promise<AutoEmisionResult> {
  const result: AutoEmisionResult = {
    emitted: 0,
    skippedSinPendientes: 0,
    skippedYaEmitidaHoy: 0,
    failed: [],
  };

  if (guarderiaIds.length === 0) return result;

  const inicioHoy = startOfDay(now);
  const finHoy = addDays(inicioHoy, 1);

  for (const guarderiaId of guarderiaIds) {
    const [guardRow] = await db
      .select({ condicionIva: guarderias.condicionIva })
      .from(guarderias)
      .where(eq(guarderias.id, guarderiaId))
      .limit(1);
    const guardCondicionIva = guardRow?.condicionIva ?? null;

    const sociosRows = await db
      .select({
        socioId: memberships.userId,
        condicionIva: profiles.condicionIva,
        condicionIvaPersonal: profiles.condicionIvaPersonal,
        // true = factura con datos personales (Generales); false = Datos Impositivos.
        facturaFiscal: memberships.facturaFiscal,
      })
      .from(memberships)
      .innerJoin(profiles, eq(profiles.id, memberships.userId))
      .where(
        and(
          eq(memberships.guarderiaId, guarderiaId),
          eq(memberships.status, 'active'),
          eq(memberships.rol, 'socio'),
        ),
      );

    for (const { socioId, condicionIva, condicionIvaPersonal, facturaFiscal } of sociosRows) {
      // Condición frente al IVA efectiva según el modo de facturación.
      const socioCondicionIva = facturaFiscal ? condicionIvaPersonal : condicionIva;
      // 1. Idempotencia: si ya hay factura creada hoy, skip.
      const [yaHoy] = await db
        .select({ n: count() })
        .from(facturacion)
        .where(
          and(
            eq(facturacion.guarderiaId, guarderiaId),
            eq(facturacion.socioId, socioId),
            gte(facturacion.emision, inicioHoy),
            lte(facturacion.emision, finHoy),
          ),
        );

      if ((yaHoy?.n ?? 0) > 0) {
        result.skippedYaEmitidaHoy++;
        continue;
      }

      // 2. Movimientos pendientes con debe > 0 (los pagos a cuenta tienen
      //    haber > 0 / debe = 0; no se facturan). createInvoiceAction se
      //    encarga de marcar los movimientos como 'facturado' al linkearlos,
      //    así que filtrar por estado='no_pagado' alcanza.
      const pendientes = await db
        .select({ id: movimientosCuentaCorriente.id })
        .from(movimientosCuentaCorriente)
        .where(
          and(
            eq(movimientosCuentaCorriente.socioId, socioId),
            eq(movimientosCuentaCorriente.estado, 'no_pagado'),
            sql`${movimientosCuentaCorriente.debe} > 0`,
            // Excluir cargos que ya tienen comprobante interno (no van por TusFacturas).
            eq(movimientosCuentaCorriente.comprobanteInterno, false),
          ),
        );

      // Red de seguridad: no facturar cargos que el pool de haberes ya cubre
      // (FIFO), aunque sigan en estado 'no_pagado'. Si un pago neto no marcó el
      // cargo (flujos viejos, o una reconciliación que falló), sin esto la
      // auto-emisión re-facturaría plata ya cobrada → deuda fantasma. Decide
      // solo qué NO facturar; no muta estados. Ver project_facturacion_refactura_pagos.
      const saldados = await getCargosSaldadosFifo(socioId);
      const aFacturar = pendientes.filter((p) => !saldados.has(p.id));

      if (aFacturar.length === 0) {
        result.skippedSinPendientes++;
        continue;
      }

      // 3. Copiar formato de la última FACTURA FISCAL (factura_a/b/c), si tiene
      //    una. `facturacion` guarda en la misma tabla recibos y comprobantes
      //    internos (RB-/RC-), que no tienen condicionVenta/medioPago propios
      //    — si no se filtra por tipo, "la última" puede ser un recibo y
      //    copiaría esos campos vacíos a la próxima factura fiscal real. Si es
      //    la primera factura fiscal de este socio (ya no es requisito tener
      //    una previa), condicionVenta/medioPago no tienen de dónde copiarse:
      //    se completan con un default razonable — "cuenta_corriente" (es
      //    deuda todavía no cobrada) y el medio de pago que el socio tenga
      //    configurado (débito automático de Payway si tiene token activo,
      //    "efectivo" si no — mismo default que usa el alta manual).
      const [ultima] = await db
        .select({
          tipoFactura: facturacion.tipoFactura,
          condicionVenta: facturacion.condicionVenta,
          medioPago: facturacion.medioPago,
        })
        .from(facturacion)
        .where(
          and(
            eq(facturacion.guarderiaId, guarderiaId),
            eq(facturacion.socioId, socioId),
            inArray(facturacion.tipoFactura, TIPOS_FISCALES),
          ),
        )
        .orderBy(desc(facturacion.emision))
        .limit(1);

      const fechaFactura = ymd(now);
      const venc = ymd(addDays(now, VENCIMIENTO_DIAS_DEFAULT));
      const desde = ymd(startOfMonth(now));
      const hasta = ymd(endOfMonth(now));

      const derivado = derivarTipoFactura(guardCondicionIva, socioCondicionIva);
      const tipoFactura =
        derivado ??
        (ultima?.tipoFactura as 'factura_a' | 'factura_b' | 'factura_c' | undefined) ??
        'factura_b';

      let condicionVenta = ultima?.condicionVenta;
      let medioPago = ultima?.medioPago;
      if (!ultima) {
        const [tokenActivo] = await db
          .select({ id: paywayTokens.id })
          .from(paywayTokens)
          .where(and(eq(paywayTokens.socioId, socioId), eq(paywayTokens.activo, true)))
          .limit(1);
        condicionVenta = 'cuenta_corriente';
        medioPago = tokenActivo ? 'debito_automatico' : 'efectivo';
      }

      const r = await crearFacturaCore(
        {
          guarderiaId,
          socioId,
          tipoFactura,
          condicionVenta: condicionVenta as never,
          medioPago: medioPago as never,
          estado: 'pendiente',
          descripcion: `Facturación mensual ${fechaFactura}`,
          fecha: fechaFactura,
          vencimiento: venc,
          desde,
          hasta,
          movimientoIds: aFacturar.map((p) => p.id),
        },
        { folioPrefix: 'FA' },
      );

      if (r.error) {
        console.error('[auto-facturacion] error en socio', {
          guarderiaId,
          socioId,
          error: r.error,
        });
        result.failed.push({ socioId, error: r.error });
        continue;
      }

      result.emitted++;
    }
  }

  return result;
}
