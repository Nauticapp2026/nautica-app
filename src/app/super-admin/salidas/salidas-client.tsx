'use client';

import { useMemo, useState } from 'react';
import { Download, FilterX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/shared/pagination';
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

// Mismo estilo que un Input shadcn pero para <select> nativo — igual que en
// super-admin/usuarios: mantiene los tokens del design system sin traer los
// wrappers de radix.
const selectCls =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-2 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]';

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
    <div className="space-y-4">
      {/* Buscador + selectores arriba, rango de fechas y acciones abajo. */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            type="search"
            placeholder="Buscar por socio, embarcación o matrícula..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="lg:col-span-2"
          />
          <select
            className={selectCls}
            value={club}
            onChange={(e) => {
              setClub(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por club"
          >
            <option value="">Todos los clubes</option>
            {clubes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por estado"
          >
            {ESTADO_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-semibold">
                Desde
              </label>
              <Input
                type="date"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  setPage(1);
                }}
                className="w-[160px]"
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-semibold">
                Hasta
              </label>
              <Input
                type="date"
                value={hasta}
                onChange={(e) => {
                  setHasta(e.target.value);
                  setPage(1);
                }}
                className="w-[160px]"
              />
            </div>
            {hayFiltros && (
              <Button type="button" variant="outline" onClick={limpiar}>
                <FilterX />
                Limpiar
              </Button>
            )}
          </div>

          <Button asChild>
            <a href={urlExport}>
              <Download />
              Descargar Excel
            </a>
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {filtradas.length} {filtradas.length === 1 ? 'salida' : 'salidas'}
        {hayFiltros && ` de ${salidas.length}`}
        {truncado && ' · se muestran las más recientes; el Excel trae todas'}
      </p>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="text-muted-foreground bg-gray-50 text-left text-xs font-semibold tracking-wider uppercase">
              <tr>
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
            <tbody className="divide-y divide-gray-100">
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-muted-foreground px-4 py-6 text-center text-sm">
                    {salidas.length === 0
                      ? 'Todavía no hay salidas registradas.'
                      : 'Sin resultados.'}
                  </td>
                </tr>
              ) : (
                visibles.map((s) => {
                  const est = estadoSalida(s);
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-3 text-gray-600">{s.club}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-[#101828]">{s.socio}</span>
                        {s.numeroSocio != null && (
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            #{s.numeroSocio}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.embarcacion ?? '—'}</td>
                      <td className="text-muted-foreground px-4 py-3">{s.matricula ?? '—'}</td>
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
                      <td className="text-muted-foreground px-4 py-3">
                        {s.acompanantes.length > 0 ? s.acompanantes.join(', ') : '—'}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                        {s.telefono ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${est.cls}`}
                        >
                          {est.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filtradas.length > PAGE_SIZE && (
          <Pagination
            page={pageSafe}
            totalItems={filtradas.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </Card>
    </div>
  );
}
