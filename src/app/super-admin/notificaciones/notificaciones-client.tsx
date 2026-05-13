'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  FilterX,
  Globe,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import {
  createPlatformNotificacionAction,
  deletePlatformNotificacionAction,
  type PlatformNotificacionInput,
} from '@/app/actions/super-admin/notificaciones';
import { formatArgentinaDate } from '@/lib/dates';
import { EmptyState } from '@/components/shared/empty-state';

export type NotificacionAudiencia = 'todas' | 'guarderia';
export type NotificacionEstado = 'pendiente' | 'enviada' | 'fallida';

export type GuarderiaOpt = { id: string; nombre: string };

export type PlatformNotificacion = {
  id: string;
  titulo: string;
  cuerpo: string;
  audiencia: NotificacionAudiencia;
  guarderiaId: string | null;
  guarderiaNombre: string | null;
  estado: NotificacionEstado;
  error: string | null;
  enviadoEn: string | null;
  createdAt: string;
  autor: string | null;
};

const ESTADO_LABELS: Record<NotificacionEstado, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700' },
  enviada: { label: 'Enviada', cls: 'bg-[#ECFDF3] text-[#027A48]' },
  fallida: { label: 'Fallida', cls: 'bg-red-50 text-red-700' },
};

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

type ModalState = { mode: 'create' } | null;

