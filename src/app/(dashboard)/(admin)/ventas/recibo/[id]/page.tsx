import { notFound } from 'next/navigation';
import { eq, and } from 'drizzle-orm';

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
import {
  getComprobantesCobrados,
  getComprobantesCobradosLegacy,
  getDatosPagoRecibo,
  type AplicacionRecibo,
  type ComprobanteCobrado,
} from '@/lib/recibo-desglose';
import { PrintButton } from './print-button';
import { EnviarReciboMailButton } from './enviar-recibo-mail-button';

const TIPO_COMPROBANTE_LABEL: Record<string, string> = {
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  recibo: 'Comprobante interno',
  nota_credito_a: 'Nota de crédito A',
  nota_credito_b: 'Nota de crédito B',
  nota_credito_c: 'Nota de crédito C',
};

function fmtMoney(value: string | null, negativo = false): string {
  const n = Math.abs(parseFloat(value ?? '0'));
  const fmt = n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${negativo ? '-' : ''}$${fmt}`;
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

// A dónde vuelve el link de arriba. El visor se abre desde Ventas, desde Registro
// de Cobranza y desde el ojito de la Cuenta Corriente del socio, siempre en una
// pestaña nueva (target="_blank"), así que no hay historial al que volver: el
// origen viaja en la query. Sin `from` se mantiene el destino histórico (Ventas).
const ORIGEN_VUELTA: Record<string, { href: string; label: string }> = {
  cobranzas: { href: '/cobranzas', label: 'Volver a Cobranzas' },
  ventas: { href: '/ventas', label: 'Volver a Ventas' },
};
const VUELTA_DEFAULT = ORIGEN_VUELTA.ventas;

export default async function ReciboPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const vuelta = (from && ORIGEN_VUELTA[from]) || VUELTA_DEFAULT;
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
      anulada: facturacion.anulada,
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
  // "Recibo" queda reservado para Cobranzas (RC- fiscal / CI- interno). El
  // resto de los documentos internos (CM-/CL-/RB-) documentan cargos, no un
  // pago: son "Comprobante interno".
  const esReciboCobranza =
    (row.codigo?.startsWith('RC-') || row.codigo?.startsWith('CI-')) ?? false;
  const titulo = esNotaCreditoInterna
    ? 'NOTA DE CRÉDITO INTERNA'
    : esReciboCobranza
      ? 'RECIBO'
      : 'COMPROBANTE INTERNO';
  // Recibo anulado: el documento muestra el monto en negativo (la cobranza
  // quedó revertida) — aplica a RC- y CI- por igual.
  const anulado = row.anulada && esReciboCobranza;

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

  // Datos del movimiento de pago vinculado: desglose de formas de pago y —
  // para recibos nuevos — las aplicaciones targeted (cuánto fue a cada
  // comprobante, clave en pagos parciales).
  let formasPago: { tipo: string; monto: string }[] = [];
  let aplicaciones: AplicacionRecibo[] | null = null;
  if (row.movimientoId) {
    const dp = await getDatosPagoRecibo(row.movimientoId);
    formasPago = dp.formas;
    aplicaciones = dp.aplicaciones;
  }

  // Comprobantes que cobró el recibo. Para recibos de cobranza (RC-/CI-)
  // están guardados exactos en cobranza_comprobante_ids, o si no se buscan
  // por heurística FIFO (facturas AFIP del socio, de la más antigua a la más
  // nueva, hasta cubrir el importe). RB-/CM-/CL- documentan un cargo propio,
  // no un pago — para esos se muestra row.descripcion directamente más abajo.
  // El armado es compartido con el mail del recibo (src/lib/recibo-desglose.ts).
  let comprobantes: ComprobanteCobrado[] = [];
  if (row.cobranzaComprobanteIds && row.cobranzaComprobanteIds.length > 0) {
    comprobantes = await getComprobantesCobrados(gId, row.cobranzaComprobanteIds, aplicaciones);
  } else if (row.socioId && row.codigo?.startsWith('RC-') && aplicaciones == null) {
    // Recibo viejo sin aplicaciones guardadas: un recibo nuevo sin
    // comprobantes es un adelanto y no cobró facturas.
    comprobantes = await getComprobantesCobradosLegacy(gId, row.socioId, row.importe);
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
          <a href={vuelta.href} className="text-sm text-gray-500 hover:text-gray-700">
            ← {vuelta.label}
          </a>
          <div className="flex items-center gap-2">
            <EnviarReciboMailButton
              reciboId={row.id}
              socioEmail={row.socioEmail}
              tipoDocumento={esReciboCobranza ? 'Recibo' : 'Comprobante interno'}
            />
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
              <p className="text-2xl font-extrabold tracking-wide text-gray-900">{titulo}</p>
              {anulado && <p className="text-sm font-bold tracking-wide text-red-600">ANULADO</p>}
              <p className="mt-1 text-sm text-gray-500">Nro: {row.codigo}</p>
              <p className="text-sm text-gray-500">Fecha de emisión: {fmtDate(row.emision)}</p>
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
                {esNotaCreditoInterna ? 'Emitida a:' : esReciboCobranza ? 'Recibí de:' : 'Socio:'}
              </span>
              <span className="text-gray-900">
                {socioNombre}
                {socioDoc && <span className="text-gray-500"> — {socioDoc}</span>}
              </span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
              <span className="font-semibold text-gray-500">
                {esReciboCobranza ? 'La suma de:' : 'Por un importe de:'}
              </span>
              <span className="text-lg font-bold text-gray-900">
                {fmtMoney(row.importe, anulado)}
              </span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
              <span className="font-semibold text-gray-500">En concepto de:</span>
              <span className="text-gray-900">
                {comprobantes.length > 0 ? (
                  <span className="flex flex-col gap-1">
                    {comprobantes.map((c, i) => (
                      <span key={i} className="flex flex-col gap-0.5">
                        <span className="flex justify-between gap-4">
                          <span>
                            {TIPO_COMPROBANTE_LABEL[c.tipoFactura ?? ''] ?? c.tipoFactura}{' '}
                            {c.codigo ?? ''}
                            {/* Pago parcial: se muestra lo aplicado por ESTE
                                recibo, no el total del comprobante. */}
                            {c.parcial && (
                              <span className="text-gray-500">
                                {' '}
                                (pago parcial — total {fmtMoney(c.importe)})
                              </span>
                            )}
                          </span>
                          {(c.montoAplicado ?? c.importe) != null && (
                            <span className="text-gray-500">
                              {fmtMoney(c.montoAplicado ?? c.importe)}
                            </span>
                          )}
                        </span>
                        {c.detalle.map((d, j) => (
                          <span key={j} className="flex justify-between gap-4 pl-4 text-gray-500">
                            <span>· {d.concepto ?? 'Servicio'}</span>
                            {d.importe != null && <span>{fmtMoney(d.importe)}</span>}
                          </span>
                        ))}
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
              <p className="text-2xl font-extrabold text-gray-900">
                {fmtMoney(row.importe, anulado)}
              </p>
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
