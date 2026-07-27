/**
 * Auto-emisión de comprobantes del día de facturación.
 *
 * Modelo "los cargos nacen al emitir" (2026-07): ya no existe un paso previo
 * que genere cargos en cuenta corriente. Para cada guardería cuyo día de
 * facturación es hoy, esta rutina computa los pendientes de facturar desde
 * los contratos vigentes (`listarPendientesFacturar`) y emite directamente:
 *
 *  - Factura fiscal (folio FA-) por los servicios "Legal" del socio — solo si
 *    la guardería tiene TusFacturas configurado y el certificado ARCA
 *    confirmado; si no, se saltea con log y los pendientes siguen visibles
 *    en /ventas (sin deuda fantasma en cuenta corriente).
 *  - Comprobante interno (código CA-, espeja FM/FL/FA) por los servicios
 *    "Interno" — no pasa por ARCA, corre para cualquier guardería.
 *
 * Los cargos en cuenta corriente los crea la propia emisión, dentro de su
 * transacción, vinculados al comprobante.
 *
 * Transición: los cargos legacy que quedaron en cuenta corriente sin
 * comprobante (generados por el cron viejo) se incluyen en la misma emisión
 * hasta drenar el pool. La idempotencia es intrínseca: un contrato facturado
 * este período deja de aparecer como pendiente (anti-join + índices únicos de
 * la mig 0133), así que re-correr el cron el mismo día no duplica nada.
 *
 * Defaults de formato: copia tipo/condición/medio de pago de la última
 * factura fiscal del socio; si no tiene, "cuenta_corriente" y débito
 * automático si hay token Payway activo ("efectivo" si no).
 *
 * Errores: si la emisión falla para un socio, se loguea y se sigue con el
 * siguiente.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  guarderiaCentrosEmisores,
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  paywayTokens,
  profiles,
} from '@/lib/db/schema';
import { crearComprobanteInternoCore, crearFacturaCore } from '@/app/actions/facturacion';
import { derivarTipoFactura } from '@/lib/derivar-tipo-factura';
import { agruparPorSocio, listarPendientesFacturar } from '@/lib/pendientes-facturar';
import { getCargosSaldadosFifo } from '@/lib/reconciliar-cuenta';

type AutoEmisionResult = {
  emitted: number;
  emittedInternos: number;
  skippedSinPendientes: number;
  skippedSinCreds: number;
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

export async function runAutoEmision(
  guarderiaIds: string[],
  now: Date = new Date(),
): Promise<AutoEmisionResult> {
  const result: AutoEmisionResult = {
    emitted: 0,
    emittedInternos: 0,
    skippedSinPendientes: 0,
    skippedSinCreds: 0,
    failed: [],
  };

  if (guarderiaIds.length === 0) return result;

  for (const guarderiaId of guarderiaIds) {
    const [guardRow] = await db
      .select({
        condicionIva: guarderias.condicionIva,
        certificadoAfipOk: guarderias.certificadoAfipOk,
      })
      .from(guarderias)
      .where(eq(guarderias.id, guarderiaId))
      .limit(1);
    // La auto-emisión siempre sale por el centro emisor principal (el
    // dropdown de centro emisor es solo de la emisión manual).
    const [centroPrincipal] = await db
      .select({
        apikey: guarderiaCentrosEmisores.apikey,
        apitoken: guarderiaCentrosEmisores.apitoken,
        usertoken: guarderiaCentrosEmisores.usertoken,
      })
      .from(guarderiaCentrosEmisores)
      .where(
        and(
          eq(guarderiaCentrosEmisores.guarderiaId, guarderiaId),
          eq(guarderiaCentrosEmisores.esPrincipal, true),
        ),
      )
      .limit(1);
    const guardCondicionIva = guardRow?.condicionIva ?? null;
    const fiscalHabilitado = Boolean(
      guardRow &&
      centroPrincipal?.apikey &&
      centroPrincipal.apitoken &&
      centroPrincipal.usertoken &&
      guardRow.certificadoAfipOk,
    );

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
    const socioInfo = new Map(sociosRows.map((s) => [s.socioId, s]));
    if (socioInfo.size === 0) continue;

    // Pendientes computados desde los contratos vigentes.
    const computados = await listarPendientesFacturar(guarderiaId, { now });
    const porSocio = agruparPorSocio(computados);

    // Legacy (transición): cargos en cuenta corriente sin comprobante.
    const legacyRows = await db
      .select({
        id: movimientosCuentaCorriente.id,
        socioId: movimientosCuentaCorriente.socioId,
        comprobanteInterno: movimientosCuentaCorriente.comprobanteInterno,
      })
      .from(movimientosCuentaCorriente)
      .where(
        and(
          inArray(movimientosCuentaCorriente.socioId, [...socioInfo.keys()]),
          eq(movimientosCuentaCorriente.estado, 'no_pagado'),
          sql`${movimientosCuentaCorriente.debe} > 0`,
        ),
      );
    const legacyFiscalPorSocio = new Map<string, string[]>();
    const legacyInternoPorSocio = new Map<string, string[]>();
    for (const m of legacyRows) {
      const mapa = m.comprobanteInterno ? legacyInternoPorSocio : legacyFiscalPorSocio;
      if (!mapa.has(m.socioId)) mapa.set(m.socioId, []);
      mapa.get(m.socioId)!.push(m.id);
    }

    const socioIds = new Set<string>([
      ...porSocio.keys(),
      ...legacyFiscalPorSocio.keys(),
      ...legacyInternoPorSocio.keys(),
    ]);

    for (const socioId of socioIds) {
      const info = socioInfo.get(socioId);
      if (!info) continue;

      const items = porSocio.get(socioId) ?? [];
      const fiscalKeys = items.filter((i) => !i.comprobanteInterno).map((i) => i.key);
      const internoKeys = items.filter((i) => i.comprobanteInterno).map((i) => i.key);
      const legacyInterno = legacyInternoPorSocio.get(socioId) ?? [];

      // Red de seguridad legacy: no facturar cargos que el pool de haberes ya
      // cubre (FIFO), aunque sigan 'no_pagado'. Sin esto se re-facturaría
      // plata ya cobrada. Ver project_facturacion_refactura_pagos.
      let legacyFiscal = legacyFiscalPorSocio.get(socioId) ?? [];
      if (legacyFiscal.length > 0) {
        const saldados = await getCargosSaldadosFifo(socioId);
        legacyFiscal = legacyFiscal.filter((id) => !saldados.has(id));
      }

      let intentoAlgo = false;

      // ── Fiscal (FA-) ──────────────────────────────────────────────────────
      if (fiscalKeys.length > 0 || legacyFiscal.length > 0) {
        if (!fiscalHabilitado) {
          // Sin creds o certificado: los pendientes quedan como cómputo
          // visible en /ventas, sin deuda fantasma. No se retro-facturan
          // períodos salteados al configurarse (paridad con el modelo viejo).
          console.warn(
            '[auto-facturacion] fiscal salteado: guardería sin TusFacturas/certificado',
            {
              guarderiaId,
              socioId,
            },
          );
          result.skippedSinCreds++;
        } else {
          intentoAlgo = true;
          const socioCondicionIva = info.facturaFiscal
            ? info.condicionIvaPersonal
            : info.condicionIva;

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
              descripcion: `Facturación mensual ${ymd(now)}`,
              fecha: ymd(now),
              vencimiento: ymd(addDays(now, VENCIMIENTO_DIAS_DEFAULT)),
              desde: ymd(startOfMonth(now)),
              hasta: ymd(endOfMonth(now)),
              itemKeys: fiscalKeys,
              movimientoIds: legacyFiscal,
            },
            { folioPrefix: 'FA' },
          );

          if (r.error) {
            console.error('[auto-facturacion] error fiscal en socio', {
              guarderiaId,
              socioId,
              error: r.error,
            });
            result.failed.push({ socioId, error: r.error });
          } else {
            result.emitted++;
          }
        }
      }

      // ── Interno (CA-) ─────────────────────────────────────────────────────
      if (internoKeys.length > 0 || legacyInterno.length > 0) {
        intentoAlgo = true;
        const r = await crearComprobanteInternoCore(
          {
            socioId,
            itemKeys: internoKeys,
            movimientoIds: legacyInterno,
            fecha: ymd(now),
            guarderiaId,
          },
          'CA',
        );

        if (r.error) {
          console.error('[auto-facturacion] error interno en socio', {
            guarderiaId,
            socioId,
            error: r.error,
          });
          result.failed.push({ socioId, error: r.error });
        } else {
          result.emittedInternos++;
        }
      }

      if (!intentoAlgo) result.skippedSinPendientes++;
    }
  }

  return result;
}
