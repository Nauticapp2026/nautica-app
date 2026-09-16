'use client';

import { useMemo, useState } from 'react';
import { Receipt, Search, X } from 'lucide-react';

import { normalizarBusqueda } from '@/lib/buscador';
import { argYmd, formatArgentinaDate } from '@/lib/dates';
import { EmptyState } from '@/components/shared/empty-state';
import { CobranzaTabla, type CobranzaRow } from './cobranza-tabla';
import type { PeriodoAnulacion } from '@/lib/periodo-anulacion';
import { PaywayCobrosList, type CobroPayway } from './payway-cobros-list';
import { escribirTabEnUrl, type CobranzasTab } from '@/lib/tab-url';

type TabKey = CobranzasTab;

// Fila de la vista unificada "Todas": recibos manuales (RC-) y cobros por
// débito automático juntos, ordenados por fecha. Para el detalle completo de
// cada origen están las otras dos pestañas.
type FilaTodas = {
  id: string;
  fecha: string | null;
  socio: string;
  origen: 'Recibo' | 'Débito automático';
  referencia: string;
  monto: number;
  estadoLabel: string;
  estadoCls: string;
};

function fmtMoney(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PAYWAY_ESTADO: Record<string, { label: string; cls: string }> = {
  aprobado: { label: 'Aprobado', cls: 'bg-teal-50 text-[#175861]' },
  rechazado: { label: 'Rechazado', cls: 'bg-red-50 text-red-700' },
  error: { label: 'Error', cls: 'bg-orange-50 text-orange-700' },
  pendiente: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700' },
};

export function CobranzasTabsClient({
  cobranzas,
  cobrosPayway,
  periodoAnulacion,
  initialTab = 'todas',
}: {
  cobranzas: CobranzaRow[];
  cobrosPayway: CobroPayway[];
  /** Hasta cuándo el club permite anular un recibo (Configuración). */
  periodoAnulacion: PeriodoAnulacion;
  // Pestaña inicial desde el ?tab= (refrescar mantiene la vista).
  initialTab?: TabKey;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Filtros comunes a las tres pestañas (pedido del cliente 2026-09-16): socio
  // (nombre, razón social o nº de socio) y rango de fechas del cobro. Se
  // aplican ANTES de armar cada tabla, así los contadores de las pestañas y la
  // exportación de Cobranzas muestran lo mismo que se ve.
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const hayFiltros = Boolean(busqueda.trim() || desde || hasta);

  function cambiarTab(t: TabKey) {
    setActiveTab(t);
    escribirTabEnUrl(t, 'todas');
  }

  function limpiarFiltros() {
    setBusqueda('');
    setDesde('');
    setHasta('');
  }

  // Día calendario argentino del cobro contra el rango elegido (también en
  // días): un cobro de las 23:30 del 5 en Buenos Aires es del 5, no del 6.
  function enRango(iso: string | null): boolean {
    const dia = argYmd(iso);
    if (!dia) return !desde && !hasta;
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    return true;
  }

  const q = normalizarBusqueda(busqueda);

  const cobranzasFiltradas = useMemo(
    () =>
      cobranzas.filter((c) => {
        if (
          q &&
          !normalizarBusqueda(
            `${c.socioNombre} ${c.socioRazonSocial} ${c.numeroSocio ?? ''}`,
          ).includes(q)
        ) {
          return false;
        }
        return enRango(c.fecha);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enRango solo depende de desde/hasta
    [cobranzas, q, desde, hasta],
  );

  const cobrosFiltrados = useMemo(
    () =>
      cobrosPayway.filter((c) => {
        if (q && !normalizarBusqueda(c.socioNombre).includes(q)) return false;
        return enRango(c.createdAt);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enRango solo depende de desde/hasta
    [cobrosPayway, q, desde, hasta],
  );

  const filasTodas = useMemo<FilaTodas[]>(() => {
    const deRecibos = cobranzasFiltradas.map<FilaTodas>((c) => ({
      id: `rc-${c.id}`,
      fecha: c.fecha,
      socio: c.socioRazonSocial,
      origen: 'Recibo',
      referencia: c.codigo ?? '—',
      // Anulado: el cobro quedó revertido — monto efectivo $0 (igual que la
      // tabla de Cobranzas).
      monto: c.anulada ? 0 : parseFloat(c.importe || '0'),
      estadoLabel: c.anulada ? 'Anulado' : 'Vigente',
      estadoCls: c.anulada ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
    }));
    const dePayway = cobrosFiltrados.map<FilaTodas>((c) => ({
      id: `pw-${c.id}`,
      fecha: c.createdAt,
      socio: c.socioNombre,
      origen: 'Débito automático',
      referencia: '—',
      monto: c.monto / 100,
      estadoLabel: PAYWAY_ESTADO[c.estado]?.label ?? c.estado,
      estadoCls: PAYWAY_ESTADO[c.estado]?.cls ?? 'bg-gray-100 text-gray-600',
    }));
    return [...deRecibos, ...dePayway].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
  }, [cobranzasFiltradas, cobrosFiltrados]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'todas', label: 'Todas', count: filasTodas.length },
    { key: 'cobranzas', label: 'Cobranzas', count: cobranzasFiltradas.length },
    { key: 'payway', label: 'Débito automático', count: cobrosFiltrados.length },
  ];

  // Mismas clases que los filtros de la pestaña Débito automático.
  const inputCls =
    'h-10 rounded-[10px] border border-gray-200 bg-white px-3 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por socio (nombre, razón social o Nº)"
            aria-label="Buscar por socio"
            className={`${inputCls} w-full pl-9`}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500" htmlFor="cobranzas-desde">
            Desde
          </label>
          <input
            id="cobranzas-desde"
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => setDesde(e.target.value)}
            className={inputCls}
          />
          <label className="text-xs font-medium text-gray-500" htmlFor="cobranzas-hasta">
            Hasta
          </label>
          <input
            id="cobranzas-hasta"
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
            className={inputCls}
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

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => cambiarTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === t.key
                ? 'border-b-2 border-[#175861] text-[#175861]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'todas' &&
        (filasTodas.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-6 w-6 text-gray-400" />}
            text={
              hayFiltros
                ? 'Ningún cobro coincide con los filtros.'
                : 'Todavía no hay cobros registrados.'
            }
            description={
              hayFiltros
                ? 'Probá con otro socio u otro rango de fechas.'
                : 'Acá se ven juntos los recibos de cobranza y los cobros por débito automático.'
            }
            className="rounded-2xl border border-gray-200 bg-white"
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Socio</th>
                  <th className="px-4 py-3">Origen</th>
                  <th className="px-4 py-3">Nº de recibo</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filasTodas.map((f) => (
                  <tr key={f.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 text-gray-700">
                      {f.fecha ? formatArgentinaDate(f.fecha) : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#101828]">{f.socio}</td>
                    <td className="px-4 py-3 text-gray-700">{f.origen}</td>
                    <td className="px-4 py-3 text-gray-700">{f.referencia}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#101828]">
                      {fmtMoney(f.monto)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${f.estadoCls}`}
                      >
                        {f.estadoLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {activeTab === 'cobranzas' && (
        <CobranzaTabla
          cobranzas={cobranzasFiltradas}
          periodoAnulacion={periodoAnulacion}
          filtradoExterno={hayFiltros}
        />
      )}
      {activeTab === 'payway' && (
        <PaywayCobrosList cobros={cobrosFiltrados} filtradoExterno={hayFiltros} />
      )}
    </div>
  );
}
