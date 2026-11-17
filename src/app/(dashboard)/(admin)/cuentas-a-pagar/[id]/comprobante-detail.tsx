'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip } from 'lucide-react';
import { toast } from 'sonner';

import {
  adjuntarComprobanteAction,
  anularComprobanteAction,
  cambiarEstadoComprobantesAction,
} from '@/app/actions/cuentas-a-pagar';
import { Tarjeta, botonPrimario, botonSecundario, useAccion } from '@/components/shared/form-ui';
import {
  claseEstadoCp,
  formatoImporte,
  formatoMoneda,
  labelEstadoCp,
  labelTipoComprobante,
  numeroCompleto,
  tipoComprobante,
} from '@/lib/cuentas-a-pagar/constantes';
import type { DetalleComprobante, ProveedorSelector } from '@/lib/cuentas-a-pagar/consultas';
import { formatArgentinaDateTime } from '@/lib/dates';
import { fechaLegible } from '@/lib/documentacion-fechas';
import { labelDe } from '@/lib/legajo/constantes';
import { CONDICIONES_IVA } from '@/lib/proveedores/constantes';

import { ComprobanteForm, type CatalogosComprobante } from '../comprobante-form';

export function ComprobanteDetail({
  det,
  proveedores,
  catalogos,
  hoy,
}: {
  det: DetalleComprobante;
  proveedores: ProveedorSelector[];
  catalogos: CatalogosComprobante;
  hoy: string;
}) {
  const router = useRouter();
  const { pending, ejecutar } = useAccion();
  const [editando, setEditando] = useState(false);
  const [confirmandoAnular, setConfirmandoAnular] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);

  const esAnticipo = det.origen === 'anticipo';
  // Se modifica solo en H y sin pagos aplicados; se anula solo si no está pagado.
  const puedeEditar = !esAnticipo && det.estado === 'H' && det.aplicado === 0;
  const puedeAnular =
    !esAnticipo && (det.estado === 'H' || det.estado === 'A') && det.aplicado === 0;
  const tipo = tipoComprobante(det.tipoComprobante);

  if (editando) {
    return (
      <>
        <div className="mb-6">
          <h1 className="page-title">Modificar {det.codigo}</h1>
          <p className="page-subtitle mt-1">Solo se puede modificar mientras está en estado H.</p>
        </div>
        <ComprobanteForm
          proveedores={proveedores}
          catalogos={catalogos}
          hoy={hoy}
          inicial={det}
          onCancelar={() => setEditando(false)}
        />
      </>
    );
  }

  function pasarA(destino: 'A' | 'H') {
    ejecutar(
      () => cambiarEstadoComprobantesAction({ ids: [det.id], destino }),
      destino === 'A' ? 'Comprobante autorizado para pagar (A).' : 'Comprobante vuelto a H.',
    );
  }

  function anular() {
    ejecutar(
      () => anularComprobanteAction(det.id),
      'Comprobante anulado (X).',
      () => setConfirmandoAnular(false),
    );
  }

  async function adjuntar(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set('adjunto', file);
    setSubiendo(true);
    try {
      const res = await adjuntarComprobanteAction(det.id, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success('Adjunto guardado.');
        router.refresh();
      }
    } finally {
      setSubiendo(false);
      if (inputArchivo.current) inputArchivo.current.value = '';
    }
  }

  const importesDetalle: [string, number][] = [
    ['Neto no gravado', det.netoNoGravado],
    ['Operaciones exentas', det.exento],
    ['Impuestos internos / otros tributos', det.otrosTributos],
    ['Monotributo', det.monotributo],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title flex flex-wrap items-center gap-3">
            {det.codigo}
            <span
              className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${claseEstadoCp(det.estado)}`}
            >
              {labelEstadoCp(det.estado)}
            </span>
          </h1>
          <p className="page-subtitle mt-1">
            {labelTipoComprobante(det.tipoComprobante)}
            {!esAnticipo && ` ${numeroCompleto(det.puntoVenta, det.numeroComprobante)}`} ·{' '}
            {det.proveedorNombre}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!esAnticipo && det.estado === 'H' && (
            <button
              type="button"
              className={botonPrimario}
              disabled={pending}
              onClick={() => pasarA('A')}
            >
              Pasar a A (autorizar)
            </button>
          )}
          {!esAnticipo && det.estado === 'A' && (
            <button
              type="button"
              className={botonSecundario}
              disabled={pending}
              onClick={() => pasarA('H')}
            >
              Volver a H
            </button>
          )}
          {puedeEditar && (
            <button type="button" className={botonSecundario} onClick={() => setEditando(true)}>
              Modificar
            </button>
          )}
          {puedeAnular &&
            (confirmandoAnular ? (
              <span className="flex items-center gap-2">
                <span className="text-sm text-gray-600">¿Anular el comprobante?</span>
                <button
                  type="button"
                  className="rounded-[10px] border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                  disabled={pending}
                  onClick={anular}
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  className={botonSecundario}
                  onClick={() => setConfirmandoAnular(false)}
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="rounded-[10px] border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmandoAnular(true)}
              >
                Anular
              </button>
            ))}
        </div>
      </div>

      {!puedeEditar && !esAnticipo && det.estado !== 'X' && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {det.estado === 'P'
            ? 'El comprobante está pagado: no se puede modificar ni anular. Para anularlo, primero anulá el pago en el Circuito de pagos.'
            : det.aplicado > 0
              ? 'El comprobante tiene pagos aplicados: no se puede modificar ni anular.'
              : 'Solo se puede modificar un comprobante en estado H. Volvelo a H para modificarlo.'}
        </p>
      )}
      {esAnticipo && (
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Es un anticipo a proveedor generado por una orden de pago. Se aplica a comprobantes desde
          el Circuito de pagos.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Tarjeta titulo="Comprobante">
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Dato r="Proveedor" v={`${det.proveedorCodigo} · ${det.proveedorNombre}`} />
              <Dato r="CUIT" v={det.proveedorCuit ?? '—'} />
              <Dato
                r="Condición ante el IVA"
                v={labelDe(CONDICIONES_IVA, det.condicionIvaProveedor) || '—'}
              />
              <Dato r="Fecha de emisión" v={fechaLegible(det.fechaEmision)} />
              <Dato r="Fecha de contabilización" v={fechaLegible(det.fechaContabilizacion)} />
              <Dato
                r="Fecha de vencimiento"
                v={det.fechaVencimiento ? fechaLegible(det.fechaVencimiento) : '—'}
              />
              <Dato r="Condición de pago" v={det.condicionPago ?? '—'} />
              <Dato
                r="Moneda"
                v={
                  det.moneda === 'DOL'
                    ? `DOL · Dólares (TC ${det.tipoCambio ? formatoImporte(det.tipoCambio) : '—'})`
                    : 'PES · Pesos'
                }
              />
              <Dato r="Concepto (imputación contable)" v={det.concepto ?? '—'} />
              <Dato r="Instrumento de pago" v={det.instrumentoPago ?? '—'} />
              {det.observaciones && <Dato r="Observaciones" v={det.observaciones} />}
            </dl>
          </Tarjeta>

          {!esAnticipo && (
            <Tarjeta titulo="Apertura de importes">
              {tipo?.letra === 'C' ? (
                <dl className="text-sm">
                  <Dato r="Monotributo" v={formatoImporte(det.monotributo)} />
                </dl>
              ) : (
                <div className="space-y-4 text-sm">
                  {det.lineasIva.length > 0 && (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                          <th className="py-2 font-semibold">Neto gravado</th>
                          <th className="py-2 font-semibold">Alícuota</th>
                          <th className="py-2 text-right font-semibold">IVA liquidado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {det.lineasIva.map((l, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-2">{formatoImporte(l.neto)}</td>
                            <td className="py-2">{String(l.alicuota).replace('.', ',')} %</td>
                            <td className="py-2 text-right">{formatoImporte(l.iva)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                    {importesDetalle
                      .filter(([r, v]) => v > 0 && r !== 'Monotributo')
                      .map(([r, v]) => (
                        <Dato key={r} r={r} v={formatoImporte(v)} />
                      ))}
                    {det.percepcionesIibb.map((p, i) => (
                      <Dato
                        key={i}
                        r={`Percepción IIBB · ${p.jurisdiccion}`}
                        v={formatoImporte(p.monto)}
                      />
                    ))}
                  </dl>
                </div>
              )}
              <p className="mt-4 flex items-baseline justify-between border-t border-gray-200 pt-3 text-base font-bold text-gray-900">
                <span>Importe total</span>
                <span>{formatoMoneda(det.totalConSigno, det.moneda)}</span>
              </p>
            </Tarjeta>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Tarjeta titulo="Saldo a pagar">
            <p className="text-2xl font-bold text-gray-900">
              {formatoMoneda(det.saldo, det.moneda)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {det.estado === 'X'
                ? 'Comprobante anulado.'
                : det.estado === 'P'
                  ? `Pagado${det.fechaPago ? ` el ${fechaLegible(det.fechaPago)}` : ''}.`
                  : det.aplicado > 0
                    ? `Pago parcial: ya se aplicaron ${formatoImporte(det.aplicado)}.`
                    : 'Total del comprobante, sin pagos aplicados.'}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Las facturas y notas de débito suman; las notas de crédito y los anticipos restan.
            </p>
          </Tarjeta>

          <Tarjeta titulo="Adjunto">
            {det.adjuntoUrl ? (
              <a
                href={det.adjuntoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#175861] hover:underline"
              >
                <Paperclip className="h-4 w-4" />
                {det.adjuntoNombre ?? 'Ver adjunto'}
              </a>
            ) : (
              <p className="text-sm text-gray-500">Todavía no tiene archivo adjunto.</p>
            )}
            {det.estado !== 'X' && !esAnticipo && (
              <div className="mt-3">
                <input
                  ref={inputArchivo}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => adjuntar(e.target.files?.[0])}
                />
                <button
                  type="button"
                  className={botonSecundario}
                  disabled={subiendo}
                  onClick={() => inputArchivo.current?.click()}
                >
                  {subiendo
                    ? 'Subiendo…'
                    : det.adjuntoUrl
                      ? 'Reemplazar archivo'
                      : 'Adjuntar archivo'}
                </button>
                <p className="mt-1 text-xs text-gray-500">PDF, JPG, PNG o WebP de hasta 8 MB.</p>
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Historial">
            <ol className="space-y-3 text-sm">
              {det.historial.map((h, i) => (
                <li key={i}>
                  <p className="font-medium text-gray-900">
                    {h.detalle ?? `${h.desde ?? '—'} → ${h.hasta}`}
                    {h.desde !== h.hasta && h.desde && (
                      <span className="ml-1 text-gray-500">
                        ({h.desde} → {h.hasta})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatArgentinaDateTime(h.fecha)}
                    {h.usuario ? ` · ${h.usuario}` : ''}
                  </p>
                </li>
              ))}
            </ol>
            {det.autorizadoPor && det.estado !== 'H' && (
              <p className="mt-3 text-xs text-gray-500">
                Autorizado por {det.autorizadoPor}
                {det.autorizadoAt ? ` el ${formatArgentinaDateTime(det.autorizadoAt)}` : ''}.
              </p>
            )}
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
