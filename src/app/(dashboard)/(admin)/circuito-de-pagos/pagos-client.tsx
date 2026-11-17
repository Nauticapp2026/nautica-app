'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FilterX, HandCoins, Plus, Search } from 'lucide-react';

import { anularPagoAction } from '@/app/actions/pagos-proveedores';
import { EmptyState } from '@/components/shared/empty-state';
import { ExportarMenu } from '@/components/shared/exportar-menu';
import { botonPrimario, botonSecundario, inputCls, useAccion } from '@/components/shared/form-ui';
import { normalizarBusqueda } from '@/lib/buscador';
import { formatoMoneda } from '@/lib/cuentas-a-pagar/constantes';
import { argYmd, formatArgentinaDate } from '@/lib/dates';
import { fechaLegible } from '@/lib/documentacion-fechas';
import { exportarTabla, type FormatoExportacion } from '@/lib/exportar-tabla';
import { MEDIOS_PAGO } from '@/lib/pagos/medios';
import type { FilaPago } from '@/lib/pagos/consultas';
import { COLUMNAS_PAGOS, estadoPagoLabel, filaPago } from '@/lib/pagos/exportar';

type Filtros = {
  q: string;
  nroComprobante: string;
  orden: string;
  estado: string;
  forma: string;
  pagoDesde: string;
  pagoHasta: string;
  anulDesde: string;
  anulHasta: string;
};

const SIN_FILTROS: Filtros = {
  q: '',
  nroComprobante: '',
  orden: '',
  estado: '',
  forma: '',
  pagoDesde: '',
  pagoHasta: '',
  anulDesde: '',
  anulHasta: '',
};

const th = 'px-3 py-3 font-semibold whitespace-nowrap';
const td = 'px-3 py-3 whitespace-nowrap';

