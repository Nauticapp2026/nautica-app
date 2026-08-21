'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, Send, Trash2, Users } from 'lucide-react';

import {
  contarDestinatariosAreasAction,
  enviarMailAreaAction,
} from '@/app/actions/comunicaciones-mails';
import { formatArgentinaDateTime } from '@/lib/dates';
import { EmptyState } from '@/components/shared/empty-state';

export type AreaOption = { id: string; nombre: string; espacios: number };

export type EnvioMail = {
  id: string;
  asunto: string;
  cuerpo: string;
  areaNombres: string[];
  destinatarios: number;
  enviados: number;
  createdAt: string;
  autor: string | null;
};

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none';

/**
 * Mails masivos a los socios de un área de espacios.
 *
 * El conteo de destinatarios se pide al server cada vez que cambian las áreas:
 * quién ocupa cada espacio es dato del server y no se puede derivar acá sin
 * traerse todos los espacios.
 */
export function MailsClient({ areas, envios }: { areas: AreaOption[]; envios: EnvioMail[] }) {
  const router = useRouter();
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(() => new Set());
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [destinatarios, setDestinatarios] = useState<number | null>(null);
  const [contando, setContando] = useState(false);
  const [enviando, startEnviando] = useTransition();

  const areaIds = useMemo(() => [...seleccionadas], [seleccionadas]);

  // El conteo se dispara al tildar, no desde un efecto: quién ocupa cada
  // espacio es dato del server y no se puede derivar acá. `pedidoRef` descarta
  // la respuesta de una selección vieja que llegue tarde y pisaría la actual.
  const pedidoRef = useRef(0);

  function recontar(ids: string[]) {
    if (ids.length === 0) {
      pedidoRef.current++;
      setDestinatarios(null);
      setContando(false);
      return;
    }
    const pedido = ++pedidoRef.current;
    setContando(true);
    contarDestinatariosAreasAction(ids)
      .then((res) => {
        if (pedido !== pedidoRef.current) return;
        setDestinatarios(res.error ? null : (res.total ?? 0));
      })
      .finally(() => {
        if (pedido === pedidoRef.current) setContando(false);
      });
  }

  function toggleArea(id: string) {
    const next = new Set(seleccionadas);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSeleccionadas(next);
    recontar([...next]);
  }

  const puedeEnviar =
    areaIds.length > 0 &&
    asunto.trim().length > 0 &&
    cuerpo.trim().length > 0 &&
    (destinatarios ?? 0) > 0 &&
    !enviando;

  function handleEnviar() {
    const total = destinatarios ?? 0;
    if (
      !confirm(
        total === 1
          ? '¿Enviar el mail a 1 socio? No se puede deshacer.'
          : `¿Enviar el mail a ${total} socios? No se puede deshacer.`,
      )
    ) {
      return;
    }
    startEnviando(async () => {
      const res = await enviarMailAreaAction({
        areaIds,
        asunto: asunto.trim(),
        cuerpo: cuerpo.trim(),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const ok = res.enviados ?? 0;
      const total = res.destinatarios ?? 0;
      if (ok === total) {
        toast.success(`Mail enviado a ${ok} socio${ok === 1 ? '' : 's'}.`);
      } else {
        toast.error(`Salieron ${ok} de ${total}. Revisá el historial.`);
      }
      setAsunto('');
      setCuerpo('');
      setSeleccionadas(new Set());
      setDestinatarios(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-base font-bold text-[#101828]">Nuevo mail</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Le llega a los socios que tienen un espacio en las áreas que elijas. Un socio con espacios
          en varias áreas recibe un solo mail.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Áreas</label>
            {areas.length === 0 ? (
              <p className="text-sm text-gray-400">
                Este club todavía no tiene áreas de espacios cargadas.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {areas.map((a) => (
                  <label
                    key={a.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2.5 text-sm transition ${
                      seleccionadas.has(a.id)
                        ? 'border-[#175861] bg-[#D9EBE9] text-[#175861]'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#175861]"
                      checked={seleccionadas.has(a.id)}
                      onChange={() => toggleArea(a.id)}
                    />
                    <span className="flex-1 truncate">{a.nombre}</span>
                    <span className="text-xs text-gray-400">{a.espacios}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {areaIds.length > 0 && (
            <div className="flex items-center gap-2 rounded-[10px] border border-[#C2DCDA] bg-[#D9EBE9] px-3 py-2.5 text-sm text-[#175861]">
              <Users className="h-4 w-4 shrink-0" />
              {contando ? (
                <span>Calculando destinatarios…</span>
              ) : destinatarios === 0 ? (
                <span>
                  Ningún socio con email ocupa un espacio en esas áreas, así que no hay a quién
                  enviarle.
                </span>
              ) : (
                <span>
                  Le va a llegar a <span className="font-semibold">{destinatarios}</span> socio
                  {destinatarios === 1 ? '' : 's'}.
                </span>
              )}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Asunto</label>
            <input
              className={inputCls}
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              maxLength={200}
              placeholder="Ej. Corte de agua el jueves en la Nave Seca A"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Mensaje</label>
            <textarea
              className={`${inputCls} h-40 py-3`}
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              maxLength={5000}
              placeholder="Escribí el mensaje como se lo querés mandar al socio."
            />
            <p className="mt-1 text-xs text-gray-400">
              {cuerpo.length}/5000 · El mail sale con el logo y el nombre del club.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleEnviar}
              disabled={!puedeEnviar}
              className="flex items-center gap-2 rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-base font-bold text-[#101828]">Enviados</h2>
        {envios.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white">
            <EmptyState
              icon={<Mail className="h-7 w-7 opacity-40" />}
              text="Todavía no mandaste ningún mail."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {envios.map((e) => (
              <EnvioCard key={e.id} envio={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EnvioCard({ envio }: { envio: EnvioMail }) {
  const router = useRouter();
  const [borrando, startBorrando] = useTransition();
  const parcial = envio.enviados < envio.destinatarios;

  function handleBorrar() {
    if (
      !confirm('¿Borrar este envío del historial? El mail ya salió, esto solo borra el registro.')
    )
      return;
    startBorrando(async () => {
      const { deleteEnvioMailAction } = await import('@/app/actions/comunicaciones-mails');
      const res = await deleteEnvioMailAction(envio.id);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <article
      className={`rounded-2xl border border-gray-200 bg-white p-5 ${borrando ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-[#101828]">{envio.asunto}</h3>
          <p className="mt-1 text-sm whitespace-pre-line text-gray-600">{envio.cuerpo}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {envio.areaNombres.map((n, i) => (
              <span
                key={`${n}-${i}`}
                className="inline-flex rounded-md bg-[#D9EBE9] px-2 py-0.5 text-xs font-semibold text-[#175861]"
              >
                {n}
              </span>
            ))}
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                parcial ? 'bg-amber-50 text-amber-700' : 'bg-[#ECFDF3] text-[#027A48]'
              }`}
            >
              {parcial
                ? `${envio.enviados} de ${envio.destinatarios} enviados`
                : `${envio.enviados} enviado${envio.enviados === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-xs text-gray-400">
          {formatArgentinaDateTime(envio.createdAt)}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <p className="text-xs" style={{ color: '#669E9D' }}>
          Por: {envio.autor ?? '—'}
        </p>
        <button
          type="button"
          onClick={handleBorrar}
          disabled={borrando}
          className="flex items-center gap-1 rounded-[8px] border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Borrar
        </button>
      </div>
    </article>
  );
}
