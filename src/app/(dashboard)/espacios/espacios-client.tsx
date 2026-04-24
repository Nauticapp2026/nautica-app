'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Anchor, Building2, Check, Plus, Trash2, X } from 'lucide-react';

import { createAreaAction, deleteAreaAction, type CreateAreaInput } from '@/app/actions/espacios';

export type EstadoEspacio = 'ocupado' | 'reservado' | 'disponible';

export type EspacioCell = {
  id: string;
  nomenclatura: string;
  estado: EstadoEspacio;
};

export type AreaView = {
  id: string;
  nombre: string;
  tipo: 'marina' | 'nave';
  peines: { marinaId: string; nombre: string; espacios: EspacioCell[] }[];
  lados: {
    ladoId: string;
    nombre: string;
    pisos: { pisoId: string; nombre: string; espacios: EspacioCell[] }[];
  }[];
};

type Filtro = 'marina' | 'nave';

const ESTADO_CLS: Record<EstadoEspacio, string> = {
  ocupado: 'bg-red-100 text-red-700 border-red-200',
  reservado: 'bg-amber-100 text-amber-700 border-amber-200',
  disponible: 'bg-[#D9EBE9] text-[#175861] border-[#C2DCDA]',
};

function countEspacios(a: AreaView): {
  total: number;
  ocupado: number;
  reservado: number;
  disponible: number;
} {
  const acc = { total: 0, ocupado: 0, reservado: 0, disponible: 0 };
  const collect = (arr: EspacioCell[]) => {
    for (const e of arr) {
      acc.total++;
      acc[e.estado]++;
    }
  };
  for (const p of a.peines) collect(p.espacios);
  for (const l of a.lados) for (const pi of l.pisos) collect(pi.espacios);
  return acc;
}

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

