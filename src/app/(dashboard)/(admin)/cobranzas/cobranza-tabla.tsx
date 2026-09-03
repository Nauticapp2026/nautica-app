'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, FileDown, Receipt } from 'lucide-react';

import { formatArgentinaDate } from '@/lib/dates';
import { descargarCsv } from '@/lib/exportar-csv';
import {
  motivoBloqueoAnulacion,
  puedeAnularRecibo,
  type PeriodoAnulacion,
} from '@/lib/periodo-anulacion';
import { EmptyState } from '@/components/shared/empty-state';
import { anularCobranzaAction } from '@/app/actions/cobranzas';

export type CobranzaRow = {
  id: string;
  codigo: string | null;
  fecha: string | null;
  importe: string;
  anulada: boolean;
  anuladaAt: string | null;
  tipoRecibo: 'fiscal' | 'interno' | null;
  socioRazonSocial: string;
  numeroSocio: number | null;
  entreEmisor: string;
  formas: { tipo: string; monto: string }[];
};

function fmtMoney(value: string): string {
  return `$${parseFloat(value || '0').toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

const TIPO_RECIBO_LABEL: Record<string, string> = {
  fiscal: 'Fiscal',
  interno: 'Interno',
};

const TIPO_COBRANZA_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  efectivo_usd: 'Efectivo (USD)',
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta de débito',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  mercado_pago: 'Mercado Pago',
  otro: 'Otro',
};

// Hasta 3 columnas "Instrumento de Cobro N" — si hay más formas, la 3ª
// acumula el resto como "+N más" en vez de agregar columnas de más.
function instrumentoCobro(formas: { tipo: string; monto: string }[], slot: 0 | 1 | 2): string {
  const f = formas[slot];
  if (!f) return '—';
  const label = TIPO_COBRANZA_LABEL[f.tipo] ?? f.tipo;
  if (slot === 2 && formas.length > 3) {
    return `${label} (${fmtMoney(f.monto)}) +${formas.length - 3} más`;
  }
  return `${label} (${fmtMoney(f.monto)})`;
}

export function CobranzaTabla({
  cobranzas,
  periodoAnulacion,
}: {
  cobranzas: CobranzaRow[];
  /** Hasta cuándo el club permite anular (Configuración → Período de anulación). */
  periodoAnulacion: PeriodoAnulacion;
}) {
  const router = useRouter();
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAnular(id: string) {
    startTransition(async () => {
      const res = await anularCobranzaAction(id);
      setAnulandoId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Recibo anulado');
      router.refresh();
    });
  }

  if (cobranzas.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="h-6 w-6 text-gray-400" />}
        text="Todavía no hay cobranzas registradas."
        description="Cuando registres una cobranza con “Nueva cobranza”, va a aparecer acá."
        className="rounded-2xl border border-gray-200 bg-white"
      />
    );
  }

  // Mismas columnas que la tabla, en el mismo orden y con los mismos valores
  // formateados: el CSV tiene que decir lo que el club está viendo. Se excluye
  // "Acción", que es un botón.
  function exportar() {
    descargarCsv(
      'cobranzas',
      [
        'Ente emisor',
        'Tipo de recibo',
        'Nº cliente',
        'Razón social socio',
        'Fecha',
        'Nº de recibo',
        'Monto',
        'Instrumento de cobro 1',
        'Instrumento de cobro 2',
        'Instrumento de cobro 3',
        'Estado',
        'Fecha anulación',
      ],
      cobranzas.map((c) => [
        c.entreEmisor,
        c.tipoRecibo ? (TIPO_RECIBO_LABEL[c.tipoRecibo] ?? c.tipoRecibo) : '—',
        c.numeroSocio != null ? String(c.numeroSocio) : '—',
        c.socioRazonSocial,
        c.fecha ? formatArgentinaDate(c.fecha) : '—',
        c.codigo ?? '—',
        // Igual que la tabla: un recibo anulado quedó revertido, su monto
        // efectivo es $0. Si el CSV dijera el importe original, sumar la columna
        // daría cobrado de más.
        c.anulada ? fmtMoney('0') : fmtMoney(c.importe),
        instrumentoCobro(c.formas, 0),
        instrumentoCobro(c.formas, 1),
        instrumentoCobro(c.formas, 2),
        c.anulada ? 'Anulado' : 'Vigente',
        c.anuladaAt ? formatArgentinaDate(c.anuladaAt) : '—',
      ]),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={exportar}
          title="Exportar CSV"
          className="flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
        >
          <FileDown className="h-4 w-4" />
          <span className="hidden sm:inline">Exportar</span>
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1500px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-3">Ente emisor</th>
              <th className="px-4 py-3">Tipo de recibo</th>
              <th className="px-4 py-3">Nº cliente</th>
              <th className="px-4 py-3">Razón social socio</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Nº de recibo</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3">Instrumento de cobro 1</th>
              <th className="px-4 py-3">Instrumento de cobro 2</th>
              <th className="px-4 py-3">Instrumento de cobro 3</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fecha anulación</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {cobranzas.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-700">{c.entreEmisor}</td>
                <td className="px-4 py-3 text-gray-700">
                  {c.tipoRecibo ? TIPO_RECIBO_LABEL[c.tipoRecibo] : '—'}
                </td>
                <td className="px-4 py-3 text-gray-700">{c.numeroSocio ?? '—'}</td>
                <td className="px-4 py-3 font-medium text-[#101828]">{c.socioRazonSocial}</td>
                <td className="px-4 py-3 text-gray-700">
                  {c.fecha ? formatArgentinaDate(c.fecha) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-700">{c.codigo ?? '—'}</td>
                {/* Anulado: el cobro quedó revertido — el monto efectivo es $0. */}
                <td className="px-4 py-3 text-right font-semibold text-[#101828]">
                  {c.anulada ? fmtMoney('0') : fmtMoney(c.importe)}
                </td>
                <td className="px-4 py-3 text-gray-700">{instrumentoCobro(c.formas, 0)}</td>
                <td className="px-4 py-3 text-gray-700">{instrumentoCobro(c.formas, 1)}</td>
                <td className="px-4 py-3 text-gray-700">{instrumentoCobro(c.formas, 2)}</td>
                <td className="px-4 py-3">
                  {c.anulada ? (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Anulado
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Vigente
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {c.anuladaAt ? formatArgentinaDate(c.anuladaAt) : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <a
                      // `from` para que el visor ofrezca volver a Cobranzas y no a
                      // Ventas (se abre en pestaña nueva: no hay historial).
                      href={`/ventas/recibo/${c.id}?from=cobranzas`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-[8px] border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Ver
                    </a>
                    {!c.anulada &&
                      (anulandoId === c.id ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleAnular(c.id)}
                            disabled={isPending}
                            className="rounded-[8px] bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                          >
                            {isPending ? 'Anulando…' : 'Confirmar'}
                          </button>
                          <button
                            onClick={() => setAnulandoId(null)}
                            disabled={isPending}
                            className="rounded-[8px] border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        // Fuera del período que configuró el club, el botón
                        // queda deshabilitado con el motivo en el tooltip. El
                        // gate real está en el server: la pantalla solo evita
                        // que el club se choque con el error.
                        <button
                          onClick={() => setAnulandoId(c.id)}
                          disabled={!puedeAnularRecibo(c.fecha, periodoAnulacion)}
                          title={
                            puedeAnularRecibo(c.fecha, periodoAnulacion)
                              ? undefined
                              : motivoBloqueoAnulacion(periodoAnulacion)
                          }
                          className="rounded-[8px] border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
                        >
                          Anular recibo
                        </button>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