export function PlatformNotificacionesClient({
  notificaciones,
  guarderias,
}: {
  notificaciones: PlatformNotificacion[];
  guarderias: GuarderiaOpt[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = notificaciones.length;
    const pendientes = notificaciones.filter((n) => n.estado === 'pendiente').length;
    const enviadas = notificaciones.filter((n) => n.estado === 'enviada').length;
    const fallidas = notificaciones.filter((n) => n.estado === 'fallida').length;
    return { total, pendientes, enviadas, fallidas };
  }, [notificaciones]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notificaciones;
    return notificaciones.filter(
      (n) =>
        n.titulo.toLowerCase().includes(q) ||
        n.cuerpo.toLowerCase().includes(q) ||
        (n.guarderiaNombre ?? '').toLowerCase().includes(q),
    );
  }, [notificaciones, query]);

  return (
    <div>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Notificaciones</h1>
          <p className="page-subtitle mt-1">
            Push y alertas a usuarios de la app mobile, a nivel plataforma
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create' })}
          className="flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249]"
        >
          <Plus className="h-4 w-4" />
          Nueva notificación
        </button>
      </header>

      <div className="mb-6 rounded-2xl border border-[#C2DCDA] bg-[#D9EBE9] p-4">
        <div className="flex gap-3">
          <Bell className="h-5 w-5 shrink-0 text-[#175861]" />
          <div className="text-sm text-[#175861]">
            <p className="font-semibold">Cómo funcionan</p>
            <p className="mt-0.5">
              Al apretar enviar, la notif sale en el momento a los usuarios de la audiencia que
              tengan la app mobile instalada y hayan dado permiso de notificaciones. Si alguna queda
              en <span className="font-semibold">pendiente</span> o{' '}
              <span className="font-semibold">fallida</span>, hay un job que reintenta una vez por
              día.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Bell className="h-5 w-5" />} label="Total" value={stats.total} />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Pendientes"
          value={stats.pendientes}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Enviadas"
          value={stats.enviadas}
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Fallidas"
          value={stats.fallidas}
        />
      </div>

      <div className="mb-6 flex items-center gap-3">
        <input
          className={inputCls}
          placeholder="Buscar por título, cuerpo o guardería…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setQuery('')}
          title="Limpiar búsqueda"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <FilterX className="h-4 w-4" />
        </button>
      </div>

      {globalError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {globalError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <EmptyState
            icon={<Bell className="h-7 w-7 opacity-40" />}
            text={
              notificaciones.length === 0
                ? 'Todavía no hay notificaciones cargadas.'
                : 'Sin resultados con esa búsqueda.'
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <NotificacionCard key={n.id} n={n} onError={setGlobalError} />
          ))}
        </div>
      )}

      {modal && (
        <NotificacionModal
          guarderias={guarderias}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-gray-100 text-[#669E9D]">
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold" style={{ color: '#101828' }}>
          {value}
        </p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function NotificacionCard({
  n,
  onError,
}: {
  n: PlatformNotificacion;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();
  const estado = ESTADO_LABELS[n.estado];

  const handleDelete = () => {
    if (!confirm(`¿Eliminar la notificación "${n.titulo}"?`)) return;
    onError(null);
    startDelete(async () => {
      const res = await deletePlatformNotificacionAction(n.id);
      if (res.error) onError(res.error);
      else router.refresh();
    });
  };

  const audienciaLabel =
    n.audiencia === 'todas' ? 'Todas las guarderías' : `Guardería · ${n.guarderiaNombre ?? '—'}`;

  return (
    <article
      className={`rounded-2xl border border-gray-200 bg-white p-5 ${deleting ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold" style={{ color: '#101828' }}>
            {n.titulo}
          </h3>
          <p className="mt-1 text-sm whitespace-pre-line text-gray-600">{n.cuerpo}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${estado.cls}`}
            >
              {estado.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-[#D9EBE9] px-2 py-0.5 text-xs font-semibold text-[#175861]">
              <Globe className="h-3 w-3" />
              {audienciaLabel}
            </span>
          </div>
          {n.error && (
            <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
              <span className="font-semibold">Error:</span> {n.error}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
          <Calendar className="h-3.5 w-3.5" />
          {formatArgentinaDate(n.createdAt)}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <p className="text-xs" style={{ color: '#669E9D' }}>
          Por: {n.autor ?? '—'}
        </p>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          title="Eliminar notificación"
          className="flex items-center gap-1 rounded-[8px] border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Eliminar
        </button>
      </div>
    </article>
  );
}

function NotificacionModal({
  guarderias,
  onClose,
  onSaved,
}: {
  guarderias: GuarderiaOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [audiencia, setAudiencia] = useState<NotificacionAudiencia>('todas');
  const [guarderiaId, setGuarderiaId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    if (!titulo.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    if (!cuerpo.trim()) {
      setError('El cuerpo es obligatorio.');
      return;
    }
    if (audiencia === 'guarderia' && !guarderiaId) {
      setError('Elegí la guardería destinataria.');
      return;
    }

    const input: PlatformNotificacionInput = {
      titulo: titulo.trim(),
      cuerpo: cuerpo.trim(),
      audiencia,
      guarderiaId: audiencia === 'guarderia' ? guarderiaId : null,
    };

    startTransition(async () => {
      const res = await createPlatformNotificacionAction(input);
      if (res.error) setError(res.error);
      else onSaved();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
            Nueva notificación
          </h2>
          <button
            onClick={onClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-t border-gray-200" />

        <div className="space-y-4 overflow-y-auto p-6">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Título</label>
            <input
              className={inputCls}
              placeholder="Aparece en la cabecera del push"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={200}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Cuerpo</label>
            <textarea
              className={`${inputCls} h-28 py-3`}
              placeholder="Texto del mensaje"
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              maxLength={2000}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Audiencia</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2.5 text-sm ${
                  audiencia === 'todas'
                    ? 'border-[#175861] bg-[#D9EBE9] text-[#175861]'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="audiencia"
                  className="accent-[#175861]"
                  checked={audiencia === 'todas'}
                  onChange={() => setAudiencia('todas')}
                />
                Todas las guarderías
              </label>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2.5 text-sm ${
                  audiencia === 'guarderia'
                    ? 'border-[#175861] bg-[#D9EBE9] text-[#175861]'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="audiencia"
                  className="accent-[#175861]"
                  checked={audiencia === 'guarderia'}
                  onChange={() => setAudiencia('guarderia')}
                />
                Una guardería específica
              </label>
            </div>
          </div>

          {audiencia === 'guarderia' && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Guardería</label>
              <select
                className={inputCls}
                value={guarderiaId}
                onChange={(e) => setGuarderiaId(e.target.value)}
              >
                <option value="">Seleccione una guardería…</option>
                {guarderias.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-[10px] border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !titulo.trim() || !cuerpo.trim()}
            className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
          >
            {pending ? 'Enviando…' : 'Enviar notificación'}
          </button>
        </div>
      </div>
    </div>
  );
}
