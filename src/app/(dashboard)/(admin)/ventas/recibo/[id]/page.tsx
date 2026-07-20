import { notFound } from 'next/navigation';
import { eq, and, asc, inArray, ne } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  guarderias,
  movimientosCuentaCorriente,
  profiles,
} from '@/lib/db/schema';
import { PrintButton } from './print-button';
import { EnviarReciboMailButton } from './enviar-recibo-mail-button';

const TIPO_COMPROBANTE_LABEL: Record<string, string> = {
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  recibo: 'Recibo interno',
  nota_credito_a: 'Nota de crédito A',
  nota_credito_b: 'Nota de crédito B',
  nota_credito_c: 'Nota de crédito C',
};

function fmtMoney(value: string | null): string {
  const n = parseFloat(value ?? '0');
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const FORMA_PAGO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta de débito',
  debito_automatico: 'Débito automático',
  transferencia: 'Transferencia bancaria',
  cheque: 'Cheque',
  mercado_pago: 'Mercado Pago',
};

// Formas de cobranza (UI de Registro de Cobranza), para el desglose del recibo.
const FORMA_COBRANZA_LABEL: Record<string, string> = {
  efectivo: 'Efectivo (pesos)',
  efectivo_usd: 'Efectivo (dólares)',
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta de débito',
  transferencia: 'Transferencia bancaria',
  cheque: 'Cheque',
  mercado_pago: 'Mercado Pago',
  otro: 'Otro',
};

