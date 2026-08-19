'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Info, Loader2, X } from 'lucide-react';

import { reintentarCobroPaywayAction } from '@/app/actions/payway';
import { formatArgentinaDate } from '@/lib/dates';
import { clasificarRechazoPayway, type CausaRechazoPayway } from './payway-rechazos';
import type { CobroPayway } from './payway-cobros-list';

type ResultadoRetry =
  | { estado: 'reintentando' }
  | { estado: 'ok' }
  | { estado: 'error'; mensaje: string };

function fmtMoney(centavos: number): string {
  return `$${(centavos / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Los cobros rechazados de Payway, agrupados por causa, con reintento en tanda.
 *
 * Diferencia clave con el modal de comprobantes rechazados: acá NO hay nada que
 * editar. La causa está en la tarjeta o en el banco del socio, no en datos
 * nuestros — por eso cada grupo dice si reintentar sirve o si hay que avisarle
 * al socio.
 *
 * El reintento se agrupa POR SOCIO a propósito: reintentarCobroPaywayAction usa
 * el cobro sólo para saber de quién es y vuelve a correr el débito completo del
 * socio para hoy. Si un socio tiene dos cobros rechazados, reintentar los dos
 * dispararía el débito dos veces sobre la misma persona.
 */
export function PaywayRechazadosModal({
  cobros,
  onClose,
}: {
  cobros: CobroPayway[];
  onClose: () => void;
}) {
  const router = useRouter();
  // Arranca vacío: cobrar una tarjeta mueve plata real.
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [resultados, setResultados] = useState<Record<string, ResultadoRetry>>({});
  const [enviando, setEnviando] = useState(false);

  // Un cobro por socio: el más reciente, que es el que representa su deuda
  // vigente. Los demás del mismo socio se muestran pero no se reintentan aparte.
  const porSocio = useMemo(() => {
    const m = new Map<string, { socioId: string; socioNombre: string; cobros: CobroPayway[] }>();
    for (const c of [...cobros].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const g = m.get(c.socioId) ?? {
        socioId: c.socioId,
        socioNombre: c.socioNombre,
        cobros: [],
      };
      g.cobros.push(c);
      m.set(c.socioId, g);
    }
    return m;
  }, [cobros]);

  // Agrupados por causa, usando el rechazo más reciente de cada socio: es el que
  // dice por qué está trabado hoy.
  const grupos = useMemo(() => {
    const m = new Map<
      string,
      {
        causa: CausaRechazoPayway;
        socios: Array<{ socioId: string; socioNombre: string; cobro: CobroPayway; otros: number }>;
      }
    >();
    for (const g of porSocio.values()) {
      const ultimo = g.cobros[0];
      const causa = clasificarRechazoPayway(ultimo.errorMensaje);
      const entry = m.get(causa.id) ?? { causa, socios: [] };
      entry.socios.push({
        socioId: g.socioId,
        socioNombre: g.socioNombre,
        cobro: ultimo,
        otros: g.cobros.length - 1,
      });
      m.set(causa.id, entry);
    }
    return [...m.values()].sort((a, b) => b.socios.length - a.socios.length);
  }, [porSocio]);

  function toggle(socioId: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(socioId)) next.delete(socioId);
      else next.add(socioId);
      return next;
    });
  }

  function toggleGrupo(socios: Array<{ socioId: string }>) {
    const elegibles = socios.filter((s) => resultados[s.socioId]?.estado !== 'ok');
    const todos = elegibles.length > 0 && elegibles.every((s) => seleccion.has(s.socioId));
    setSeleccion((prev) => {
      const next = new Set(prev);
      for (const s of elegibles) {
        if (todos) next.delete(s.socioId);
        else next.add(s.socioId);
      }
      return next;
    });
  }

  async function reintentar() {
    const objetivos = [...porSocio.values()].filter(
      (g) => seleccion.has(g.socioId) && resultados[g.socioId]?.estado !== 'ok',
    );
    if (objetivos.length === 0) return;

    const ok = confirm(
      objetivos.length === 1
        ? '¿Reintentar el débito de 1 socio? Si la tarjeta aprueba, se le cobra de verdad.'
        : `¿Reintentar el débito de ${objetivos.length} socios? A los que aprueben se les cobra de verdad.`,
    );
    if (!ok) return;

    setEnviando(true);
    try {
      for (const g of objetivos) {
        setResultados((prev) => ({ ...prev, [g.socioId]: { estado: 'reintentando' } }));
        const res = await reintentarCobroPaywayAction(g.cobros[0].id);
        setResultados((prev) => ({
          ...prev,
          [g.socioId]: res.error ? { estado: 'error', mensaje: res.error } : { estado: 'ok' },
        }));
      }
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  const seleccionados = [...porSocio.values()].filter(
    (g) => seleccion.has(g.socioId) && resultados[g.socioId]?.estado !== 'ok',
  ).length;
  const aprobados = Object.values(resultados).filter((r) => r.estado === 'ok').length;
  const fallaron = Object.values(resultados).filter((r) => r.estado === 'error').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Cobros rechazados
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {porSocio.size} socio{porSocio.size === 1 ? '' : 's'} con el débito trabado, agrupados
              por motivo.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-t border-gray-200" />

        <div className="mx-6 mt-4 flex gap-2 rounded-[10px] border border-[#C2DCDA] bg-[#D9EBE9] p-3 text-xs text-[#175861]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            El reintento vuelve a correr el débito del socio con lo que tenga pendiente{' '}
            <span className="font-semibold">hoy</span>, no el monto del cobro que falló. Si el socio
            ya pagó por otro medio, no se le cobra de nuevo. Se reintenta un débito por socio.
          </p>
        </div>

        <div className="space-y-4 overflow-y-auto p-6">
          {grupos.map((g) => (
            <section
              key={g.causa.id}
              className="overflow-hidden rounded-[12px] border border-gray-200"
            >
              <header className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      g.causa.reintentarSirve ? 'text-amber-600' : 'text-red-600'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                      {g.causa.titulo}
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        {g.socios.length}
                      </span>
                      {!g.causa.reintentarSirve && (
                        <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                          reintentar no sirve
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">{g.causa.queHacer}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleGrupo(g.socios)}
                    disabled={enviando}
                    className="ml-auto shrink-0 rounded-[8px] border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Todos
                  </button>
                </div>
              </header>

              <ul className="divide-y divide-gray-100">
                {g.socios.map((s) => {
                  const res = resultados[s.socioId];
                  return (
                    <li key={s.socioId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="accent-[#175861] disabled:opacity-30"
                        checked={seleccion.has(s.socioId)}
                        disabled={enviando || res?.estado === 'ok'}
                        onChange={() => toggle(s.socioId)}
                      />
                      <span className="min-w-0 flex-1 truncate" style={{ color: '#101828' }}>
                        {s.socioNombre}
                        {s.otros > 0 && (
                          <span className="ml-1.5 text-xs text-gray-400">
                            +{s.otros} intento{s.otros === 1 ? '' : 's'} anterior
                            {s.otros === 1 ? '' : 'es'}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-gray-600">{fmtMoney(s.cobro.monto)}</span>
                      <span className="w-24 shrink-0 text-xs text-gray-400">
                        {formatArgentinaDate(s.cobro.createdAt)}
                      </span>
                      <span className="w-36 shrink-0 text-right text-xs">
                        {res?.estado === 'reintentando' ? (
                          <span className="inline-flex items-center gap-1 text-gray-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Cobrando…
                          </span>
                        ) : res?.estado === 'ok' ? (
                          <span className="inline-flex items-center gap-1 text-[#027A48]">
                            <Check className="h-3 w-3" />
                            Cobrado
                          </span>
                        ) : res?.estado === 'error' ? (
                          <span className="text-red-600" title={res.mensaje}>
                            No se pudo
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {(aprobados > 0 || fallaron > 0) && (
          <div className="mx-6 mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {aprobados > 0 && (
              <span className="font-semibold text-[#027A48]">{aprobados} cobrado(s). </span>
            )}
            {fallaron > 0 && (
              <span className="font-semibold text-red-600">
                {fallaron} no se pudieron — pasá el mouse por el resultado para ver el motivo.
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-6">
          <p className="text-xs text-gray-500">
            {seleccionados} socio{seleccionados === 1 ? '' : 's'} seleccionado
            {seleccionados === 1 ? '' : 's'}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={enviando}
              className="rounded-[10px] border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={reintentar}
              disabled={enviando || seleccionados === 0}
              className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
            >
              {enviando ? 'Cobrando…' : `Reintentar (${seleccionados})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
