'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileDown } from 'lucide-react';
import { toast } from 'sonner';

import { anularPagoAction } from '@/app/actions/pagos-proveedores';
import { Tarjeta, botonSecundario, useAccion } from '@/components/shared/form-ui';
import { formatoImporte, formatoMoneda } from '@/lib/cuentas-a-pagar/constantes';
import { formatArgentinaDate } from '@/lib/dates';
import { fechaLegible } from '@/lib/documentacion-fechas';
import type { DetallePago } from '@/lib/pagos/consultas';
import { descargarOrdenDePagoPdf, type ClubOrdenPago } from '@/lib/pagos/orden-pago-pdf';

export function PagoDetail({ pago, club }: { pago: DetallePago; club: ClubOrdenPago }) {
  const { pending, ejecutar } = useAccion();
  const [confirmando, setConfirmando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const anulado = pago.estado === 'anulado';

  async function pdf() {
    setGenerando(true);
    try {
      await descargarOrdenDePagoPdf(pago, club);
    } catch (e) {
      console.error('[orden de pago pdf]', e);
      toast.error('No se pudo generar el PDF. Probá de nuevo.');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title flex flex-wrap items-center gap-3">
            {pago.codigo}
            <span
              className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${
                anulado ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}
            >
              {anulado ? 'Anulado' : 'Pagado'}
            </span>
          </h1>
          <p className="page-subtitle mt-1">
            Orden de pago · {pago.proveedor.nombre} · {fechaLegible(pago.fechaPago)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={botonSecundario} disabled={generando} onClick={pdf}>
            <span className="inline-flex items-center gap-1.5">
              <FileDown className="h-4 w-4" />
              {generando ? 'Generando…' : 'Descargar PDF'}
            </span>
          </button>
          {!anulado &&
            (confirmando ? (
              <span className="flex items-center gap-2">
                <span className="text-sm text-gray-600">¿Anular el pago?</span>
                <button
                  type="button"
                  className="rounded-[10px] border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                  disabled={pending}
                  onClick={() =>
                    ejecutar(
                      () => anularPagoAction(pago.id),
                      'Pago anulado. Los comprobantes vuelven a estado H.',
                      () => setConfirmando(false),
                    )
                  }
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  className={botonSecundario}
                  onClick={() => setConfirmando(false)}
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="rounded-[10px] border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmando(true)}
              >
                Anular pago
              </button>
            ))}
        </div>
      </div>

      {anulado && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          Pago anulado{pago.anuladoAt ? ` el ${formatArgentinaDate(pago.anuladoAt)}` : ''}
          {pago.anuladoPor ? ` por ${pago.anuladoPor}` : ''}. Los comprobantes que cancelaba
          volvieron a estado H para empezar de nuevo el circuito.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Tarjeta
            titulo={pago.tipo === 'anticipo' ? 'Anticipo a proveedor' : 'Comprobantes cancelados'}
          >
            {pago.aplicaciones.length === 0 ? (
              <p className="text-sm text-gray-500">
                Pago sin comprobantes previos: queda como saldo a favor del proveedor en Cuentas a
                pagar.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                      <th className="py-2 font-semibold">Comprobante</th>
                      <th className="py-2 pl-4 text-right font-semibold">Saldo previo</th>
                      <th className="py-2 pl-4 text-right font-semibold">Aplicado</th>
                      <th className="py-2 pl-4 text-right font-semibold">Desc. / ajuste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pago.aplicaciones.map((a) => (
                      <tr key={a.comprobanteId} className="border-b border-gray-100">
                        <td className="py-2">
                          <Link
                            href={`/cuentas-a-pagar/${a.comprobanteId}`}
                            className="font-medium text-[#175861] hover:underline"
                          >
                            {a.origen === 'anticipo' ? 'Anticipo' : a.tipoLabel}{' '}
                            {a.origen === 'anticipo' ? '' : a.numeroCompleto}
                          </Link>
                          <p className="text-xs text-gray-500">{a.codigo}</p>
                        </td>
                        <td className="py-2 pl-4 text-right">
                          {formatoImporte(a.signo * a.saldoPrevio)}
                        </td>
                        <td className="py-2 pl-4 text-right font-medium">
                          {formatoImporte(a.signo * a.montoAplicado)}
                        </td>
                        <td className="py-2 pl-4 text-right">
                          {a.signo === 1 ? formatoImporte(a.descuentoAjuste) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Medios de pago">
            {pago.medios.length === 0 ? (
              <p className="text-sm text-gray-500">
                Sin medios de pago: los comprobantes se compensaron entre sí por completo.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {pago.medios.map((m, i) => (
                  <li key={i} className="flex items-start justify-between gap-4 py-2">
                    <div>
                      <p className="font-medium text-gray-900">{m.label}</p>
                      {m.detalle && <p className="text-xs text-gray-500">{m.detalle}</p>}
                    </div>
                    <p className="font-medium whitespace-nowrap">
                      {formatoMoneda(m.monto, pago.moneda)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        <div className="min-w-0 space-y-6">
          <Tarjeta titulo="Total pagado">
            <p
              className={`text-2xl font-bold ${anulado ? 'text-gray-400 line-through' : 'text-gray-900'}`}
            >
              {formatoMoneda(pago.montoPagado, pago.moneda)}
            </p>
            {pago.moneda === 'DOL' && pago.tipoCambio && (
              <p className="mt-1 text-xs text-gray-500">
                Tipo de cambio {formatoImporte(pago.tipoCambio)}
              </p>
            )}
          </Tarjeta>
          <Tarjeta titulo="Datos">
            <dl className="space-y-3 text-sm">
              <Dato r="Proveedor" v={`${pago.proveedor.codigo} · ${pago.proveedor.nombre}`} />
              <Dato r="CUIT" v={pago.proveedor.cuit ?? '—'} />
              <Dato r="Fecha de pago" v={fechaLegible(pago.fechaPago)} />
              {pago.creadoPor && <Dato r="Registrado por" v={pago.creadoPor} />}
              {pago.observaciones && <Dato r="Observaciones" v={pago.observaciones} />}
            </dl>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

function Dato({ r, v }: { r: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{r}</dt>
      <dd className="font-medium text-gray-900">{v}</dd>
    </div>
  );
}
