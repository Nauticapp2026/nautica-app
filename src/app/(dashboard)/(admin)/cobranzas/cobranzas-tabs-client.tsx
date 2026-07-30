'use client';

import { useMemo, useState } from 'react';
import { Receipt } from 'lucide-react';

import { formatArgentinaDate } from '@/lib/dates';
import { EmptyState } from '@/components/shared/empty-state';
import { CobranzaTabla, type CobranzaRow } from './cobranza-tabla';
import { PaywayCobrosList, type CobroPayway } from './payway-cobros-list';

type TabKey = 'todas' | 'cobranzas' | 'payway';

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
}: {
  cobranzas: CobranzaRow[];
  cobrosPayway: CobroPayway[];
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('todas');

  const filasTodas = useMemo<FilaTodas[]>(() => {
    const deRecibos = cobranzas.map<FilaTodas>((c) => ({
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
    const dePayway = cobrosPayway.map<FilaTodas>((c) => ({
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
  }, [cobranzas, cobrosPayway]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'todas', label: 'Todas', count: filasTodas.length },
    { key: 'cobranzas', label: 'Cobranzas', count: cobranzas.length },
    { key: 'payway', label: 'Débito automático', count: cobrosPayway.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
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
            text="Todavía no hay cobros registrados."
            description="Acá se ven juntos los recibos de cobranza y los cobros por débito automático."
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
      {activeTab === 'cobranzas' && <CobranzaTabla cobranzas={cobranzas} />}
      {activeTab === 'payway' && <PaywayCobrosList cobros={cobrosPayway} />}
    </div>
  );
}
