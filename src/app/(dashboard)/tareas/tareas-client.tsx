'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Edit3,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import {
  createTareaAction,
  deleteTareaAction,
  ESTADOS_TAREA,
  updateTareaAction,
  updateTareaEstadoAction,
  type EstadoTarea,
} from '@/app/actions/tareas';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type Tarea = {
  id: string;
  descripcion: string;
  nota: string | null;
  estado: EstadoTarea;
  fechaHora: string | null;
  createdAt: string;
  operarioId: string | null;
  operarioNombre: string | null;
  embarcacionId: string | null;
  embarcacionNombre: string | null;
};

type OperarioOpt = { id: string; nombre: string };
type EmbarcacionOpt = { id: string; nombre: string };

type Props = {
  tareas: Tarea[];
  operarios: OperarioOpt[];
  embarcaciones: EmbarcacionOpt[];
  canCreate: boolean;
  canEditAll: boolean;
  currentUserId: string;
  isOperario: boolean;
};

// ─── Constantes UI ──────────────────────────────────────────────────────────

const COLUMNAS: { estado: EstadoTarea; label: string; accent: string }[] = [
  { estado: 'preparar', label: 'Preparar', accent: 'bg-amber-50 text-amber-700' },
  { estado: 'navegando', label: 'Navegando', accent: 'bg-blue-50 text-blue-700' },
  { estado: 'guardada', label: 'Guardada', accent: 'bg-gray-100 text-gray-700' },
  { estado: 'lavado', label: 'Lavado', accent: 'bg-teal-50 text-[#175861]' },
];

const ESTADO_LABEL: Record<EstadoTarea, string> = {
  preparar: 'Preparar',
  navegando: 'Navegando',
  guardada: 'Guardada',
  lavado: 'Lavado',
};

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

const textareaCls =
  'w-full rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtFechaHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function adyacente(estado: EstadoTarea, dir: -1 | 1): EstadoTarea | null {
  const idx = ESTADOS_TAREA.indexOf(estado);
  const next = idx + dir;
  if (next < 0 || next >= ESTADOS_TAREA.length) return null;
  return ESTADOS_TAREA[next];
}

// ─── Card ───────────────────────────────────────────────────────────────────

