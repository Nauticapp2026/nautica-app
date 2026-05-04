'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Anchor,
  ClipboardList,
  Droplet,
  FilterX,
  Plus,
  Settings,
  Ship,
  X,
} from 'lucide-react';

import {
  createTareaAction,
  deleteTareaAction,
  updateTareaAction,
  updateTareaEstadoAction,
  updateTareaOperarioAction,
} from '@/app/actions/tareas';
import { ESTADOS_TAREA, type EstadoTarea } from './constants';

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
  socioNombre: string | null;
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

type ColumnDef = {
  estado: EstadoTarea;
  label: string;
  icon: typeof Anchor;
  header: string; // bg class for header
  body: string; // bg class for body area
};

const COLUMNAS: ColumnDef[] = [
  {
    estado: 'preparar',
    label: 'Preparar',
    icon: Settings,
    header: 'bg-[#669999]',
    body: 'bg-[#F4F8F8]',
  },
  {
    estado: 'navegando',
    label: 'Navegando',
    icon: Ship,
    header: 'bg-[#5C2188]',
    body: 'bg-[#F7F3FB]',
  },
  {
    estado: 'guardada',
    label: 'Guardada',
    icon: Anchor,
    header: 'bg-[#175760]',
    body: 'bg-[#F1F6F6]',
  },
  {
    estado: 'lavado',
    label: 'Lavado',
    icon: Droplet,
    header: 'bg-[#024C7A]',
    body: 'bg-[#EFF4F9]',
  },
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

const TZ_AR = 'America/Argentina/Buenos_Aires';

function fmtHora(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', {
    timeZone: TZ_AR,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Card ───────────────────────────────────────────────────────────────────

function TareaCard({
  tarea,
  canEditAll,
  dndEnabled,
  operarios,
  onEdit,
  onMoveEstado,
  busy,
  onDragStart,
  onDragEnd,
}: {
  tarea: Tarea;
  canEditAll: boolean;
  dndEnabled: boolean;
  operarios: OperarioOpt[];
  onEdit: (t: Tarea) => void;
  onMoveEstado: (t: Tarea, destino: EstadoTarea) => void;
  busy: boolean;
  onDragStart: (t: Tarea) => void;
  onDragEnd: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeOperario = (opId: string) => {
    startTransition(async () => {
      const res = await updateTareaOperarioAction(tarea.id, opId || null);
      if (res.error) alert(res.error);
      else router.refresh();
    });
  };

  const draggable = canEditAll && dndEnabled;

  return (
    <div
      draggable={draggable}
      onDragStart={() => draggable && onDragStart(tarea)}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(tarea)}
      className={`cursor-pointer rounded-[12px] border border-gray-200 bg-white p-3 shadow-sm transition-opacity hover:shadow-md ${busy ? 'opacity-60' : ''}`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="truncate text-xs font-medium text-gray-600">{tarea.socioNombre ?? '—'}</p>
        <span className="shrink-0 text-xs text-gray-500">{fmtHora(tarea.fechaHora)}</span>
      </div>

      <p className="text-base font-bold" style={{ color: '#101828' }}>
        {tarea.embarcacionNombre ?? 'Sin embarcación'}
      </p>

      {(tarea.descripcion || tarea.nota) && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-600">
          <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="line-clamp-2">{tarea.descripcion || tarea.nota}</span>
        </div>
      )}

      <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
        <select
          className="h-8 w-full rounded-[8px] border border-gray-200 bg-white px-2 text-xs text-[#101828] focus:border-[#175861] focus:outline-none"
          value={tarea.operarioId ?? ''}
          onChange={(e) => changeOperario(e.target.value)}
          disabled={!canEditAll || pending}
        >
          <option value="">Sin asignar</option>
          {operarios.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
        {tarea.estado !== 'lavado' && (
          <select
            className="h-8 w-full rounded-[8px] border border-gray-200 bg-white px-2 text-xs text-[#175861] focus:border-[#175861] focus:outline-none"
            value=""
            onChange={(e) => {
              const dest = e.target.value as EstadoTarea;
              if (dest) onMoveEstado(tarea, dest);
            }}
            disabled={!canEditAll || pending}
          >
            <option value="">Mover a…</option>
            {ESTADOS_TAREA.filter((e) => e !== tarea.estado).map((e) => (
              <option key={e} value={e}>
                {ESTADO_LABEL[e]}
              </option>
            ))}
          </select>
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
  canEditAll,
  onClose,
  onDelete,
}: {
  open: boolean;
  mode: ModalMode | null;
  operarios: OperarioOpt[];
  embarcaciones: EmbarcacionOpt[];
  canEditAll: boolean;
  onClose: () => void;
  onDelete: (t: Tarea) => void;
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

        <div className="flex items-center justify-between gap-2 border-t border-gray-200 p-4">
          <div>
            {editing && canEditAll && (
              <button
                type="button"
                onClick={() => onDelete(editing)}
                className="text-sm font-semibold text-red-600 underline hover:text-red-700"
              >
                Eliminar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
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
  currentUserId: _currentUserId,
  isOperario: _isOperario,
}: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [filterOperario, setFilterOperario] = useState<string>('');
  const [filterEmbarcacion, setFilterEmbarcacion] = useState<string>('');
  const [tab, setTab] = useState<'operativa' | 'lavado'>('operativa');

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverState, setDragOverState] = useState<EstadoTarea | null>(null);

  const filtradas = useMemo(() => {
    return tareas.filter((t) => {
      if (filterOperario && t.operarioId !== filterOperario) return false;
      if (filterEmbarcacion && t.embarcacionId !== filterEmbarcacion) return false;
      return true;
    });
  }, [tareas, filterOperario, filterEmbarcacion]);

  const agrupadas = useMemo(() => {
    const acc: Record<EstadoTarea, Tarea[]> = {
      preparar: [],
      navegando: [],
      guardada: [],
      lavado: [],
    };
    for (const t of filtradas) acc[t.estado].push(t);
    return acc;
  }, [filtradas]);

  const limpiarFiltros = () => {
    setFilterOperario('');
    setFilterEmbarcacion('');
  };

  const moverTarea = (tarea: Tarea, destino: EstadoTarea) => {
    if (tarea.estado === destino) return;
    if (!canEditAll) return;

    setGlobalError(null);
    setBusyId(tarea.id);
    startTransition(async () => {
      const res = await updateTareaEstadoAction(tarea.id, destino);
      if (res.error) setGlobalError(res.error);
      else router.refresh();
      setBusyId(null);
    });
  };

  const onDropOnColumn = (destino: EstadoTarea) => {
    const tarea = tareas.find((t) => t.id === draggingId);
    setDraggingId(null);
    setDragOverState(null);
    if (!tarea) return;
    moverTarea(tarea, destino);
  };

  const borrarTarea = (t: Tarea) => {
    if (!confirm(`¿Eliminar la tarea "${t.descripcion}"?`)) return;
    setGlobalError(null);
    setBusyId(t.id);
    startTransition(async () => {
      const res = await deleteTareaAction(t.id);
      if (res.error) setGlobalError(res.error);
      else {
        setModal(null);
        router.refresh();
      }
      setBusyId(null);
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Gestión de Embarcaciones</h1>
          <p className="page-subtitle mt-1">Seguimiento del proceso operativo de embarcaciones</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setModal({ mode: 'create' })}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: '#175861' }}
          >
            <Plus className="h-4 w-4" />
            Nueva tarea
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {COLUMNAS.map((col) => {
          const Icon = col.icon;
          const count = agrupadas[col.estado].length;
          return (
            <div key={col.estado} className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: '#669E9D' }}>
                  {col.label}
                </p>
                <Icon className="h-4 w-4" style={{ color: '#669E9D' }} />
              </div>
              <p className="mt-2 text-3xl font-bold" style={{ color: '#175861' }}>
                {count}
              </p>
            </div>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
        <select
          className={inputCls}
          value={filterOperario}
          onChange={(e) => setFilterOperario(e.target.value)}
        >
          <option value="">Operario</option>
          {operarios.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={filterEmbarcacion}
          onChange={(e) => setFilterEmbarcacion(e.target.value)}
        >
          <option value="">Embarcación</option>
          {embarcaciones.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={limpiarFiltros}
          title="Limpiar filtros"
          className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <FilterX className="h-4 w-4" />
        </button>
      </div>

      {globalError && (
        <div className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {globalError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-[12px] border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab('operativa')}
          className={`rounded-[8px] px-4 py-2 text-sm font-semibold transition-colors ${
            tab === 'operativa' ? 'bg-[#175861] text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Operativa
        </button>
        <button
          type="button"
          onClick={() => setTab('lavado')}
          className={`rounded-[8px] px-4 py-2 text-sm font-semibold transition-colors ${
            tab === 'lavado' ? 'bg-[#175861] text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Lavado ({agrupadas.lavado.length})
        </button>
      </div>

      {/* Kanban */}
      {(() => {
        const cols = COLUMNAS.filter((c) =>
          tab === 'operativa' ? c.estado !== 'lavado' : c.estado === 'lavado',
        );
        const dndEnabled = tab === 'operativa';
        const gridCls =
          tab === 'operativa' ? 'grid grid-cols-1 gap-4 md:grid-cols-3' : 'grid grid-cols-1 gap-4';
        return (
          <div className={gridCls}>
            {cols.map((col) => {
              const lista = agrupadas[col.estado];
              const Icon = col.icon;
              const isOver = dndEnabled && dragOverState === col.estado;
              return (
                <div
                  key={col.estado}
                  onDragOver={(e) => {
                    if (!canEditAll || !dndEnabled) return;
                    e.preventDefault();
                    if (dragOverState !== col.estado) setDragOverState(col.estado);
                  }}
                  onDragLeave={() => {
                    if (dragOverState === col.estado) setDragOverState(null);
                  }}
                  onDrop={(e) => {
                    if (!dndEnabled) return;
                    e.preventDefault();
                    onDropOnColumn(col.estado);
                  }}
                  className={`flex min-h-[280px] flex-col overflow-hidden rounded-2xl border ${
                    isOver ? 'border-[#175861] ring-2 ring-[#175861]/30' : 'border-gray-200'
                  } ${col.body}`}
                >
                  <div
                    className={`flex items-center justify-between ${col.header} px-4 py-3 text-white`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-semibold">{col.label}</span>
                    </div>
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold text-white">
                      {lista.length}
                    </span>
                  </div>

                  <div className="flex-1 space-y-2.5 p-3">
                    {lista.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-400">
                        <ClipboardList className="h-6 w-6 opacity-40" />
                        <p className="text-xs">Sin tareas</p>
                      </div>
                    ) : (
                      lista.map((t) => (
                        <TareaCard
                          key={t.id}
                          tarea={t}
                          canEditAll={canEditAll}
                          dndEnabled={dndEnabled}
                          operarios={operarios}
                          onEdit={(x) => setModal({ mode: 'edit', tarea: x })}
                          onMoveEstado={moverTarea}
                          busy={isPending && busyId === t.id}
                          onDragStart={() => setDraggingId(t.id)}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverState(null);
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      <TareaModal
        key={modal?.mode === 'edit' ? `edit-${modal.tarea.id}` : 'create'}
        open={modal !== null}
        mode={modal}
        operarios={operarios}
        embarcaciones={embarcaciones}
        canEditAll={canEditAll}
        onClose={() => setModal(null)}
        onDelete={borrarTarea}
      />
    </div>
  );
}