export function PagosClient({ filas }: { filas: FilaPago[] }) {
  const [f, setF] = useState<Filtros>(SIN_FILTROS);
  const [anulando, setAnulando] = useState<string | null>(null);
  const { pending, ejecutar } = useAccion();
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setF((x) => ({ ...x, [k]: v }));

  const visibles = useMemo(() => {
    const nq = normalizarBusqueda(f.q);
    const nc = normalizarBusqueda(f.nroComprobante);
    const no = normalizarBusqueda(f.orden);
    const medioLabel = MEDIOS_PAGO.find((m) => m.value === f.forma)?.label;
    return filas.filter((x) => {
      if (f.estado && x.estado !== f.estado) return false;
      if (medioLabel && !x.formas.includes(medioLabel)) return false;
      if (f.pagoDesde && x.fechaPago < f.pagoDesde) return false;
      if (f.pagoHasta && x.fechaPago > f.pagoHasta) return false;
      const anul = argYmd(x.fechaAnulacion);
      if (f.anulDesde && (!anul || anul < f.anulDesde)) return false;
      if (f.anulHasta && (!anul || anul > f.anulHasta)) return false;
      if (no && !normalizarBusqueda(x.codigo).includes(no)) return false;
      if (nc && !normalizarBusqueda(x.comprobantes).includes(nc)) return false;
      if (!nq) return true;
      return normalizarBusqueda(`${x.proveedorCodigo} ${x.cuit ?? ''} ${x.razonSocial}`).includes(
        nq,
      );
    });
  }, [filas, f]);

  const hayFiltros = JSON.stringify(f) !== JSON.stringify(SIN_FILTROS);
  const totalPes = visibles
    .filter((x) => x.estado === 'pagado' && x.moneda === 'PES')
    .reduce((s, x) => s + x.montoPagado, 0);
  const totalDol = visibles
    .filter((x) => x.estado === 'pagado' && x.moneda === 'DOL')
    .reduce((s, x) => s + x.montoPagado, 0);

  const exportar = (formato: FormatoExportacion) =>
    exportarTabla(formato, {
      nombre: 'pagos-efectuados',
      titulo: 'Pagos efectuados',
      columnas: COLUMNAS_PAGOS,
      filas: visibles.map(filaPago),
    });

  function anular(id: string) {
    ejecutar(
      () => anularPagoAction(id),
      'Pago anulado. Los comprobantes vuelven a estado H.',
      () => setAnulando(null),
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Circuito de pagos</h1>
          <p className="page-subtitle mt-1">Pagos efectuados a proveedores</p>
        </div>
        <Link href="/circuito-de-pagos/nuevo" className={botonPrimario}>
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Nuevo pago
          </span>
        </Link>
      </div>

      {filas.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <EmptyState
            icon={<HandCoins className="h-6 w-6 text-gray-400" />}
            text="Todavía no hay pagos registrados."
            description="Con “Nuevo pago” pagás comprobantes autorizados (estado A) de un proveedor, con uno o varios medios de pago, o le entregás un anticipo."
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="space-y-3 border-b border-gray-100 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  className={`${inputCls} pl-9`}
                  placeholder="Buscar por Nº de proveedor, CUIT o razón social"
                  value={f.q}
                  onChange={(e) => set('q', e.target.value)}
                />
              </div>
              <input
                className={`${inputCls} lg:!w-44`}
                placeholder="Nº de orden de pago"
                value={f.orden}
                onChange={(e) => set('orden', e.target.value)}
                aria-label="Número de orden de pago"
              />
              <input
                className={`${inputCls} lg:!w-48`}
                placeholder="Nº de comprobante"
                value={f.nroComprobante}
                onChange={(e) => set('nroComprobante', e.target.value)}
                aria-label="Número de comprobante cancelado"
              />
              <select
                className={`${inputCls} lg:!w-44`}
                value={f.forma}
                onChange={(e) => set('forma', e.target.value)}
                aria-label="Forma de pago"
              >
                <option value="">Toda forma de pago</option>
                {MEDIOS_PAGO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                className={`${inputCls} lg:!w-40`}
                value={f.estado}
                onChange={(e) => set('estado', e.target.value)}
                aria-label="Estado del pago"
              >
                <option value="">Pagado y anulado</option>
                <option value="pagado">Pagado</option>
                <option value="anulado">Anulado</option>
              </select>
              <ExportarMenu
                onExportar={exportar}
                disabled={visibles.length === 0}
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-4 text-sm font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <FechaRango
                titulo="Fecha de pago"
                desde={f.pagoDesde}
                hasta={f.pagoHasta}
                onDesde={(v) => set('pagoDesde', v)}
                onHasta={(v) => set('pagoHasta', v)}
              />
              <FechaRango
                titulo="Fecha de anulación"
                desde={f.anulDesde}
                hasta={f.anulHasta}
                onDesde={(v) => set('anulDesde', v)}
                onHasta={(v) => set('anulHasta', v)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="text-gray-500">
                {visibles.length} pago{visibles.length === 1 ? '' : 's'}
              </span>
              <span className="text-gray-700">
                Total pagado (sin anulados): <strong>{formatoMoneda(totalPes, 'PES')}</strong>
                {visibles.some((x) => x.moneda === 'DOL') && (
                  <>
                    {' · '}
                    <strong>{formatoMoneda(totalDol, 'DOL')}</strong>
                  </>
                )}
              </span>
              {hayFiltros && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[#175861] hover:underline"
                  onClick={() => setF(SIN_FILTROS)}
                >
                  <FilterX className="h-4 w-4" />
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {visibles.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              No hay pagos que coincidan con los filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                    <th className={th}>Fecha de pago</th>
                    <th className={th}>Nº prov.</th>
                    <th className={th}>CUIT</th>
                    <th className={th}>Razón social</th>
                    <th className={th}>Comprobantes cancelados</th>
                    <th className={`${th} text-right`}>Monto pagado</th>
                    <th className={th}>Forma de pago</th>
                    <th className={th}>Orden de pago</th>
                    <th className={th}>Estado</th>
                    <th className={th}>Fecha de anulación</th>
                    <th className={th}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((x) => {
                    const anulado = x.estado === 'anulado';
                    return (
                      <tr
                        key={x.id}
                        className={`border-b border-gray-100 transition hover:bg-gray-50 ${
                          anulado ? 'text-gray-400' : ''
                        }`}
                      >
                        <td className={td}>{fechaLegible(x.fechaPago)}</td>
                        <td className={td}>{x.proveedorCodigo}</td>
                        <td className={td}>{x.cuit ?? '—'}</td>
                        <td className={`${td} max-w-[14rem] truncate`} title={x.razonSocial}>
                          {x.razonSocial}
                        </td>
                        <td
                          className={`${td} max-w-[20rem] truncate`}
                          title={x.comprobantes || undefined}
                        >
                          {x.tipo === 'anticipo' ? 'Anticipo a proveedor' : x.comprobantes}
                        </td>
                        <td
                          className={`${td} text-right font-medium ${anulado ? 'line-through' : ''}`}
                        >
                          {formatoMoneda(x.montoPagado, x.moneda)}
                        </td>
                        <td className={td}>{x.formas || '—'}</td>
                        <td className={td}>
                          <Link
                            href={`/circuito-de-pagos/${x.id}`}
                            className="font-semibold text-[#175861] hover:underline"
                          >
                            {x.codigo}
                          </Link>
                        </td>
                        <td className={td}>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              anulado ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                            }`}
                          >
                            {estadoPagoLabel(x.estado)}
                          </span>
                        </td>
                        <td className={td}>
                          {x.fechaAnulacion ? formatArgentinaDate(x.fechaAnulacion) : '—'}
                        </td>
                        <td className={td}>
                          {anulado ? (
                            <span className="text-gray-300">—</span>
                          ) : anulando === x.id ? (
                            <span className="flex items-center gap-2">
                              <button
                                type="button"
                                className="rounded-[8px] border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                                disabled={pending}
                                onClick={() => anular(x.id)}
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                className={`${botonSecundario} !px-3 !py-1.5 text-xs`}
                                onClick={() => setAnulando(null)}
                              >
                                Cancelar
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="rounded-[8px] border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => setAnulando(x.id)}
                            >
                              Anular
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FechaRango({
  titulo,
  desde,
  hasta,
  onDesde,
  onHasta,
}: {
  titulo: string;
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600">{titulo}</p>
      <div className="mt-1 flex gap-2">
        <input
          type="date"
          className={`${inputCls} min-w-0`}
          value={desde}
          onChange={(e) => onDesde(e.target.value)}
          aria-label={`${titulo}, desde`}
        />
        <input
          type="date"
          className={`${inputCls} min-w-0`}
          value={hasta}
          onChange={(e) => onHasta(e.target.value)}
          aria-label={`${titulo}, hasta`}
        />
      </div>
    </div>
  );
}