function TareaCard({
  tarea,
  canEditAll,
  isOperario,
  currentUserId,
  onEdit,
  onMove,
  onDelete,
  busy,
}: {
  tarea: Tarea;
  canEditAll: boolean;
  isOperario: boolean;
  currentUserId: string;
  onEdit: (t: Tarea) => void;
  onMove: (t: Tarea, dir: -1 | 1) => void;
  onDelete: (t: Tarea) => void;
  busy: boolean;
}) {
  const puedeMover = canEditAll || (isOperario && tarea.operarioId === currentUserId);
  const prev = adyacente(tarea.estado, -1);
  const next = adyacente(tarea.estado, 1);

  return (
    <div className="rounded-[10px] border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-sm leading-snug font-semibold" style={{ color: '#101828' }}>
        {tarea.descripcion}
      </p>
      <div className="mt-2 space-y-0.5 text-xs text-gray-500">
        {tarea.embarcacionNombre && (
          <p>
            <span className="font-medium text-gray-600">Embarcación:</span>{' '}
            {tarea.embarcacionNombre}
          </p>
        )}
        <p>
          <span className="font-medium text-gray-600">Operario:</span>{' '}
          {tarea.operarioNombre ?? 'Sin asignar'}
        </p>
        <p>
          <span className="font-medium text-gray-600">Fecha:</span> {fmtFechaHora(tarea.fechaHora)}
        </p>
      </div>
      {tarea.nota && (
        <p className="mt-2 rounded-[6px] bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
          {tarea.nota}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => prev && onMove(tarea, -1)}
            disabled={!puedeMover || !prev || busy}
            title={prev ? `Mover a ${ESTADO_LABEL[prev]}` : 'Sin estado previo'}
            className="rounded-[6px] p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[#175861] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => next && onMove(tarea, 1)}
            disabled={!puedeMover || !next || busy}
            title={next ? `Mover a ${ESTADO_LABEL[next]}` : 'Sin estado siguiente'}
            className="rounded-[6px] p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[#175861] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {canEditAll && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onEdit(tarea)}
              disabled={busy}
              title="Editar"
              className="rounded-[6px] p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[#175861]"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(tarea)}
              disabled={busy}
              title="Eliminar"
              className="rounded-[6px] p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal de tarea ─────────────────────────────────────────────────────────

type ModalMode = { mode: 'create' } | { mode: 'edit'; tarea: Tarea };

function TareaModal({
  open,
  mode,
  operarios,
  embarcaciones,
  onClose,
}: {
  open: boolean;
  mode: ModalMode | null;
  operarios: OperarioOpt[];
  embarcaciones: EmbarcacionOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = mode?.mode === 'edit' ? mode.tarea : null;

  const [form, setForm] = useState({
    descripcion: editing?.descripcion ?? '',
    nota: editing?.nota ?? '',
    operarioId: editing?.operarioId ?? '',
    embarcacionId: editing?.embarcacionId ?? '',
    estado: (editing?.estado ?? 'preparar') as EstadoTarea,
    fechaHora: toDatetimeLocal(editing?.fechaHora ?? null),
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isValid = form.descripcion.trim().length > 0;

  const set =
    <K extends keyof typeof form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value as (typeof f)[K] }));

  function handleSubmit() {
    if (!isValid) return;
    setError(null);
    startTransition(async () => {
      const payload = {
        descripcion: form.descripcion,
        nota: form.nota || null,
        operarioId: form.operarioId || null,
        embarcacionId: form.embarcacionId || null,
        estado: form.estado,
        fechaHora: form.fechaHora || null,
      };
      const res = editing
        ? await updateTareaAction({ id: editing.id, ...payload })
        : await createTareaAction(payload);
      if (res.error) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  if (!open || !mode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              {editing ? 'Editar tarea' : 'Nueva tarea'}
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {editing ? 'Modificá los datos de la tarea.' : 'Cargá una tarea para la guardería.'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
              Descripción*
            </label>
            <textarea
              className={textareaCls}
              rows={2}
              value={form.descripcion}
              onChange={set('descripcion')}
              placeholder="Ej: Preparar embarcación para salida 10:30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Operario
              </label>
              <select className={inputCls} value={form.operarioId} onChange={set('operarioId')}>
                <option value="">Sin asignar</option>
                {operarios.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Embarcación
              </label>
              <select
                className={inputCls}
                value={form.embarcacionId}
                onChange={set('embarcacionId')}
              >
                <option value="">Sin embarcación</option>
                {embarcaciones.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Estado
              </label>
              <select className={inputCls} value={form.estado} onChange={set('estado')}>
                {ESTADOS_TAREA.map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_LABEL[e]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Fecha y hora
              </label>
              <input
                type="datetime-local"
                className={inputCls}
                value={form.fechaHora}
                onChange={set('fechaHora')}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
              Nota
            </label>
            <textarea
              className={textareaCls}
              rows={3}
              value={form.nota}
              onChange={set('nota')}
              placeholder="Detalles internos (opcional)"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-[10px] px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || isPending}
            className="rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: '#175861' }}
          >
            {isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear tarea'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────

export function TareasClient({
  tareas,
  operarios,
  embarcaciones,
  canCreate,
  canEditAll,
  currentUserId,
  isOperario,
}: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const agrupadas = useMemo(() => {
    const acc: Record<EstadoTarea, Tarea[]> = {
      preparar: [],
      navegando: [],
      guardada: [],
      lavado: [],
    };
    for (const t of tareas) acc[t.estado].push(t);
    return acc;
  }, [tareas]);

  function moverTarea(t: Tarea, dir: -1 | 1) {
    const destino = adyacente(t.estado, dir);
    if (!destino) return;
    setGlobalError(null);
    setBusyId(t.id);
    startTransition(async () => {
      const res = await updateTareaEstadoAction(t.id, destino);
      if (res.error) setGlobalError(res.error);
      else router.refresh();
      setBusyId(null);
    });
  }

  function borrarTarea(t: Tarea) {
    if (!confirm(`¿Eliminar la tarea "${t.descripcion}"?`)) return;
    setGlobalError(null);
    setBusyId(t.id);
    startTransition(async () => {
      const res = await deleteTareaAction(t.id);
      if (res.error) setGlobalError(res.error);
      else router.refresh();
      setBusyId(null);
    });
  }

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#101828' }}>
            Tareas
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
            {canCreate
              ? 'Cargá y asigná tareas a los operarios de la guardería.'
              : 'Tareas asignadas a la guardería. Movelas según su avance.'}
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setModal({ mode: 'create' })}
            className="flex items-center gap-1.5 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: '#175861' }}
          >
            <Plus className="h-4 w-4" />
            Nueva tarea
          </button>
        )}
      </div>

      {globalError && (
        <div className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {globalError}
        </div>
      )}

      {/* Kanban */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNAS.map((col) => {
          const lista = agrupadas[col.estado];
          return (
            <div
              key={col.estado}
              className="flex min-h-[240px] flex-col rounded-2xl border border-gray-200 bg-[#F9FAFB] p-3"
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${col.accent}`}
                  >
                    {col.label}
                  </span>
                  <span className="text-xs text-gray-500">{lista.length}</span>
                </div>
              </div>

              {lista.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-gray-400">
                  <ClipboardList className="h-6 w-6 opacity-40" />
                  <p className="text-xs">Sin tareas</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {lista.map((t) => (
                    <TareaCard
                      key={t.id}
                      tarea={t}
                      canEditAll={canEditAll}
                      isOperario={isOperario}
                      currentUserId={currentUserId}
                      onEdit={(x) => setModal({ mode: 'edit', tarea: x })}
                      onMove={moverTarea}
                      onDelete={borrarTarea}
                      busy={isPending && busyId === t.id}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <TareaModal
        key={modal?.mode === 'edit' ? `edit-${modal.tarea.id}` : 'create'}
        open={modal !== null}
        mode={modal}
        operarios={operarios}
        embarcaciones={embarcaciones}
        onClose={() => setModal(null)}
      />
    </div>
  );
}
