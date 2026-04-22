'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Clock, Phone, Ship } from 'lucide-react';

import { marcarAlertaResueltaAction } from '@/app/actions/alertas';

export type AlertaRow = {
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

type Props = { alertas: AlertaRow[] };

export function AlertasClient({ alertas }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const { criticas, proximas } = useMemo(() => {
    const criticas: AlertaRow[] = [];
    const proximas: AlertaRow[] = [];
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

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#101828]">Alertas</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitoreo de retorno de embarcaciones. El sistema revisa cada minuto las salidas activas y
          crea una alerta cuando se acerca la hora de arribo o cuando pasó sin respuesta.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <StatCard
          label="Sin respuesta"
          value={criticas.length}
          tone="critical"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="Retorno próximo"
          value={proximas.length}
          tone="warn"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {alertas.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {criticas.length > 0 && (
            <section>
              <SectionTitle label="Críticas — Sin respuesta del socio" count={criticas.length} />
              <div className="space-y-3">
                {criticas.map((a) => (
                  <AlertaCard
                    key={a.id}
                    alerta={a}
                    onResolver={onResolver}
                    loading={pending && resolvingId === a.id}
                  />
                ))}
              </div>
            </section>
          )}

          {proximas.length > 0 && (
            <section>
              <SectionTitle label="Retorno próximo — Esperando respuesta" count={proximas.length} />
              <div className="space-y-3">
                {proximas.map((a) => (
                  <AlertaCard
                    key={a.id}
                    alerta={a}
                    onResolver={onResolver}
                    loading={pending && resolvingId === a.id}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: 'critical' | 'warn';
  icon: React.ReactNode;
}) {
  const bg = tone === 'critical' ? 'bg-red-50' : 'bg-amber-50';
  const fg = tone === 'critical' ? 'text-red-700' : 'text-amber-700';
  return (
    <div className={`rounded-[12px] border border-gray-200 ${bg} px-4 py-3`}>
      <div className={`flex items-center gap-2 text-xs font-medium ${fg}`}>
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-2xl font-semibold ${fg}`}>{value}</p>
    </div>
  );
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <h2 className="mb-3 text-sm font-semibold text-[#364153]">
      {label} <span className="ml-1 text-gray-400">({count})</span>
    </h2>
  );
}

function AlertaCard({
  alerta,
  onResolver,
  loading,
}: {
  alerta: AlertaRow;
  onResolver: (id: string) => void;
  loading: boolean;
}) {
  const isCritica = alerta.tipo === 'sin_respuesta';
  const cardBorder = isCritica ? 'border-red-200' : 'border-amber-200';
  const cardBg = isCritica ? 'bg-red-50/50' : 'bg-amber-50/40';

  return (
    <div className={`rounded-[12px] border ${cardBorder} ${cardBg} px-4 py-4`}>
      <div className="flex items-start gap-3">
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

          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
            <Field label="Hora prometida" value={fmtNaive(alerta.hasta)} />
            <Field label="Alerta creada" value={fmtRelative(alerta.createdAt)} />
            {isCritica && alerta.hasta && (
              <Field label="Demora" value={fmtDelayFromHasta(alerta.hasta)} />
            )}
            {alerta.socioTelefono && <Field label="Teléfono" value={alerta.socioTelefono} />}
          </div>

          {alerta.mensaje && <p className="mt-2 text-xs text-gray-500">{alerta.mensaje}</p>}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {isCritica && alerta.socioTelefono && (
            <a
              href={`tel:${alerta.socioTelefono}`}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              <Phone className="h-3.5 w-3.5" />
              Llamar
            </a>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => onResolver(alerta.id)}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#175861] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#124a52] disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" />
            {loading ? 'Guardando…' : 'Marcar resuelta'}
          </button>
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
    <div className="rounded-[12px] border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
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

// Los timestamps desde/hasta se guardan como naive UTC (wall-clock local del socio).
// Los leemos con getUTC* para mostrar los dígitos literales que el socio escribió.
function fmtNaive(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
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

// "hasta" es naive UTC con hora literal local. "Now naive" = reloj local → UTC digits.
function fmtDelayFromHasta(hastaIso: string): string {
  const hastaMs = new Date(hastaIso).getTime();
  const now = new Date();
  const nowNaiveMs = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );
  const diff = nowNaiveMs - hastaMs;
  const mins = Math.floor(diff / 60000);
  if (mins < 0) return '—';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}min`;
}
