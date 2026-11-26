'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, FilterX, Paperclip, Plus, Receipt, Search } from 'lucide-react';

import { cambiarEstadoComprobantesAction } from '@/app/actions/cuentas-a-pagar';
import { EmptyState } from '@/components/shared/empty-state';
import { ExportarMenu } from '@/components/shared/exportar-menu';
import { botonPrimario, botonSecundario, inputCls, useAccion } from '@/components/shared/form-ui';
import { normalizarBusqueda } from '@/lib/buscador';
import {
  ESTADOS_CP,
  TIPOS_COMPROBANTE,
  claseEstadoCp,
  formatoImporte,
  formatoMoneda,
  labelEstadoCp,
  numeroCompleto,
} from '@/lib/cuentas-a-pagar/constantes';
import type { FilaComprobante } from '@/lib/cuentas-a-pagar/consultas';
import {
  COLUMNAS_COMPLETAS,
  COLUMNAS_PDF,
  filaCompleta,
  filaPdf,
} from '@/lib/cuentas-a-pagar/exportar';
import { fechaLegible } from '@/lib/documentacion-fechas';
import { exportarTabla, type FormatoExportacion } from '@/lib/exportar-tabla';

type Filtros = {
  q: string;
  estado: string;
  estadoPago: string;
  tipo: string;
  concepto: string;
  adjunto: string;
  emisionDesde: string;
  emisionHasta: string;
  ingresoDesde: string;
  ingresoHasta: string;
  pagoDesde: string;
  pagoHasta: string;
  brutoDesde: string;
  brutoHasta: string;
};

const SIN_FILTROS: Filtros = {
  q: '',
  estado: '',
  estadoPago: '',
  tipo: '',
  concepto: '',
  adjunto: '',
  emisionDesde: '',
  emisionHasta: '',
  ingresoDesde: '',
  ingresoHasta: '',
  pagoDesde: '',
  pagoHasta: '',
  brutoDesde: '',
  brutoHasta: '',
};

const th = 'px-3 py-3 font-semibold whitespace-nowrap';
const td = 'px-3 py-3 whitespace-nowrap';

function aNumero(v: string): number | null {
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
}

