'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FileDown, FileSpreadsheet, Landmark, Paperclip, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';

import { normalizarBusqueda } from '@/lib/buscador';
import { exportarTabla } from '@/lib/exportar-tabla';
import { generarCierreCajaPdf, textoPeriodo } from '@/lib/tesoreria-cierre-pdf';
import { INSTRUMENTOS, labelInstrumento, type Instrumento } from '@/lib/tesoreria/instrumentos';
import type {
  FiltrosTesoreria,
  LineaTesoreria,
  ResumenInstrumento,
} from '@/lib/tesoreria/movimientos';
import { crearMovimientoTesoreriaAction } from '@/app/actions/tesoreria';
import { EmptyState } from '@/components/shared/empty-state';
import { Field, inputCls } from '@/components/shared/forma-pago';

export type LineaTesoreriaUI = LineaTesoreria & { adjuntoUrl: string | null };

type Props = {
  lineas: LineaTesoreriaUI[];
  resumen: ResumenInstrumento[];
  consolidado: ResumenInstrumento;
  rubros: string[];
  subrubros: string[];
  filtros: FiltrosTesoreria;
  hoy: string;
  club: { nombre: string; cuit: string | null; direccion: string | null };
};

function fmtMoney(value: number): string {
  const abs = Math.abs(value).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-$${abs}` : `$${abs}`;
}

function ymdALegible(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

// Mismas clases que los filtros de Cobranzas (cobranzas-tabs-client.tsx).
const filtroCls =
  'h-10 rounded-[10px] border border-gray-200 bg-white px-3 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none';
// Mismas clases que el disparador de ExportarMenu.
const botonExportCls =
  'flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40';

const TODOS: Instrumento[] = INSTRUMENTOS.map((i) => i.value as Instrumento);

export function TesoreriaClient({
  lineas,
  resumen,
  consolidado,
  rubros,
  subrubros,
  filtros,
  hoy,
  club,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // ── Filtros → URL (el server recalcula saldos con el rango exacto) ───────
  function aplicarFiltros(next: Partial<FiltrosTesoreria>) {
    const f = { ...filtros, ...next };
    const params = new URLSearchParams();
    // `desde` siempre viaja: vacío = "desde el primer movimiento"; ausente = hoy.
    params.set('desde', f.desde ?? '');
    if (f.hasta) params.set('hasta', f.hasta);
    if (f.instrumentos.length !== TODOS.length) params.set('inst', f.instrumentos.join(','));
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  function toggleInstrumento(value: Instrumento) {
    const activo = filtros.instrumentos.includes(value);
    if (activo && filtros.instrumentos.length === 1) {
      toast.info('Tiene que quedar al menos un instrumento seleccionado.');
      return;
    }
    const next = activo
      ? filtros.instrumentos.filter((i) => i !== value)
      : TODOS.filter((i) => i === value || filtros.instrumentos.includes(i));
    aplicarFiltros({ instrumentos: next });
  }

  const hayFiltros =
    filtros.desde !== hoy ||
    !!filtros.hasta ||
    filtros.instrumentos.length !== TODOS.length ||
    busqueda.trim() !== '';

  function limpiarFiltros() {
    setBusqueda('');
    aplicarFiltros({ desde: hoy, hasta: null, instrumentos: TODOS });
  }

  // ── Búsqueda (lupa), sobre lo que ya trajo el server ─────────────────────
  const q = normalizarBusqueda(busqueda);
  const filtradas = useMemo(() => {
    if (!q) return lineas;
    return lineas.filter((l) =>
      normalizarBusqueda(
        [
          l.numero,
          l.detalle,
          l.rubro ?? '',
          l.subrubro ?? '',
          l.observaciones ?? '',
          labelInstrumento(l.instrumento),
        ].join(' '),
      ).includes(q),
    );
  }, [lineas, q]);

  // ── Exportar ─────────────────────────────────────────────────────────────
  const columnasExport = [
    'Fecha',
    'Nº',
    'Tipo',
    'Detalle',
    'Instrumento',
    'Rubro',
    'Subrubro',
    'Ingreso',
    'Egreso',
    'Saldo',
    'Observaciones',
  ];
  function filasExport(origen: LineaTesoreriaUI[]): string[][] {
    return origen.map((l) => [
      ymdALegible(l.fecha),
      l.numero,
      l.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
      l.detalle,
      labelInstrumento(l.instrumento),
      l.rubro ?? '',
      l.subrubro ?? '',
      l.tipo === 'ingreso' ? fmtMoney(l.monto) : '',
      l.tipo === 'egreso' ? fmtMoney(l.monto) : '',
      fmtMoney(l.saldo),
      l.observaciones ?? '',
    ]);
  }

  const [exportando, setExportando] = useState<'xlsx' | 'pdf' | null>(null);

  async function descargarExcel() {
    setExportando('xlsx');
    try {
      await exportarTabla('xlsx', {
        nombre: 'tesoreria',
        titulo: `Tesorería · ${textoPeriodo(filtros)}`,
        columnas: columnasExport,
        filas: filasExport(filtradas),
      });
    } catch {
      toast.error('No se pudo generar el Excel.');
    } finally {
      setExportando(null);
    }
  }

  async function descargarCierre() {
    setExportando('pdf');
    try {
      const fila = (r: ResumenInstrumento) => ({
        instrumento:
          r.instrumento === 'consolidado' ? 'Consolidado' : labelInstrumento(r.instrumento),
        saldoInicial: fmtMoney(r.saldoInicial),
        ingresos: fmtMoney(r.ingresos),
        egresos: fmtMoney(r.egresos),
        saldoFinal: fmtMoney(r.saldoFinal),
      });
      // El cierre lleva el período completo (sin la búsqueda): es un documento
      // contable, no "lo que estoy mirando".
      await generarCierreCajaPdf({
        club,
        periodo: { desde: filtros.desde, hasta: filtros.hasta },
        resumen: resumen.map(fila),
        consolidado: fila(consolidado),
        columnas: columnasExport.slice(0, 10),
        filas: filasExport(lineas).map((f) => f.slice(0, 10)),
      });
    } catch {
      toast.error('No se pudo generar el PDF.');
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Tesorería</h1>
          <p className="page-subtitle">
            Caja del club por instrumento: cobranzas, retiros, gastos y depósitos.
          </p>
        </div>
        <div>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: '#175861' }}
          >
            <Plus className="h-4 w-4" />
            Nuevo movimiento
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* ── Filtros ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por detalle, Nº, rubro u observaciones"
              aria-label="Buscar movimientos"
              className={`${filtroCls} w-full pl-9`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-gray-500" htmlFor="tesoreria-desde">
              Desde
            </label>
            <input
              id="tesoreria-desde"
              type="date"
              value={filtros.desde ?? ''}
              max={filtros.hasta || undefined}
              onChange={(e) => aplicarFiltros({ desde: e.target.value || null })}
              className={filtroCls}
            />
            <label className="text-xs font-medium text-gray-500" htmlFor="tesoreria-hasta">
              Hasta
            </label>
            <input
              id="tesoreria-hasta"
              type="date"
              value={filtros.hasta ?? ''}
              min={filtros.desde || undefined}
              onChange={(e) => aplicarFiltros({ hasta: e.target.value || null })}
              className={filtroCls}
            />
            {hayFiltros && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="inline-flex h-10 items-center gap-1 rounded-[10px] border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Limpiar
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Instrumentos</span>
          {INSTRUMENTOS.map((i) => {
            const activo = filtros.instrumentos.includes(i.value as Instrumento);
            return (
              <button
                key={i.value}
                type="button"
                aria-pressed={activo}
                onClick={() => toggleInstrumento(i.value as Instrumento)}
                className={
                  activo
                    ? 'rounded-full border border-[#175861] bg-teal-50 px-3 py-1 text-xs font-medium text-[#175861]'
                    : 'rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-50'
                }
              >
                {i.label}
              </button>
            );
          })}
        </div>

        {/* ── Saldos por instrumento ────────────────────────────────────── */}
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-3">Instrumento</th>
                <th className="px-4 py-3 text-right">Saldo inicial</th>
                <th className="px-4 py-3 text-right">Ingresos</th>
                <th className="px-4 py-3 text-right">Egresos</th>
                <th className="px-4 py-3 text-right">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.instrumento} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-gray-700">{labelInstrumento(r.instrumento)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-gray-700">
                    {fmtMoney(r.saldoInicial)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-[#175861]">
                    {fmtMoney(r.ingresos)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-red-600">
                    {fmtMoney(r.egresos)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-900">
                    {fmtMoney(r.saldoFinal)}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#F4F8F8] font-semibold text-gray-900">
                <td className="px-4 py-3">Consolidado</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {fmtMoney(consolidado.saldoInicial)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-[#175861]">
                  {fmtMoney(consolidado.ingresos)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-red-600">
                  {fmtMoney(consolidado.egresos)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {fmtMoney(consolidado.saldoFinal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Movimientos ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {textoPeriodo(filtros)} · {filtradas.length}{' '}
            {filtradas.length === 1 ? 'movimiento' : 'movimientos'}
            {isPending && ' · actualizando…'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={descargarCierre}
              disabled={exportando !== null}
              title="Cierre de caja en PDF"
              className={botonExportCls}
            >
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">
                {exportando === 'pdf' ? 'Generando…' : 'Cierre de caja (PDF)'}
              </span>
            </button>
            <button
              type="button"
              onClick={descargarExcel}
              disabled={exportando !== null}
              title="Descargar en Excel"
              className={botonExportCls}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">
                {exportando === 'xlsx' ? 'Exportando…' : 'Excel'}
              </span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          {filtradas.length === 0 ? (
            <EmptyState
              icon={<Landmark className="h-6 w-6" />}
              text="Sin movimientos"
              description="No hay cobranzas ni movimientos de caja en el período elegido."
            />
          ) : (
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3">Instrumento</th>
                  <th className="px-4 py-3">Rubro</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Adjunto</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {ymdALegible(l.fecha)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {l.reciboId ? (
                        <Link
                          href={`/ventas/recibo/${l.reciboId}?from=tesoreria`}
                          className="font-medium text-[#175861] hover:underline"
                        >
                          {l.numero}
                        </Link>
                      ) : (
                        <span className="text-gray-700">{l.numero}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      <div>{l.detalle}</div>
                      {l.observaciones && (
                        <div className="mt-0.5 text-xs text-gray-500">{l.observaciones}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {labelInstrumento(l.instrumento)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {l.rubro}
                      {l.subrubro && <span className="text-gray-400"> / {l.subrubro}</span>}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                        l.tipo === 'ingreso' ? 'text-[#175861]' : 'text-red-600'
                      }`}
                    >
                      {l.tipo === 'ingreso' ? '+' : '-'}
                      {fmtMoney(l.monto)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-900">
                      {fmtMoney(l.saldo)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {l.adjuntoUrl ? (
                        <a
                          href={l.adjuntoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={l.adjuntoNombre ?? 'Ver adjunto'}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#175861] hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          Ver
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen && (
        <NuevoMovimientoModal
          hoy={hoy}
          rubros={rubros}
          subrubros={subrubros}
          onClose={() => setModalOpen(false)}
          onCreado={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal "Nuevo movimiento" (misma estructura que "Nueva cobranza") ───────

function NuevoMovimientoModal({
  hoy,
  rubros,
  subrubros,
  onClose,
  onCreado,
}: {
  hoy: string;
  rubros: string[];
  subrubros: string[];
  onClose: () => void;
  onCreado: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [guardando, startGuardar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startGuardar(async () => {
      const res = await crearMovimientoTesoreriaAction(fd);
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(`Movimiento Nº ${res.numero} cargado.`);
      onCreado();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        ref={formRef}
        onSubmit={guardar}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Nuevo movimiento
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Retiros, gastos, depósitos o ingresos que no son cobranzas. Las cobranzas entran solas
              desde los recibos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de movimiento">
              <select name="tipo" required className={inputCls}>
                <option value="ingreso">Ingreso (aumenta la caja)</option>
                <option value="egreso">Egreso (disminuye la caja)</option>
              </select>
            </Field>
            <Field label="Fecha">
              <input
                name="fecha"
                type="date"
                required
                defaultValue={hoy}
                max={hoy}
                className={inputCls}
              />
            </Field>
            <Field label="Instrumento">
              <select name="instrumento" required className={inputCls}>
                {INSTRUMENTOS.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Monto">
              <input
                name="monto"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0,00"
                className={inputCls}
              />
            </Field>
            <Field label="Rubro">
              <input
                name="rubro"
                required
                maxLength={80}
                list="tm-rubros"
                placeholder="Ej. Gastos operativos"
                className={inputCls}
              />
              <datalist id="tm-rubros">
                {rubros.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
            <Field label="Subrubro">
              <input
                name="subrubro"
                required
                maxLength={80}
                list="tm-subrubros"
                placeholder="Ej. Combustible"
                className={inputCls}
              />
              <datalist id="tm-subrubros">
                {subrubros.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Detalle">
                <input
                  name="detalle"
                  required
                  maxLength={200}
                  placeholder="Qué fue este movimiento"
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Observaciones">
                <textarea
                  name="observaciones"
                  required
                  maxLength={1000}
                  rows={2}
                  className="w-full rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#101828] focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Comprobante adjunto">
                <input
                  name="adjunto"
                  type="file"
                  required
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-[10px] file:border file:border-gray-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50"
                />
                <p className="mt-1 text-xs text-gray-400">PDF, JPG, PNG o WebP, hasta 8 MB.</p>
              </Field>
            </div>
          </div>
          {error && (
            <div className="rounded-[10px] border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 p-6">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: '#175861' }}
            >
              {guardando ? 'Guardando…' : 'Guardar movimiento'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
