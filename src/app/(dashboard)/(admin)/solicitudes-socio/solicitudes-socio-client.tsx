'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Mail, Phone, UserCheck, UserX, X } from 'lucide-react';

import {
  aprobarSolicitudAction,
  rechazarSolicitudAction,
} from '@/app/actions/solicitudes-membership';
import { EmptyState } from '@/components/shared/empty-state';

type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada';

type Solicitud = {
  id: string;
  estado: EstadoSolicitud;
  motivoRechazo: string | null;
  createdAt: string;
  resolvedAt: string | null;
  solicitanteId: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
  telefono: string | null;
};

type Tab = 'pendientes' | 'resueltas';

export function SolicitudesSocioClient({ solicitudes }: { solicitudes: Solicitud[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('pendientes');
  const [rechazando, setRechazando] = useState<Solicitud | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const pendientes = useMemo(
    () => solicitudes.filter((s) => s.estado === 'pendiente'),
    [solicitudes],
  );
  const resueltas = useMemo(
    () => solicitudes.filter((s) => s.estado !== 'pendiente'),
    [solicitudes],
  );

  const lista = tab === 'pendientes' ? pendientes : resueltas;

  const onAprobar = (s: Solicitud) => {
    const fullname = nombreCompleto(s);
    if (typeof window !== 'undefined' && !window.confirm(`¿Aprobar a ${fullname} como socio?`))
      return;
    setErrorBanner(null);
    setPendingId(s.id);
    startTransition(async () => {
      const r = await aprobarSolicitudAction(s.id);
      setPendingId(null);
      if (r.error) {
        setErrorBanner(r.error);
        return;
      }
      router.refresh();
    });
  };

  const onRechazarConfirm = (motivo: string) => {
    if (!rechazando) return;
    setErrorBanner(null);
    setPendingId(rechazando.id);
    startTransition(async () => {
      const r = await rechazarSolicitudAction(rechazando.id, motivo);
      setPendingId(null);
      if (r.error) {
        setErrorBanner(r.error);
        setRechazando(null);
        return;
      }
      setRechazando(null);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-[#101828]">Solicitudes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pedidos de usuarios para sumarse como socios a tu club.
        </p>
      </header>

      <div className="mb-5 flex gap-1 rounded-[10px] border border-gray-200 bg-white p-1">
        <TabButton
          label={`Pendientes${pendientes.length > 0 ? ` · ${pendientes.length}` : ''}`}
          active={tab === 'pendientes'}
          onClick={() => setTab('pendientes')}
        />
        <TabButton
          label={`Resueltas${resueltas.length > 0 ? ` · ${resueltas.length}` : ''}`}
          active={tab === 'resueltas'}
          onClick={() => setTab('resueltas')}
        />
      </div>

      {errorBanner ? (
        <div className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorBanner}
        </div>
      ) : null}

      {lista.length === 0 ? (
        <EmptyState
          icon={
            tab === 'pendientes' ? (
              <UserCheck className="h-7 w-7 text-gray-400" />
            ) : (
              <UserX className="h-7 w-7 text-gray-400" />
            )
          }
          text={
            tab === 'pendientes'
              ? 'No hay solicitudes pendientes.'
              : 'Todavía no hay solicitudes resueltas.'
          }
        />
      ) : (
        <div className="space-y-3">
          {lista.map((s) => (
            <SolicitudCard
              key={s.id}
              solicitud={s}
              loading={pendingId === s.id}
              onAprobar={() => onAprobar(s)}
              onRechazar={() => setRechazando(s)}
            />
          ))}
        </div>
      )}

      {rechazando ? (
        <RechazoModal
          solicitud={rechazando}
          loading={pendingId === rechazando.id}
          onClose={() => setRechazando(null)}
          onConfirm={onRechazarConfirm}
        />
      ) : null}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-[8px] px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-[#175861] text-white' : 'text-[#4A5565] hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}

function SolicitudCard({
  solicitud,
  loading,
  onAprobar,
  onRechazar,
}: {
  solicitud: Solicitud;
  loading: boolean;
  onAprobar: () => void;
  onRechazar: () => void;
}) {
  const fullname = nombreCompleto(solicitud);
  const initial = (solicitud.nombre?.[0] ?? solicitud.email[0]).toUpperCase();

  return (
    <article className="rounded-[14px] border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#175861] text-base font-bold text-white">
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="truncate text-base font-semibold text-[#101828]">{fullname}</h2>
            <EstadoBadge estado={solicitud.estado} />
          </div>

          <div className="mt-2 space-y-1 text-sm text-gray-600">
            <p className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{solicitud.email}</span>
            </p>
            {solicitud.telefono ? (
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="truncate">{solicitud.telefono}</span>
              </p>
            ) : null}
          </div>

          <p className="mt-2 text-xs text-gray-400">
            Pedido {formatearRelativa(solicitud.createdAt)}
            {solicitud.estado !== 'pendiente' && solicitud.resolvedAt
              ? ` · resuelto ${formatearRelativa(solicitud.resolvedAt)}`
              : ''}
          </p>

          {solicitud.estado === 'rechazada' && solicitud.motivoRechazo ? (
            <p className="mt-2 rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-700">
              <span className="font-semibold">Motivo: </span>
              {solicitud.motivoRechazo}
            </p>
          ) : null}
        </div>
      </div>

      {solicitud.estado === 'pendiente' ? (
        <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={onRechazar}
            disabled={loading}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-gray-200 bg-white text-sm font-medium text-[#4A5565] transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Rechazar
          </button>
          <button
            type="button"
            onClick={onAprobar}
            disabled={loading}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-[#175861] text-sm font-semibold text-white transition-colors hover:bg-[#124850] disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {loading ? 'Aprobando…' : 'Aprobar'}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function EstadoBadge({ estado }: { estado: EstadoSolicitud }) {
  if (estado === 'aprobada') {
    return (
      <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        Aprobada
      </span>
    );
  }
  if (estado === 'rechazada') {
    return (
      <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
        Rechazada
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
      Pendiente
    </span>
  );
}

function RechazoModal({
  solicitud,
  loading,
  onClose,
  onConfirm,
}: {
  solicitud: Solicitud;
  loading: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[16px] bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-[#101828]">Rechazar solicitud</h3>
        <p className="mt-1 text-sm text-gray-600">
          Vas a rechazar el pedido de {nombreCompleto(solicitud)}. Si querés, agregá un motivo que
          el usuario va a ver en la app.
        </p>

        <label className="mt-4 block text-sm font-medium text-[#4A5565]">Motivo (opcional)</label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej: No coincide con nuestros registros."
          rows={3}
          className="mt-1.5 w-full rounded-[10px] border border-gray-200 bg-white p-3 text-sm text-[#101828] focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
        />

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-[#4A5565] transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(motivo)}
            disabled={loading}
            className="flex-1 rounded-[10px] bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Rechazando…' : 'Rechazar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function nombreCompleto(s: Solicitud): string {
  const parts = [s.nombre, s.apellido].filter(Boolean).join(' ').trim();
  return parts || s.email;
}

// Tiempo relativo simple: "hace 2 min", "hace 3 hs", "hace 5 días". Sin libs.
function formatearRelativa(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'hace un instante';
  if (min < 60) return `hace ${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  const days = Math.floor(hs / 24);
  if (days < 30) return `hace ${days} d`;
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}