export function EspaciosClient({ areas }: { areas: AreaView[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>('marina');
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AreaView | null>(null);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onDelete = () => {
    if (!confirmDelete) return;
    setDeleteError(null);
    startDelete(async () => {
      const res = await deleteAreaAction(confirmDelete.id);
      if (res.error) setDeleteError(res.error);
      else {
        setConfirmDelete(null);
        router.refresh();
      }
    });
  };

  const totales = useMemo(() => {
    const t = { total: 0, ocupado: 0, reservado: 0, disponible: 0 };
    for (const a of areas) {
      const c = countEspacios(a);
      t.total += c.total;
      t.ocupado += c.ocupado;
      t.reservado += c.reservado;
      t.disponible += c.disponible;
    }
    return t;
  }, [areas]);

  const areasFiltradas = useMemo(() => areas.filter((a) => a.tipo === filtro), [areas, filtro]);

  const totalesFiltrados = useMemo(() => {
    const t = { total: 0, ocupado: 0, reservado: 0, disponible: 0 };
    for (const a of areasFiltradas) {
      const c = countEspacios(a);
      t.total += c.total;
      t.ocupado += c.ocupado;
      t.reservado += c.reservado;
      t.disponible += c.disponible;
    }
    return t;
  }, [areasFiltradas]);

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#101828' }}>
            Gestión de espacios
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#669E9D' }}>
            Creá áreas con peines y amarras, asigná clientes y embarcaciones
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249]"
        >
          <Plus className="h-4 w-4" />
          Nueva área
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total de espacios" value={totales.total} accent="#101828" />
        <StatCard label="Ocupados" value={totales.ocupado} accent="#B42318" />
        <StatCard label="Reservados" value={totales.reservado} accent="#B54708" />
        <StatCard label="Disponibles" value={totales.disponible} accent="#039855" />
      </div>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4" style={{ color: '#669E9D' }} />
          <h2 className="text-base font-bold" style={{ color: '#101828' }}>
            Areas ({areas.length})
          </h2>
        </div>
        {areas.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">Todavía no hay áreas cargadas.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {areas.map((a) => (
              <AreaCard
                key={a.id}
                area={a}
                counts={countEspacios(a)}
                onDelete={() => {
                  setDeleteError(null);
                  setConfirmDelete(a);
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Anchor className="h-4 w-4" style={{ color: '#669E9D' }} />
          <h2 className="text-base font-bold" style={{ color: '#101828' }}>
            Filtros de visualización
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FiltroButton
            label="Marina"
            icon={<Building2 className="h-4 w-4" />}
            active={filtro === 'marina'}
            onClick={() => setFiltro('marina')}
          />
          <FiltroButton
            label="Nave"
            icon={<Anchor className="h-4 w-4" />}
            active={filtro === 'nave'}
            onClick={() => setFiltro('nave')}
          />
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-5 text-sm">
        <LeyendaItem color="bg-red-500" label={`Ocupado (${totalesFiltrados.ocupado})`} />
        <LeyendaItem color="bg-amber-400" label={`Reservado (${totalesFiltrados.reservado})`} />
        <LeyendaItem color="bg-[#669E9D]" label={`Disponible (${totalesFiltrados.disponible})`} />
      </div>

      {areasFiltradas.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-16 text-center">
          <p className="text-sm text-gray-500">
            No hay áreas de tipo {filtro === 'marina' ? 'marina' : 'nave'} cargadas.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {areasFiltradas.map((a) =>
            a.tipo === 'marina' ? (
              <MarinaSection key={a.id} area={a} />
            ) : (
              <NaveSection key={a.id} area={a} />
            ),
          )}
        </div>
      )}

      {modalOpen && (
        <NuevaAreaModal
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          area={confirmDelete}
          pending={deleting}
          error={deleteError}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs" style={{ color: '#669E9D' }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function AreaCard({
  area,
  counts,
  onDelete,
}: {
  area: AreaView;
  counts: { total: number; ocupado: number; reservado: number; disponible: number };
  onDelete: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold" style={{ color: '#101828' }}>
            {area.nombre}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{counts.total} Espacios</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          title="Eliminar área"
          className="rounded-[8px] p-1 text-red-500 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <CountChip color="bg-red-500" label={`Ocupado (${counts.ocupado})`} />
        <CountChip color="bg-amber-400" label={`Reservado (${counts.reservado})`} />
        <CountChip color="bg-[#669E9D]" label={`Disponible (${counts.disponible})`} />
      </div>
    </div>
  );
}

function CountChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-gray-600">
      <span className={`h-2 w-2 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function FiltroButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-sm font-semibold transition-colors ${
        active
          ? 'bg-[#175861] text-white'
          : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function LeyendaItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-gray-600">
      <span className={`h-3 w-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function MarinaSection({ area }: { area: AreaView }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <header className="flex items-center gap-2 rounded-t-2xl bg-[#175861] px-5 py-3 text-sm font-semibold text-white">
        <Building2 className="h-4 w-4" />
        {area.nombre}
      </header>
      <div className="space-y-5 p-5">
        {area.peines.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">Sin peines cargados.</p>
        ) : (
          area.peines.map((p) => (
            <div key={p.marinaId}>
              <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                <Anchor className="h-3.5 w-3.5" />
                {p.nombre}
              </div>
              <EspaciosRow espacios={p.espacios} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function NaveSection({ area }: { area: AreaView }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <header className="flex items-center gap-2 rounded-t-2xl bg-[#175861] px-5 py-3 text-sm font-semibold text-white">
        <Anchor className="h-4 w-4" />
        {area.nombre}
      </header>
      <div className="p-5">
        {area.lados.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">Sin lados cargados.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {area.lados.map((l) => (
              <div key={l.ladoId}>
                <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                  <Anchor className="h-3.5 w-3.5" />
                  {l.nombre}
                </div>
                {l.pisos.map((pi) => (
                  <div key={pi.pisoId} className="mb-3">
                    <p className="mb-1 text-[11px] text-gray-400">{pi.nombre}</p>
                    <EspaciosRow espacios={pi.espacios} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EspaciosRow({ espacios }: { espacios: EspacioCell[] }) {
  if (espacios.length === 0) {
    return <p className="text-[11px] text-gray-400">Sin espacios.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {espacios.map((e) => (
        <span
          key={e.id}
          className={`inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded-[8px] border px-2 text-xs font-semibold ${ESTADO_CLS[e.estado]}`}
          title={`${e.nomenclatura} · ${e.estado}`}
        >
          {e.nomenclatura}
        </span>
      ))}
    </div>
  );
}

type LadoInput = {
  nombre: string;
  cantidadPisos: string;
  cantidadCamas: string;
  confirmado: boolean;
};

function NuevaAreaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState<'marina' | 'nave'>('marina');
  const [nombre, setNombre] = useState('');

  // Marina fields
  const [cantidadPeines, setCantidadPeines] = useState<string>('');
  const [cantidadAmarras, setCantidadAmarras] = useState<string>('');

  // Nave fields
  const [lados, setLados] = useState<LadoInput[]>([
    { nombre: 'A', cantidadPisos: '', cantidadCamas: '', confirmado: false },
  ]);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addLado = () => {
    const nextLetter = String.fromCharCode(65 + lados.length); // A, B, C...
    setLados((prev) => [
      ...prev,
      { nombre: nextLetter, cantidadPisos: '', cantidadCamas: '', confirmado: false },
    ]);
  };

  const updateLado = (idx: number, patch: Partial<LadoInput>) => {
    setLados((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeLado = (idx: number) => {
    setLados((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = () => {
    setError(null);
    if (!nombre.trim()) {
      setError('Ingresá el nombre del área.');
      return;
    }

    let payload: CreateAreaInput;
    if (tipo === 'marina') {
      const peines = Number(cantidadPeines);
      const amarras = Number(cantidadAmarras);
      if (!Number.isInteger(peines) || peines < 1) {
        setError('La cantidad de peines debe ser un entero ≥ 1.');
        return;
      }
      if (!Number.isInteger(amarras) || amarras < 0) {
        setError('La cantidad de amarras debe ser un entero ≥ 0.');
        return;
      }
      payload = {
        tipo: 'marina',
        nombre: nombre.trim(),
        cantidadPeines: peines,
        cantidadAmarras: amarras,
      };
    } else {
      if (lados.length === 0) {
        setError('Agregá al menos un lado.');
        return;
      }
      const ladosInput: { nombre: string; cantidadPisos: number; cantidadCamas: number }[] = [];
      for (let i = 0; i < lados.length; i++) {
        const l = lados[i];
        if (!l.nombre.trim()) {
          setError(`Lado #${i + 1}: ingresá el nombre.`);
          return;
        }
        const pisos = Number(l.cantidadPisos);
        const camas = Number(l.cantidadCamas);
        if (!Number.isInteger(pisos) || pisos < 1) {
          setError(`Lado "${l.nombre}": cantidad de pisos debe ser entero ≥ 1.`);
          return;
        }
        if (!Number.isInteger(camas) || camas < 0) {
          setError(`Lado "${l.nombre}": cantidad de camas debe ser entero ≥ 0.`);
          return;
        }
        ladosInput.push({ nombre: l.nombre.trim(), cantidadPisos: pisos, cantidadCamas: camas });
      }
      payload = { tipo: 'nave', nombre: nombre.trim(), lados: ladosInput };
    }

    startTransition(async () => {
      const res = await createAreaAction(payload);
      if (res.error) setError(res.error);
      else onSaved();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
            Nueva área
          </h2>
          <button
            onClick={onClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="space-y-4 p-6">
          <div className="flex gap-5">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={tipo === 'marina'} onChange={() => setTipo('marina')} />
              Marina
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={tipo === 'nave'} onChange={() => setTipo('nave')} />
              Nave
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Nombre del área*
            </label>
            <input
              className={inputCls}
              placeholder="Ej: Galpón 1 Lado A"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          {tipo === 'marina' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Cantidad de peines
                </label>
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  placeholder="0"
                  value={cantidadPeines}
                  onChange={(e) => setCantidadPeines(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Cantidad de amarras
                </label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  placeholder="0"
                  value={cantidadAmarras}
                  onChange={(e) => setCantidadAmarras(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={addLado}
                  className="flex items-center gap-1 text-sm font-semibold text-[#175861] hover:underline"
                >
                  Agregar lado
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-3">
                {lados.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto_auto] items-end gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-600">
                        Cantidad de pisos
                      </label>
                      <input
                        className={inputCls}
                        type="number"
                        min={1}
                        placeholder="0"
                        value={l.cantidadPisos}
                        onChange={(e) => updateLado(idx, { cantidadPisos: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-600">
                        Cantidad de camas
                      </label>
                      <input
                        className={inputCls}
                        type="number"
                        min={0}
                        placeholder="0"
                        value={l.cantidadCamas}
                        onChange={(e) => updateLado(idx, { cantidadCamas: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-600">Lado</label>
                      <input
                        className={inputCls}
                        placeholder="A"
                        value={l.nombre}
                        onChange={(e) => updateLado(idx, { nombre: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => updateLado(idx, { confirmado: !l.confirmado })}
                      title={l.confirmado ? 'Lado marcado como listo' : 'Marcar como listo'}
                      className={`flex h-11 w-11 items-center justify-center rounded-[10px] border ${
                        l.confirmado
                          ? 'border-green-300 bg-green-50 text-green-700'
                          : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLado(idx)}
                      disabled={lados.length === 1}
                      title="Quitar lado"
                      className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-gray-200 bg-white text-red-500 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
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
            disabled={pending}
            className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
          >
            {pending ? 'Guardando…' : 'Guardar área'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  area,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  area: AreaView;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        <div className="p-6">
          <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
            Eliminar área
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            ¿Seguro querés eliminar <strong>{area.nombre}</strong>? Se borran también todos los
            peines, lados, pisos y espacios asociados. Esta acción no se puede deshacer.
          </p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-[10px] border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-[10px] bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}
