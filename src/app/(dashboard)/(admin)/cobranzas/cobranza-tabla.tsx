'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye } from 'lucide-react';

import { formatArgentinaDate } from '@/lib/dates';
import { anularCobranzaAction } from '@/app/actions/cobranzas';

export type CobranzaRow = {
  id: string;
  codigo: string | null;
  fecha: string | null;
  importe: string;
  anulada: boolean;
  anuladaAt: string | null;
  socioNombre: string;
  numeroSocio: number | null;
};

function fmtMoney(value: string): string {
  return `$${parseFloat(value || '0').toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

export function CobranzaTabla({ cobranzas }: { cobranzas: CobranzaRow[] }) {
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
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
        Todavía no hay cobranzas registradas.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
            <th className="px-4 py-3">Nº cliente</th>
            <th className="px-4 py-3">Nombre</th>
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Nº de recibo</th>
            <th className="px-4 py-3 text-right">Monto</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3 text-right">Acción</th>
          </tr>
        </thead>
        <tbody>
          {cobranzas.map((c) => (
            <tr key={c.id} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-3 text-gray-700">{c.numeroSocio ?? '—'}</td>
              <td className="px-4 py-3 font-medium text-[#101828]">{c.socioNombre}</td>
              <td className="px-4 py-3 text-gray-700">
                {c.fecha ? formatArgentinaDate(c.fecha) : '—'}
              </td>
              <td className="px-4 py-3 text-gray-700">{c.codigo ?? '—'}</td>
              <td className="px-4 py-3 text-right font-semibold text-[#101828]">
                {fmtMoney(c.importe)}
              </td>
              <td className="px-4 py-3">
                {c.anulada ? (
                  <span className="inline-flex flex-col">
                    <span className="inline-flex w-fit items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Anulado
                    </span>
                    {c.anuladaAt && (
                      <span className="mt-0.5 text-xs text-gray-400">
                        {formatArgentinaDate(c.anuladaAt)}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Vigente
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <a
                    href={`/facturacion/recibo/${c.id}`}
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
                      <button
                        onClick={() => setAnulandoId(c.id)}
                        className="rounded-[8px] border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700"
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
  );
}