export function CuentasClient({ filas }: { filas: FilaComprobante[] }) {
  const [f, setF] = useState<Filtros>(SIN_FILTROS);
  const [masFiltros, setMasFiltros] = useState(false);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const { pending, ejecutar } = useAccion();

  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setF((x) => ({ ...x, [k]: v }));

  const conceptos = useMemo(
    () => [...new Set(filas.map((x) => x.concepto).filter((c): c is string => !!c))].sort(),
    [filas],
  );

  const visibles = useMemo(() => {
    const n = normalizarBusqueda(f.q);
    const bd = aNumero(f.brutoDesde);
    const bh = aNumero(f.brutoHasta);
    return filas.filter((x) => {
      if (f.estado && x.estado !== f.estado) return false;
      if (f.estadoPago && x.estadoPago !== f.estadoPago) return false;
      if (f.tipo && x.tipo !== f.tipo) return false;
      if (f.concepto && x.concepto !== f.concepto) return false;
      if (f.adjunto === 'si' && !x.adjuntoNombre) return false;
      if (f.adjunto === 'no' && x.adjuntoNombre) return false;
      if (f.emisionDesde && x.fechaEmision < f.emisionDesde) return false;
      if (f.emisionHasta && x.fechaEmision > f.emisionHasta) return false;
      if (f.ingresoDesde && x.fechaIngreso < f.ingresoDesde) return false;
      if (f.ingresoHasta && x.fechaIngreso > f.ingresoHasta) return false;
      if (f.pagoDesde && (!x.fechaPago || x.fechaPago < f.pagoDesde)) return false;
      if (f.pagoHasta && (!x.fechaPago || x.fechaPago > f.pagoHasta)) return false;
      if (bd !== null && Math.abs(x.total) < bd) return false;
      if (bh !== null && Math.abs(x.total) > bh) return false;
      if (!n) return true;
      return normalizarBusqueda(
        `${x.codigo} ${x.proveedorCodigo} ${x.razonSocial} ${x.cuit ?? ''} ${numeroCompleto(
          x.puntoVenta,
          x.numeroComprobante,
        )} ${x.concepto ?? ''}`,
      ).includes(n);
    });
  }, [filas, f]);

  const hayFiltros = JSON.stringify(f) !== JSON.stringify(SIN_FILTROS);

  // Saldo a pagar de lo que se está viendo (en cada moneda: no se suman pesos con dólares).
  const saldoPes = visibles.filter((x) => x.moneda === 'PES').reduce((s, x) => s + x.saldo, 0);
  const saldoDol = visibles.filter((x) => x.moneda === 'DOL').reduce((s, x) => s + x.saldo, 0);

  const idsVisibles = visibles.map((x) => x.id);
  const todosElegidos = idsVisibles.length > 0 && idsVisibles.every((id) => elegidos.has(id));
  const elegidosEnVista = idsVisibles.filter((id) => elegidos.has(id));

  function alternar(id: string) {
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function alternarTodos() {
    setElegidos((s) => {
      const n = new Set(s);
      if (todosElegidos) idsVisibles.forEach((id) => n.delete(id));
      else idsVisibles.forEach((id) => n.add(id));
      return n;
    });
  }

  function cambiar(destino: 'A' | 'H') {
    ejecutar(
      () => cambiarEstadoComprobantesAction({ ids: elegidosEnVista, destino }),
      destino === 'A'
        ? 'Comprobantes autorizados para pagar (A).'
        : 'Comprobantes devueltos a ingresados (H).',
      () => setElegidos(new Set()),
    );
  }

  const exportar = (formato: FormatoExportacion) =>
    exportarTabla(formato, {
      nombre: 'cuentas-a-pagar',
      titulo: 'Cuentas a pagar',
      columnas: formato === 'pdf' ? COLUMNAS_PDF : COLUMNAS_COMPLETAS,
      filas: visibles.map(formato === 'pdf' ? filaPdf : filaCompleta),
    });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Cuentas a pagar</h1>
          <p className="page-subtitle mt-1">Comprobantes de proveedores</p>
        </div>
        <Link href="/cuentas-a-pagar/nuevo" className={botonPrimario}>
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Nuevo comprobante
          </span>
        </Link>
      </div>

      {filas.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <EmptyState
            icon={<Receipt className="h-6 w-6 text-gray-400" />}
            text="Todavía no hay comprobantes cargados."
            description="Con “Nuevo comprobante” cargás una factura, nota de crédito o de débito de un proveedor del Maestro de Proveedores."
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
                  placeholder="Buscar por proveedor, CUIT, Nº de proveedor, Nº de comprobante o imputación"
                  value={f.q}
                  onChange={(e) => set('q', e.target.value)}
                />
              </div>
              <select
                className={`${inputCls} lg:!w-48`}
                value={f.estado}
                onChange={(e) => set('estado', e.target.value)}
                aria-label="Estado del comprobante"
              >
                <option value="">Todos los estados</option>
                {ESTADOS_CP.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
              <select
                className={`${inputCls} lg:!w-44`}
                value={f.estadoPago}
                onChange={(e) => set('estadoPago', e.target.value)}
                aria-label="Estado de pago"
              >
                <option value="">Pendiente y pagado</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Pagado">Pagado</option>
              </select>
              <button
                type="button"
                className={botonSecundario}
                onClick={() => setMasFiltros((v) => !v)}
                aria-expanded={masFiltros}
              >
                <span className="inline-flex items-center gap-1.5">
                  Más filtros
                  <ChevronDown className={`h-4 w-4 transition ${masFiltros ? 'rotate-180' : ''}`} />
                </span>
              </button>
              <ExportarMenu
                onExportar={exportar}
                disabled={visibles.length === 0}
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-4 text-sm font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50"
              />
            </div>

            {masFiltros && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="block text-xs font-medium text-gray-600">
                  Tipo de comprobante
                  <select
                    className={`${inputCls} mt-1`}
                    value={f.tipo}
                    onChange={(e) => set('tipo', e.target.value)}
                  >
                    <option value="">Todos</option>
                    {TIPOS_COMPROBANTE.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label} – {t.value}
                      </option>
                    ))}
                    <option value="ANT">Anticipo a proveedor</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  Imputación contable
                  <select
                    className={`${inputCls} mt-1`}
                    value={f.concepto}
                    onChange={(e) => set('concepto', e.target.value)}
                  >
                    <option value="">Todas</option>
                    {conceptos.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  Adjunto
                  <select
                    className={`${inputCls} mt-1`}
                    value={f.adjunto}
                    onChange={(e) => set('adjunto', e.target.value)}
                  >
                    <option value="">Con y sin adjunto</option>
                    <option value="si">Con adjunto</option>
                    <option value="no">Sin adjunto</option>
                  </select>
                </label>
                <div className="hidden lg:block" />
                <RangoFechas
                  titulo="Fecha de comprobante"
                  desde={f.emisionDesde}
                  hasta={f.emisionHasta}
                  onDesde={(v) => set('emisionDesde', v)}
                  onHasta={(v) => set('emisionHasta', v)}
                />
                <RangoFechas
                  titulo="Fecha de ingreso"
                  desde={f.ingresoDesde}
                  hasta={f.ingresoHasta}
                  onDesde={(v) => set('ingresoDesde', v)}
                  onHasta={(v) => set('ingresoHasta', v)}
                />
                <RangoFechas
                  titulo="Fecha de pago"
                  desde={f.pagoDesde}
                  hasta={f.pagoHasta}
                  onDesde={(v) => set('pagoDesde', v)}
                  onHasta={(v) => set('pagoHasta', v)}
                />
                <div>
                  <p className="text-xs font-medium text-gray-600">Monto bruto</p>
                  <div className="mt-1 flex gap-2">
                    <input
                      className={inputCls}
                      inputMode="decimal"
                      placeholder="Desde"
                      value={f.brutoDesde}
                      onChange={(e) => set('brutoDesde', e.target.value)}
                    />
                    <input
                      className={inputCls}
                      inputMode="decimal"
                      placeholder="Hasta"
                      value={f.brutoHasta}
                      onChange={(e) => set('brutoHasta', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="text-gray-500">
                {visibles.length} comprobante{visibles.length === 1 ? '' : 's'}
              </span>
              <span className="text-gray-700">
                Saldo a pagar: <strong>{formatoMoneda(saldoPes, 'PES')}</strong>
                {visibles.some((x) => x.moneda === 'DOL') && (
                  <>
                    {' · '}
                    <strong>{formatoMoneda(saldoDol, 'DOL')}</strong>
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
              {elegidosEnVista.length > 0 && (
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <span className="text-gray-600">{elegidosEnVista.length} seleccionados</span>
                  <button
                    type="button"
                    className={botonPrimario}
                    disabled={pending}
                    onClick={() => cambiar('A')}
                  >
                    Pasar a A (autorizar)
                  </button>
                  <button
                    type="button"
                    className={botonSecundario}
                    disabled={pending}
                    onClick={() => cambiar('H')}
                  >
                    Volver a H
                  </button>
                </span>
              )}
            </div>
          </div>

          {visibles.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              No hay comprobantes que coincidan con los filtros.
            </p>
          ) : (
            <div className="scroll-x-hint overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                    <th className={th}>
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={todosElegidos}
                        onChange={alternarTodos}
                      />
                    </th>
                    <th className={th}>Adj.</th>
                    <th className={th}>Nº</th>
                    <th className={th}>Nº prov.</th>
                    <th className={th}>CUIT</th>
                    <th className={th}>Razón social</th>
                    <th className={th}>F. comprobante</th>
                    <th className={th}>Tipo</th>
                    <th className={th}>F. ingreso</th>
                    <th className={th}>Nro. comprobante</th>
                    <th className={`${th} text-right`}>Monto neto</th>
                    <th className={`${th} text-right`}>IVA</th>
                    <th className={`${th} text-right`}>Perc. IIBB</th>
                    <th className={`${th} text-right`}>Otros imp.</th>
                    <th className={`${th} text-right`}>Monotributo</th>
                    <th className={`${th} text-right`}>Monto bruto</th>
                    <th className={th}>Estado de pago</th>
                    <th className={th}>F. de pago</th>
                    <th className={th}>Imputación contable</th>
                    <th className={th}>Estado</th>
                    <th className={`${th} text-right`}>Saldo a pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((x) => (
                    <tr
                      key={x.id}
                      className={`border-b border-gray-100 transition hover:bg-gray-50 ${
                        x.estado === 'X' ? 'text-gray-400' : ''
                      }`}
                    >
                      <td className={td}>
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${x.codigo}`}
                          checked={elegidos.has(x.id)}
                          onChange={() => alternar(x.id)}
                        />
                      </td>
                      <td className={td}>
                        {x.adjuntoUrl ? (
                          <a
                            href={x.adjuntoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={x.adjuntoNombre ?? 'Ver adjunto'}
                            className="text-[#175861] hover:text-[#0f4249]"
                          >
                            <Paperclip className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className={td}>
                        <Link
                          href={`/cuentas-a-pagar/${x.id}`}
                          className="font-semibold text-[#175861] hover:underline"
                        >
                          {x.codigo}
                        </Link>
                      </td>
                      <td className={td}>{x.proveedorCodigo}</td>
                      <td className={td}>{x.cuit ?? '—'}</td>
                      <td className={`${td} max-w-[16rem] truncate`} title={x.razonSocial}>
                        {x.razonSocial}
                      </td>
                      <td className={td}>{fechaLegible(x.fechaEmision)}</td>
                      <td className={td}>{x.tipoLabel}</td>
                      <td className={td}>{fechaLegible(x.fechaIngreso)}</td>
                      <td className={td}>{numeroCompleto(x.puntoVenta, x.numeroComprobante)}</td>
                      <td className={`${td} text-right`}>{formatoImporte(x.neto)}</td>
                      <td className={`${td} text-right`}>{formatoImporte(x.iva)}</td>
                      <td className={`${td} text-right`}>{formatoImporte(x.percepcionesIibb)}</td>
                      <td className={`${td} text-right`}>{formatoImporte(x.otrosTributos)}</td>
                      <td className={`${td} text-right`}>{formatoImporte(x.monotributo)}</td>
                      <td className={`${td} text-right font-medium`}>
                        {formatoMoneda(x.total, x.moneda)}
                      </td>
                      <td className={td}>{x.estadoPago}</td>
                      <td className={td}>{x.fechaPago ? fechaLegible(x.fechaPago) : '—'}</td>
                      <td className={td}>{x.concepto ?? '—'}</td>
                      <td className={td}>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${claseEstadoCp(x.estado)}`}
                          title={labelEstadoCp(x.estado)}
                        >
                          {x.estado}
                        </span>
                      </td>
                      <td className={`${td} text-right font-semibold`}>
                        {formatoMoneda(x.saldo, x.moneda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RangoFechas({
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
