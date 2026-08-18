'use client';

import { useMemo, useState } from 'react';
import { Anchor, Download, FilterX, Search } from 'lucide-react';

import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { TablaScrollX } from '@/components/shared/tabla-scroll-x';
import { normalizarBusqueda } from '@/lib/buscador';
import { formatArgentinaDateTime, formatNaiveDateTime } from '@/lib/dates';

export type SalidaRow = {
  id: string;
  club: string;
  socio: string;
  numeroSocio: number | null;
  telefono: string | null;
  embarcacion: string | null;
  matricula: string | null;
  /** Hora naive: los dígitos que tipeó el socio (ver lib/dates). */
  desde: string | null;
  /** Hora naive. */
  hasta: string | null;
  /** timestamptz real. */
  ingresoEn: string | null;
  /** timestamptz real. */
  arribadaEn: string | null;
  estado: string | null;
  acompanantes: string[];
};

const PAGE_SIZE = 25;

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

/**
 * Estado de la salida tal como lo necesita Prefectura: importa si la
 * embarcación está AFUERA ahora mismo, no el estado interno del QR.
 */
function estadoSalida(s: SalidaRow): { label: string; cls: string } {
  if (s.estado === 'revocado') return { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500' };
  if (s.arribadaEn) return { label: 'Arribó', cls: 'bg-[#ECFDF3] text-[#027A48]' };
  if (s.ingresoEn) return { label: 'Navegando', cls: 'bg-blue-50 text-blue-700' };
  return { label: 'Programada', cls: 'bg-amber-50 text-amber-700' };
}

const ESTADO_OPTS = [
  { value: '', label: 'Todos los estados' },
  { value: 'navegando', label: 'Navegando' },
  { value: 'arribo', label: 'Arribó' },
  { value: 'programada', label: 'Programada' },
  { value: 'cancelada', label: 'Cancelada' },
];

function claveEstado(s: SalidaRow): string {
  if (s.estado === 'revocado') return 'cancelada';
  if (s.arribadaEn) return 'arribo';
  if (s.ingresoEn) return 'navegando';
  return 'programada';
}

export function SalidasClient({
  salidas,
  clubes,
  truncado,
}: {
  salidas: SalidaRow[];
  clubes: string[];
  truncado: boolean;
}) {
  const [query, setQuery] = useState('');
  const [club, setClub] = useState('');
  const [estado, setEstado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);

  const filtradas = useMemo(() => {
    const q = normalizarBusqueda(query.trim());
    return salidas.filter((s) => {
      if (club && s.club !== club) return false;
      if (estado && claveEstado(s) !== estado) return false;
      // El rango se compara sobre la fecha de la salida (naive: los primeros
      // 10 caracteres ya son YYYY-MM-DD, sin riesgo de corrimiento por TZ).
      const fecha = s.desde?.slice(0, 10) ?? '';
      if (desde && (!fecha || fecha < desde)) return false;
      if (hasta && (!fecha || fecha > hasta)) return false;
      if (!q) return true;
      // Un solo buscador para socio, embarcación, matrícula, Nº socio y
      // acompañantes: es como se busca en un libro de guardia.
      return normalizarBusqueda(
        [
          s.socio,
          s.embarcacion ?? '',
          s.matricula ?? '',
          s.numeroSocio != null ? `#${s.numeroSocio}` : '',
          s.acompanantes.join(' '),
        ].join(' '),
      ).includes(q);
    });
  }, [salidas, query, club, estado, desde, hasta]);

  const pageCount = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const visibles = filtradas.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const hayFiltros = Boolean(query || club || estado || desde || hasta);

  function limpiar() {
    setQuery('');
    setClub('');
    setEstado('');
    setDesde('');
    setHasta('');
    setPage(1);
  }

  // El Excel lo arma el server con los MISMOS filtros que están aplicados en
  // pantalla, y sin el tope de filas de la tabla.
  const urlExport = (() => {
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    if (club) p.set('club', club);
    if (estado) p.set('estado', estado);
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    const qs = p.toString();
    return `/api/super-admin/salidas/export${qs ? `?${qs}` : ''}`;
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Salidas</h1>
          <p className="page-subtitle mt-1">
            Todas las salidas registradas en los clubes de la plataforma.
          </p>
        </div>
        <a
          href={urlExport}
          className="flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249]"
        >
          <Download className="h-4 w-4" />
          Descargar Excel
        </a>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Socio, embarcación, matrícula…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className={inputCls}
          value={club}
          onChange={(e) => {
            setClub(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos los clubes</option>
          {clubes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value);
            setPage(1);
          }}
        >
          {ESTADO_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="date"
            className={inputCls}
            value={desde}
            onChange={(e) => {
              setDesde(e.target.value);
              setPage(1);
            }}
            title="Desde"
          />
          <input
            type="date"
            className={inputCls}
            value={hasta}
            onChange={(e) => {
              setHasta(e.target.value);
              setPage(1);
            }}
            title="Hasta"
          />
          {hayFiltros && (
            <button
              type="button"
              onClick={limpiar}
              title="Limpiar filtros"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              <FilterX className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {filtradas.length} {filtradas.length === 1 ? 'salida' : 'salidas'}
        {hayFiltros && ` (de ${salidas.length})`}
        {truncado && ' · se muestran las más recientes; el Excel trae todas'}
      </p>

      {filtradas.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <EmptyState
            icon={<Anchor className="h-7 w-7 opacity-40" />}
            text={
              salidas.length === 0
                ? 'Todavía no hay salidas registradas.'
                : 'Sin resultados con los filtros aplicados.'
            }
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <TablaScrollX>
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="px-4 py-3">Club</th>
                  <th className="px-4 py-3">Socio</th>
                  <th className="px-4 py-3">Embarcación</th>
                  <th className="px-4 py-3">Matrícula</th>
                  <th className="px-4 py-3">Salida</th>
                  <th className="px-4 py-3">Regreso previsto</th>
                  <th className="px-4 py-3">Arribo</th>
                  <th className="px-4 py-3">A bordo</th>
                  <th className="px-4 py-3">Teléfono</th>
                  <th className="px-4 py-3 text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((s) => {
                  const est = estadoSalida(s);
                  return (
                    <tr
                      key={s.id}
                      className="border-t border-gray-100 transition hover:bg-gray-50/50"
                    >
                      <td className="px-4 py-3 text-gray-600">{s.club}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium" style={{ color: '#101828' }}>
                          {s.socio}
                        </span>
                        {s.numeroSocio != null && (
                          <span className="ml-1.5 text-xs text-gray-400">#{s.numeroSocio}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.embarcacion ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{s.matricula ?? '—'}</td>
                      {/* Naive: se muestran los dígitos tal cual se cargaron. */}
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {s.desde ? formatNaiveDateTime(s.desde) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {s.hasta ? formatNaiveDateTime(s.hasta) : '—'}
                      </td>
                      {/* timestamptz real: se convierte a hora Argentina. */}
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {s.arribadaEn ? formatArgentinaDateTime(s.arribadaEn) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {s.acompanantes.length > 0 ? s.acompanantes.join(', ') : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {s.telefono ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${est.cls}`}
                        >
                          {est.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TablaScrollX>
          <Pagination
            page={pageSafe}
            totalItems={filtradas.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
