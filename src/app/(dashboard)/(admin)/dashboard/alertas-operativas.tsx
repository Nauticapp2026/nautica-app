'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, MessageCircle, Ship, X } from 'lucide-react';

import { cerrarPorteriaAction, marcarAlertaResueltaAction } from '@/app/actions/alertas';

export type AlertaOperativa = {
  id: string;
  tipo: 'retorno_proximo' | 'sin_respuesta';
  mensaje: string | null;
  createdAt: string;
  porteriaId: string;
  socioNombre: string;
  socioTelefono: string | null;
  desde: string | null;
  hasta: string | null;
  arribadaEn: string | null;
  embarcacion: string | null;
};

function buildWhatsappUrl(telefono: string | null): string | null {
  if (!telefono) return null;
  const digits = telefono.replace(/\D/g, '');
  if (!digits) return null;
  // wa.me requiere número con código de país y sin '+'. Si no empieza con
  // 54 (Argentina), asumimos número local y prepend.
  const normalized = digits.startsWith('54') ? digits : `54${digits}`;
  return `https://wa.me/${normalized}`;
}

/**
 * Lista de alertas operativas sin wrapper propio — se renderiza dentro de un
 * card existente del dashboard. Separa críticas (sin respuesta) y próximas
 * (retorno próximo) con un subtítulo cada una.
 */
export function AlertasOperativasList({ alertas }: { alertas: AlertaOperativa[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  const { criticas, proximas } = useMemo(() => {
    const criticas: AlertaOperativa[] = [];
    const proximas: AlertaOperativa[] = [];
    for (const a of alertas) {
      if (a.tipo === 'sin_respuesta') criticas.push(a);
      else proximas.push(a);
    }
    return { criticas, proximas };
  }, [alertas]);

  const onResolver = (id: string) => {
    setResolvingId(id);
    startTransition(async () => {
      const res = await marcarAlertaResueltaAction(id);
      setResolvingId(null);
      if (!res.ok) {
        alert(res.error ?? 'No se pudo marcar como resuelta.');
        return;
      }
      router.refresh();
    });
  };

  const onCerrarPorteria = (porteriaId: string) => {
    setClosingId(porteriaId);
    startTransition(async () => {
      const res = await cerrarPorteriaAction(porteriaId);
      setClosingId(null);
      if (!res.ok) {
        alert(res.error ?? 'No se pudo cerrar la salida.');
        return;
      }
      router.refresh();
    });
  };

  if (alertas.length === 0) return <EmptyState />;

  return (
    <div className="space-y-5">
      {criticas.length > 0 && (
        <div>
          <SectionTitle label="Críticas — Sin respuesta del socio" count={criticas.length} />
          <div className="space-y-3">
            {criticas.map((a) => (
              <AlertaCard
                key={a.id}
                alerta={a}
                onResolver={onResolver}
                onCerrarPorteria={onCerrarPorteria}
                loading={pending && resolvingId === a.id}
                closingPorteria={pending && closingId === a.porteriaId}
              />
            ))}
          </div>
        </div>
      )}

      {proximas.length > 0 && (
        <div>
          <SectionTitle label="Retorno próximo — Esperando respuesta" count={proximas.length} />
          <div className="space-y-3">
            {proximas.map((a) => (
              <AlertaCard
                key={a.id}
                alerta={a}
                onResolver={onResolver}
                onCerrarPorteria={onCerrarPorteria}
                loading={pending && resolvingId === a.id}
                closingPorteria={pending && closingId === a.porteriaId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="mb-3 text-sm font-semibold text-[#364153]">
      {label} <span className="ml-1 text-gray-400">({count})</span>
    </h3>
  );
}

function AlertaCard({
  alerta,
  onResolver,
  onCerrarPorteria,
  loading,
  closingPorteria,
}: {
  alerta: AlertaOperativa;
  onResolver: (id: string) => void;
  onCerrarPorteria: (porteriaId: string) => void;
  loading: boolean;
  closingPorteria: boolean;
}) {
  const isCritica = alerta.tipo === 'sin_respuesta';
  const cardBorder = isCritica ? 'border-red-200' : 'border-amber-200';
  const cardBg = isCritica ? 'bg-red-50/50' : 'bg-amber-50/40';

  return (
    <div className={`rounded-[12px] border ${cardBorder} ${cardBg} px-4 py-4`}>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            isCritica ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {isCritica ? <AlertTriangle className="h-5 w-5" /> : <Ship className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-[#101828]">{alerta.socioNombre}</p>
            {alerta.embarcacion && (
              <span className="truncate text-xs text-gray-500">· {alerta.embarcacion}</span>
            )}
          </div>

          <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-2">
            <Field label="Hora prometida" value={fmtNaive(alerta.hasta)} />
            <Field label="Alerta creada" value={fmtRelative(alerta.createdAt)} />
            {isCritica && alerta.hasta && (
              <Field label="Demora" value={fmtDelayFromHasta(alerta.hasta)} />
            )}
            {alerta.socioTelefono && <Field label="Teléfono" value={alerta.socioTelefono} />}
          </div>

          {alerta.mensaje && <p className="mt-2 text-xs text-gray-500">{alerta.mensaje}</p>}
        </div>

        <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:flex-col">
          {isCritica && buildWhatsappUrl(alerta.socioTelefono) && (
            <a
              href={buildWhatsappUrl(alerta.socioTelefono)!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          )}
          {isCritica && (
            <button
              type="button"
              disabled={closingPorteria || loading}
              onClick={() => onCerrarPorteria(alerta.porteriaId)}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" />
              {closingPorteria ? 'Cerrando…' : 'Cerrar salida'}
            </button>
          )}
          {!isCritica && (
            <button
              type="button"
              disabled={loading || closingPorteria}
              onClick={() => onResolver(alerta.id)}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#175861] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#124a52] disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" />
              {loading ? 'Guardando…' : 'Marcar resuelta'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-400">{label}: </span>
      <span className="font-medium text-[#364153]">{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[12px] border border-dashed border-gray-200 bg-white px-6 py-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-600">
        <Check className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-[#101828]">Sin alertas pendientes</p>
      <p className="mt-1 text-xs text-gray-500">
        Todas las embarcaciones activas están dentro de horario o ya confirmaron arribo.
      </p>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtNaive(iso: string | null): string {
  if (!iso) return '—';
  // porteria.hasta se guarda como hora AR local sin offset (el mobile no envía TZ).
  // Postgres lo almacena como UTC "naive", así que NO aplicar conversión TZ —
  // extraer los componentes directamente del ISO string.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return '—';
  return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
}

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

function fmtDelayFromHasta(hastaIso: string): string {
  const hastaMs = new Date(hastaIso).getTime();
  // porteria.hasta es naive: hora AR almacenada como UTC.
  // Construimos "ahora" en el mismo dominio naive: tomamos la hora AR actual
  // y la tratamos como UTC para comparar manzanas con manzanas.
  const arNow = new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
  const nowNaiveMs = new Date(arNow.replace(' ', 'T') + 'Z').getTime();
  const diff = nowNaiveMs - hastaMs;
  const mins = Math.floor(diff / 60000);
  if (mins < 0) return '—';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}min`;
}