export default async function ReciboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveMarina();
  if (!ctx) notFound();

  const gId = ctx.activeMembership.guarderiaId;

  const [row] = await db
    .select({
      id: facturacion.id,
      codigo: facturacion.codigo,
      tipoFactura: facturacion.tipoFactura,
      importe: facturacion.importe,
      descripcion: facturacion.descripcion,
      medioPago: facturacion.medioPago,
      emision: facturacion.emision,
      socioId: facturacion.socioId,
      guarderiaId: facturacion.guarderiaId,
      movimientoId: facturacion.movimientoId,
      cobranzaComprobanteIds: facturacion.cobranzaComprobanteIds,
      facturaOriginalId: facturacion.facturaOriginalId,
      socioNombre: profiles.nombre,
      socioApellido: profiles.apellido,
      socioCuit: profiles.cuit,
      socioDocumento: profiles.numeroDocumento,
      socioEmail: profiles.email,
      guarderiaName: guarderias.nombre,
      guarderiaRazonSocial: guarderias.razonSocial,
      guarderiaDireccion: guarderias.direccion,
      guarderiaCuit: guarderias.cuit,
      guarderiaLogo: guarderias.logoUrl,
    })
    .from(facturacion)
    .leftJoin(profiles, eq(profiles.id, facturacion.socioId))
    .innerJoin(guarderias, eq(guarderias.id, facturacion.guarderiaId))
    .where(and(eq(facturacion.id, id), eq(facturacion.guarderiaId, gId)))
    .limit(1);

  if (!row || (row.tipoFactura !== 'recibo' && row.tipoFactura !== 'nota_credito_interna')) {
    notFound();
  }
  const esNotaCreditoInterna = row.tipoFactura === 'nota_credito_interna';

  const socioNombre = [row.socioNombre, row.socioApellido].filter(Boolean).join(' ') || '—';
  const socioDoc = row.socioCuit
    ? `CUIT: ${row.socioCuit}`
    : row.socioDocumento
      ? `DNI: ${row.socioDocumento}`
      : null;
  const clubNombre = row.guarderiaRazonSocial ?? row.guarderiaName;

  // Nota de Crédito interna: código del Comprobante interno (CM-/CL-) que anula.
  let codigoOriginal: string | null = null;
  if (esNotaCreditoInterna && row.facturaOriginalId) {
    const [original] = await db
      .select({ codigo: facturacion.codigo })
      .from(facturacion)
      .where(and(eq(facturacion.id, row.facturaOriginalId), eq(facturacion.guarderiaId, gId)))
      .limit(1);
    codigoOriginal = original?.codigo ?? null;
  }

  // Comprobantes que cobró el recibo. Para recibos de cobranza (RC-) están
  // guardados exactos en cobranza_comprobante_ids, o si no se buscan por
  // heurística FIFO (facturas AFIP del socio, de la más antigua a la más
  // nueva, hasta cubrir el importe). RB-/CM-/CL- documentan un cargo propio,
  // no un pago — para esos se muestra row.descripcion directamente más abajo.
  const comprobantes: { codigo: string | null; tipoFactura: string | null }[] = [];
  if (row.cobranzaComprobanteIds && row.cobranzaComprobanteIds.length > 0) {
    const cobrados = await db
      .select({ codigo: facturacion.codigo, tipoFactura: facturacion.tipoFactura })
      .from(facturacion)
      .where(
        and(inArray(facturacion.id, row.cobranzaComprobanteIds), eq(facturacion.guarderiaId, gId)),
      )
      .orderBy(asc(facturacion.emision));
    comprobantes.push(...cobrados);
  } else if (row.socioId && row.codigo?.startsWith('RC-')) {
    const facturasSocio = await db
      .select({
        codigo: facturacion.codigo,
        tipoFactura: facturacion.tipoFactura,
        importe: facturacion.importe,
      })
      .from(facturacion)
      .where(
        and(
          eq(facturacion.socioId, row.socioId),
          eq(facturacion.guarderiaId, gId),
          ne(facturacion.tipoFactura, 'recibo'),
          inArray(facturacion.tipoFactura, ['factura_a', 'factura_b', 'factura_c']),
        ),
      )
      .orderBy(asc(facturacion.emision));

    const importeRecibo = parseFloat(row.importe ?? '0');
    let acumulado = 0;
    for (const f of facturasSocio) {
      if (acumulado >= importeRecibo - 0.001) break;
      comprobantes.push({ codigo: f.codigo, tipoFactura: f.tipoFactura });
      acumulado += parseFloat(f.importe ?? '0');
    }
  }

  // Ítems propios del comprobante (CM-/CL-: consolida varios cargos Interno
  // en un solo documento). Antes se resumía en `row.descripcion` ("Expensas
  // (+1)"); acá mostramos cada cargo con su concepto y precio discriminados.
  // Solo aplica cuando el recibo documenta cargos propios (no cuando ya
  // mostramos `comprobantes` arriba, que es el caso de un RC- cobrando otra
  // cosa).
  let items: { concepto: string | null; importe: string | null }[] = [];
  if (comprobantes.length === 0) {
    const rows = await db
      .select({
        importe: facturacionItems.importe,
        concepto: movimientosCuentaCorriente.concepto,
      })
      .from(facturacionItems)
      .innerJoin(
        facturacionItemMovimientos,
        eq(facturacionItemMovimientos.facturacionItemId, facturacionItems.id),
      )
      .innerJoin(
        movimientosCuentaCorriente,
        eq(movimientosCuentaCorriente.id, facturacionItemMovimientos.movimientoId),
      )
      .where(eq(facturacionItems.facturacionId, row.id));
    items = rows;
  }

  // Desglose de formas de pago (cobranzas con pago combinado) — guardado en el
  // movimiento de pago vinculado al recibo.
  let formasPago: { tipo: string; monto: string }[] = [];
  if (row.movimientoId) {
    const [mov] = await db
      .select({ datosPago: movimientosCuentaCorriente.datosPago })
      .from(movimientosCuentaCorriente)
      .where(eq(movimientosCuentaCorriente.id, row.movimientoId))
      .limit(1);
    const dp = mov?.datosPago as { formas?: { tipo: string; monto: string }[] } | null;
    if (dp?.formas?.length) formasPago = dp.formas;
  }

  return (
    <>
      {/* Ocultar sidebar y header al imprimir */}
      <style>{`
        @media print {
          aside, nav, [data-sidebar], header { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .print-area { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 p-6 print:bg-white print:p-0">
        {/* Botones de acción — ocultos en impresión */}
        <div className="no-print mb-6 flex items-center justify-between">
          <a href="/ventas" className="text-sm text-gray-500 hover:text-gray-700">
            ← Volver a Ventas
          </a>
          <div className="flex items-center gap-2">
            <EnviarReciboMailButton reciboId={row.id} socioEmail={row.socioEmail} />
            <PrintButton />
          </div>
        </div>

        {/* Receipt */}
        <div className="print-area mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:p-6">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div className="flex items-start gap-3">
              {row.guarderiaLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.guarderiaLogo}
                  alt={clubNombre ?? 'Club'}
                  className="h-14 w-14 shrink-0 rounded object-contain"
                />
              )}
              <div>
                <p className="text-xl font-bold text-gray-900">{clubNombre}</p>
                {row.guarderiaDireccion && (
                  <p className="mt-0.5 text-sm text-gray-500">{row.guarderiaDireccion}</p>
                )}
                {row.guarderiaCuit && (
                  <p className="text-sm text-gray-500">CUIT: {row.guarderiaCuit}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold tracking-wide text-gray-900">
                {esNotaCreditoInterna ? 'NOTA DE CRÉDITO INTERNA' : 'RECIBO'}
              </p>
              <p className="mt-1 text-sm text-gray-500">Nro: {row.codigo}</p>
              <p className="text-sm text-gray-500">Fecha: {fmtDate(row.emision)}</p>
            </div>
          </div>

          <div className="mb-6 border-t border-gray-200" />

          {/* Body */}
          <div className="space-y-4">
            {esNotaCreditoInterna && codigoOriginal && (
              <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
                <span className="font-semibold text-gray-500">Corresponde a:</span>
                <span className="text-gray-900">{codigoOriginal}</span>
              </div>
            )}
            <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
              <span className="font-semibold text-gray-500">
                {esNotaCreditoInterna ? 'Emitida a:' : 'Recibí de:'}
              </span>
              <span className="text-gray-900">
                {socioNombre}
                {socioDoc && <span className="text-gray-500"> — {socioDoc}</span>}
              </span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
              <span className="font-semibold text-gray-500">
                {esNotaCreditoInterna ? 'Por un importe de:' : 'La suma de:'}
              </span>
              <span className="text-lg font-bold text-gray-900">{fmtMoney(row.importe)}</span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
              <span className="font-semibold text-gray-500">En concepto de:</span>
              <span className="text-gray-900">
                {comprobantes.length > 0 ? (
                  <span className="flex flex-col gap-0.5">
                    {comprobantes.map((c, i) => (
                      <span key={i}>
                        {TIPO_COMPROBANTE_LABEL[c.tipoFactura ?? ''] ?? c.tipoFactura}{' '}
                        {c.codigo ?? ''}
                      </span>
                    ))}
                  </span>
                ) : items.length > 0 ? (
                  <span className="flex flex-col gap-0.5">
                    {items.map((it, i) => (
                      <span key={i} className="flex justify-between gap-4">
                        <span>{it.concepto ?? 'Servicio'}</span>
                        <span className="text-gray-500">{fmtMoney(it.importe)}</span>
                      </span>
                    ))}
                  </span>
                ) : (
                  (row.descripcion ?? 'Pago a cuenta')
                )}
              </span>
            </div>
            {formasPago.length > 0 ? (
              <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
                <span className="font-semibold text-gray-500">Forma de pago:</span>
                <span className="flex flex-col gap-0.5 text-gray-900">
                  {formasPago.map((f, i) => (
                    <span key={i}>
                      {FORMA_COBRANZA_LABEL[f.tipo] ?? f.tipo} — {fmtMoney(f.monto)}
                    </span>
                  ))}
                </span>
              </div>
            ) : row.medioPago ? (
              <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
                <span className="font-semibold text-gray-500">Forma de pago:</span>
                <span className="text-gray-900">
                  {FORMA_PAGO_LABEL[row.medioPago] ?? row.medioPago}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-6 mb-6 border-t border-gray-200" />

          {/* Total */}
          <div className="flex justify-end">
            <div className="text-right">
              <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">Total</p>
              <p className="text-2xl font-extrabold text-gray-900">{fmtMoney(row.importe)}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 border-t border-dashed border-gray-200 pt-4 text-center text-xs text-gray-400">
            Este documento no tiene valor fiscal · Comprobante interno
          </div>
        </div>
      </div>
    </>
  );
}
