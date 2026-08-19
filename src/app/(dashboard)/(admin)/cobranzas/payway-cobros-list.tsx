'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, CreditCard, RefreshCw } from 'lucide-react';

import { reintentarCobroPaywayAction } from '@/app/actions/payway';
import { normalizarBusqueda } from '@/lib/buscador';
import { formatArgentinaDate } from '@/lib/dates';
import { EmptyState } from '@/components/shared/empty-state';
import { PaywayRechazadosModal } from './payway-rechazados-modal';

export type CobroPayway = {
  id: string;
  socioId: string;
  socioNombre: string;
  monto: number; // centavos
  estado: 'aprobado' | 'rechazado' | 'pendiente' | 'error';
  errorMensaje: string | null;
  movimientosIds: string[];
  createdAt: string;
};

const fmtDate = formatArgentinaDate;

function fmtMoney(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const COBRO_ESTADO_BADGE: Record<string, string> = {
  aprobado: 'bg-teal-50 text-[#175861]',
  rechazado: 'bg-red-50 text-red-700',
  error: 'bg-orange-50 text-orange-700',
  pendiente: 'bg-amber-50 text-amber-700',
};

const COBRO_ESTADO_LABEL: Record<string, string> = {
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  error: 'Error',
  pendiente: 'Pendiente',
};

export function PaywayCobrosList({ cobros }: { cobros: CobroPayway[] }) {
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [isPending, startTransition] = useTransition();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [verRechazados, setVerRechazados] = useState(false);
  const router = useRouter();

  // Rechazados/con error, sin aplicar los filtros de la tabla: el modal es para
  // resolverlos todos.
  const rechazados = useMemo(
    () => cobros.filter((c) => c.estado === 'rechazado' || c.estado === 'error'),
    [cobros],
  );

  const filtrados = useMemo(() => {
    return cobros.filter((c) => {
      if (search.trim()) {
        const q = normalizarBusqueda(search);
        if (!normalizarBusqueda(c.socioNombre).includes(q)) return false;
      }
      if (filterEstado && c.estado !== filterEstado) return false;
      return true;
    });
  }, [cobros, search, filterEstado]);

  const totalAprobado = cobros
    .filter((c) => c.estado === 'aprobado')
    .reduce((acc, c) => acc + c.monto / 100, 0);
  const countRechazados = cobros.filter(
    (c) => c.estado === 'rechazado' || c.estado === 'error',
  ).length;

  function handleReintentar(cobro: CobroPayway) {
    setRetryingId(cobro.id);
    startTransition(async () => {
      const res = await reintentarCobroPaywayAction(cobro.id);
      setRetryingId(null);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Cobro aprobado y movimientos marcados como pagados.');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {verRechazados && (
        <PaywayRechazadosModal cobros={rechazados} onClose={() => setVerRechazados(false)} />
      )}
      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Total cobrado</p>
          <p className="mt-1 text-xl font-bold" style={{ color: '#175861' }}>
            {fmtMoney(totalAprobado)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Aprobados</p>
          <p className="mt-1 text-xl font-bold text-[#101828]">
            {cobros.filter((c) => c.estado === 'aprobado').length}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Con error / Rechazados</p>
          <p className="mt-1 text-xl font-bold text-red-600">{countRechazados}</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por socio..."
            className="h-10 flex-1 rounded-[10px] border border-gray-200 bg-white px-4 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
          />
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="h-10 rounded-[10px] border border-gray-200 bg-white px-3 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
          >
            <option value="">Todos los estados</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
            <option value="error">Error</option>
            <option value="pendiente">Pendiente</option>
          </select>
          {/* Atajo a los rechazados agrupados por motivo, con reintento en
              tanda. Solo aparece si hay alguno. */}
          {rechazados.length > 0 && (
            <button
              onClick={() => setVerRechazados(true)}
              title="Ver los cobros rechazados agrupados por motivo y reintentar"
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-red-200 bg-white px-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Rechazados</span>
              <span className="rounded-full bg-red-100 px-1.5 text-xs font-bold">
                {rechazados.length}
              </span>
            </button>
          )}
        </div>

        {filtrados.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="h-7 w-7 opacity-40" />}
            text={
              search || filterEstado
                ? 'No se encontraron cobros con ese criterio.'
                : 'Todavía no hay cobros de débito automático.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-4 py-3">Socio</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-gray-100 transition hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: '#175861' }}>
                      {c.socioNombre}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(c.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: '#101828' }}>
                      {fmtMoney(c.monto / 100)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${COBRO_ESTADO_BADGE[c.estado] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {COBRO_ESTADO_LABEL[c.estado] ?? c.estado}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-gray-400">
                      {c.errorMensaje ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        {(c.estado === 'rechazado' || c.estado === 'error') && (
                          <button
                            onClick={() => handleReintentar(c)}
                            disabled={isPending && retryingId === c.id}
                            title="Reintentar cobro"
                            className="flex items-center gap-1.5 rounded-[6px] border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${isPending && retryingId === c.id ? 'animate-spin' : ''}`}
                            />
                            Reintentar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
