import { notFound } from 'next/navigation';
import { eq, and } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { facturacion, guarderias, profiles } from '@/lib/db/schema';
import { PrintButton } from './print-button';

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
      socioNombre: profiles.nombre,
      socioApellido: profiles.apellido,
      guarderiaName: guarderias.nombre,
      guarderiaRazonSocial: guarderias.razonSocial,
      guarderiaDireccion: guarderias.direccion,
      guarderiaCuit: guarderias.cuit,
    })
    .from(facturacion)
    .leftJoin(profiles, eq(profiles.id, facturacion.socioId))
    .innerJoin(guarderias, eq(guarderias.id, facturacion.guarderiaId))
    .where(and(eq(facturacion.id, id), eq(facturacion.guarderiaId, gId)))
    .limit(1);

  if (!row || row.tipoFactura !== 'recibo') notFound();

  const socioNombre = [row.socioNombre, row.socioApellido].filter(Boolean).join(' ') || '—';
  const clubNombre = row.guarderiaRazonSocial ?? row.guarderiaName;

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
          <a href="/facturacion" className="text-sm text-gray-500 hover:text-gray-700">
            ← Volver a Comprobantes
          </a>
          <PrintButton />
        </div>

        {/* Receipt */}
        <div className="print-area mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:p-6">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <p className="text-xl font-bold text-gray-900">{clubNombre}</p>
              {row.guarderiaDireccion && (
                <p className="mt-0.5 text-sm text-gray-500">{row.guarderiaDireccion}</p>
              )}
              {row.guarderiaCuit && (
                <p className="text-sm text-gray-500">CUIT: {row.guarderiaCuit}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold tracking-wide text-gray-900">RECIBO</p>
              <p className="mt-1 text-sm text-gray-500">Nro: {row.codigo}</p>
              <p className="text-sm text-gray-500">Fecha: {fmtDate(row.emision)}</p>
            </div>
          </div>

          <div className="mb-6 border-t border-gray-200" />

          {/* Body */}
          <div className="space-y-4">
            <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
              <span className="font-semibold text-gray-500">Recibí de:</span>
              <span className="text-gray-900">{socioNombre}</span>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
              <span className="font-semibold text-gray-500">La suma de:</span>
              <span className="text-lg font-bold text-gray-900">{fmtMoney(row.importe)}</span>
            </div>
            {row.descripcion && (
              <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
                <span className="font-semibold text-gray-500">En concepto de:</span>
                <span className="text-gray-900">{row.descripcion}</span>
              </div>
            )}
            {row.medioPago && (
              <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
                <span className="font-semibold text-gray-500">Forma de pago:</span>
                <span className="text-gray-900">
                  {FORMA_PAGO_LABEL[row.medioPago] ?? row.medioPago}
                </span>
              </div>
            )}
          </div>

          <div className="mt-6 mb-6 border-t border-gray-200" />

          {/* Total */}
          <div className="flex justify-end">
            <div className="text-right">
              <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">Total</p>
              <p className="text-2xl font-extrabold text-gray-900">{fmtMoney(row.importe)}</p>
            </div>
          </div>

          {/* Firma */}
          <div className="mt-12 grid grid-cols-2 gap-8">
            <div>
              <div className="border-t-2 border-gray-300 pt-2 text-center text-xs text-gray-500">
                Firma y aclaración
              </div>
            </div>
            <div>
              <div className="border-t-2 border-gray-300 pt-2 text-center text-xs text-gray-500">
                Sello del club
              </div>
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
