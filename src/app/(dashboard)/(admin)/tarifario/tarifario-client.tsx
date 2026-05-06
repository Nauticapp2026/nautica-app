'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Edit3, History, Plus, Tag, Trash2, X } from 'lucide-react';

import {
  ajusteMasivoTarifasAction,
  createTarifaAction,
  deleteTarifaAction,
  getHistorialTarifaAction,
  updateTarifaAction,
  type AjusteMasivoData,
  type HistorialEntry,
} from '@/app/actions/tarifario';

export type TipoTarifa = 'cuota_mensual' | 'servicios' | 'espacios';
export type EstadoTarifa = 'activo' | 'inactivo';

export type MedidaTarifa =
  | 'hasta_16'
  | 'hasta_18'
  | 'hasta_19'
  | 'hasta_21'
  | 'hasta_23'
  | 'hasta_25'
  | 'hasta_29'
  | 'hasta_32'
  | 'hasta_35'
  | 'hasta_40'
  | 'hasta_42'
  | 'hasta_44'
  | 'hasta_46'
  | 'hasta_50'
  | 'hasta_55'
  | 'hasta_60'
  | 'hasta_65'
  | 'hasta_70'
  | 'hasta_74'
  | 'hasta_86'
  | 'hasta_105';

export type LocacionTarifa = 'camas' | 'amarra';
export type UnidadMetraje = 'metros' | 'pies';

export type Tarifa = {
  id: string;
  nombre: string;
  tipo: TipoTarifa;
  precio: number;
  estado: EstadoTarifa;
  medida: MedidaTarifa | null;
  locacion: LocacionTarifa | null;
  unidadMetraje: UnidadMetraje | null;
  eslora: number | null;
  manga: number | null;
  puntual: number | null;
};

const MEDIDAS: MedidaTarifa[] = [
  'hasta_16',
  'hasta_18',
  'hasta_19',
  'hasta_21',
  'hasta_23',
  'hasta_25',
  'hasta_29',
  'hasta_32',
  'hasta_35',
  'hasta_40',
  'hasta_42',
  'hasta_44',
  'hasta_46',
  'hasta_50',
  'hasta_55',
  'hasta_60',
  'hasta_65',
  'hasta_70',
  'hasta_74',
  'hasta_86',
  'hasta_105',
];

function medidaLabel(m: MedidaTarifa): string {
  return `Hasta ${m.replace('hasta_', '')}`;
}

type FiltroCategoria = 'todas' | TipoTarifa;

const CATEGORIAS: { key: FiltroCategoria; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'cuota_mensual', label: 'Cuota mensual' },
  { key: 'servicios', label: 'Servicios' },
  { key: 'espacios', label: 'Espacios' },
];

const TIPO_LABELS: Record<TipoTarifa, string> = {
  cuota_mensual: 'Cuota mensual',
  servicios: 'Servicios',
  espacios: 'Espacios',
};

const GRUPO_ORDER: TipoTarifa[] = ['cuota_mensual', 'servicios', 'espacios'];

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

function formatARS(n: number): string {
  return n.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  });
}

type ModalState = { mode: 'create' } | { mode: 'edit'; tarifa: Tarifa } | null;

export function TarifarioClient({ tarifas }: { tarifas: Tarifa[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<FiltroCategoria>('todas');
  const [modal, setModal] = useState<ModalState>(null);
  const [confirmDelete, setConfirmDelete] = useState<Tarifa | null>(null);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const filtered = filtro === 'todas' ? tarifas : tarifas.filter((t) => t.tipo === filtro);
    const map = new Map<TipoTarifa, Tarifa[]>();
    for (const t of filtered) {
      if (!map.has(t.tipo)) map.set(t.tipo, []);
      map.get(t.tipo)!.push(t);
    }
    return GRUPO_ORDER.filter((tipo) => map.has(tipo)).map((tipo) => ({
      tipo,
      tarifas: map.get(tipo)!,
    }));
  }, [tarifas, filtro]);

  const handleDelete = () => {
    if (!confirmDelete) return;
    setDeleteError(null);
    startDelete(async () => {
      const res = await deleteTarifaAction(confirmDelete.id);
      if (res.error) setDeleteError(res.error);
      else {
        setConfirmDelete(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="p-4 md:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Tarifario</h1>
          <p className="page-subtitle mt-1">Gestiona y actualiza las tarifas de servicios</p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create' })}
          className="flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249]"
        >
          <Plus className="h-4 w-4" />
          Nueva tarifa
        </button>
      </header>

      <AjusteMasivoSection totalTarifas={tarifas.length} onApplied={() => router.refresh()} />

      <section className="mb-6">
        <div
          className="mb-3 flex items-center gap-2 text-sm font-semibold"
          style={{ color: '#175861' }}
        >
          <Tag className="h-4 w-4" />
          Filtrar por categoría
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS.map((cat) => {
            const active = filtro === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setFiltro(cat.key)}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  active
                    ? 'bg-[#175861] font-semibold text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </section>

      {grupos.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-16 text-center">
          <p className="text-sm text-gray-500">
            {tarifas.length === 0
              ? 'Todavía no hay tarifas cargadas.'
              : 'Sin tarifas en esta categoría.'}
          </p>
        </div>
      ) : (
        grupos.map(({ tipo, tarifas: list }) => (
          <section key={tipo} className="mb-8">
            <h3
              className="mb-3 flex items-center gap-2 text-base font-bold"
              style={{ color: '#101828' }}
            >
              <Tag className="h-4 w-4" style={{ color: '#669E9D' }} />
              {TIPO_LABELS[tipo]}
            </h3>
            <TablaTarifas
              items={list}
              onEdit={(t) => setModal({ mode: 'edit', tarifa: t })}
              onDelete={(t) => {
                setDeleteError(null);
                setConfirmDelete(t);
              }}
            />
          </section>
        ))
      )}

      {modal && (
        <TarifaModal
          state={modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          tarifa={confirmDelete}
          pending={deleting}
          error={deleteError}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function TablaTarifas({
  items,
  onEdit,
  onDelete,
}: {
  items: Tarifa[];
  onEdit: (t: Tarifa) => void;
  onDelete: (t: Tarifa) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed text-sm">
          {/* Anchos fijos para que las 3 tablas (Cuota, Servicios, Espacios) queden alineadas verticalmente. */}
          <colgroup>
            <col className="w-[50%]" />
            <col className="w-[22%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-5 py-3 font-semibold">Concepto</th>
              <th className="px-5 py-3 font-semibold">Precio actual</th>
              <th className="px-5 py-3 font-semibold">Estado</th>
              <th className="px-5 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-5 py-3" style={{ color: '#101828' }}>
                  {t.nombre}
                </td>
                <td className="px-5 py-3" style={{ color: '#101828' }}>
                  {formatARS(t.precio)}
                </td>
                <td className="px-5 py-3">
                  <EstadoBadge estado={t.estado} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      title="Editar tarifa"
                      className="rounded-[8px] p-1.5 text-[#669E9D] hover:bg-gray-100"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(t)}
                      title="Eliminar tarifa"
                      className="rounded-[8px] p-1.5 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: EstadoTarifa }) {
  const cls = estado === 'activo' ? 'bg-[#ECFDF3] text-[#027A48]' : 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {estado === 'activo' ? 'Activo' : 'Inactivo'}
    </span>
  );
}

function TarifaModal({
  state,
  onClose,
  onSaved,
}: {
  state: NonNullable<ModalState>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.mode === 'edit';
  const initial = isEdit ? state.tarifa : null;

  const [tipo, setTipo] = useState<TipoTarifa | ''>(initial?.tipo ?? '');
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [precio, setPrecio] = useState<string>(initial ? String(initial.precio) : '');
  const [estado, setEstado] = useState<EstadoTarifa>(initial?.estado ?? 'activo');

  // Cuota mensual
  const [medida, setMedida] = useState<MedidaTarifa | ''>(initial?.medida ?? '');

  // Espacios
  const [locacion, setLocacion] = useState<LocacionTarifa>(initial?.locacion ?? 'camas');
  const [unidadMetraje, setUnidadMetraje] = useState<UnidadMetraje>(
    initial?.unidadMetraje ?? 'metros',
  );
  const [eslora, setEslora] = useState<string>(
    initial?.eslora != null ? String(initial.eslora) : '',
  );
  const [manga, setManga] = useState<string>(initial?.manga != null ? String(initial.manga) : '');
  const [puntual, setPuntual] = useState<string>(
    initial?.puntual != null ? String(initial.puntual) : '',
  );

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const esloraNum = Number(eslora);
  const conversion =
    Number.isFinite(esloraNum) && eslora !== ''
      ? unidadMetraje === 'metros'
        ? `${(esloraNum * 3.28084).toFixed(2)} pies`
        : `${(esloraNum / 3.28084).toFixed(2)} metros`
      : unidadMetraje === 'metros'
        ? '0 pies'
        : '0 metros';

  const handleSubmit = () => {
    setError(null);
    if (!tipo) {
      setError('Elegí una categoría.');
      return;
    }
    if (!nombre.trim()) {
      setError('El concepto es obligatorio.');
      return;
    }
    const precioNum = Number(precio);
    if (!Number.isFinite(precioNum) || precioNum < 0) {
      setError('El precio debe ser un número mayor o igual a 0.');
      return;
    }

    const toNumOrNull = (s: string): number | null => {
      if (s.trim() === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    let payload;
    if (tipo === 'cuota_mensual') {
      payload = {
        tipo: 'cuota_mensual' as const,
        nombre: nombre.trim(),
        precio: precioNum,
        medida: medida === '' ? null : medida,
      };
    } else if (tipo === 'espacios') {
      payload = {
        tipo: 'espacios' as const,
        nombre: nombre.trim(),
        precio: precioNum,
        locacion,
        unidadMetraje,
        eslora: toNumOrNull(eslora),
        manga: toNumOrNull(manga),
        puntual: toNumOrNull(puntual),
      };
    } else {
      payload = {
        tipo: 'servicios' as const,
        nombre: nombre.trim(),
        precio: precioNum,
      };
    }

    startTransition(async () => {
      const res = isEdit
        ? await updateTarifaAction({ ...payload, id: state.tarifa.id, estado })
        : await createTarifaAction(payload);
      if (res.error) setError(res.error);
      else onSaved();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              {isEdit ? 'Editar tarifa' : 'Nueva tarifa'}
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {isEdit ? 'Modificá los datos de la tarifa' : 'Completá los datos de la nueva tarifa'}
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

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Categoría</label>
            <select
              className={inputCls}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoTarifa)}
            >
              <option value="">Seleccione una opción…</option>
              <option value="cuota_mensual">Cuota mensual</option>
              <option value="servicios">Servicios</option>
              <option value="espacios">Espacios</option>
            </select>
          </div>

          {tipo === 'espacios' && (
            <>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Locación</label>
                <div className="flex gap-5">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={locacion === 'camas'}
                      onChange={() => setLocacion('camas')}
                    />
                    Camas
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={locacion === 'amarra'}
                      onChange={() => setLocacion('amarra')}
                    />
                    Amarra
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  ¿Cómo desea cargar el metraje?
                </label>
                <div className="flex gap-5">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={unidadMetraje === 'metros'}
                      onChange={() => setUnidadMetraje('metros')}
                    />
                    Metros
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={unidadMetraje === 'pies'}
                      onChange={() => setUnidadMetraje('pies')}
                    />
                    Pies
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">
                    Eslora ({unidadMetraje})
                  </label>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    step="0.01"
                    value={eslora}
                    onChange={(e) => setEslora(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Manga</label>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    step="0.01"
                    value={manga}
                    onChange={(e) => setManga(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Puntual</label>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    step="0.01"
                    value={puntual}
                    onChange={(e) => setPuntual(e.target.value)}
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-gray-500">{conversion}</p>
            </>
          )}

          {tipo !== 'espacios' && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Concepto</label>
              <input
                className={inputCls}
                placeholder="Ej: Mantenimiento mensual"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
          )}

          {tipo === 'espacios' && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Concepto</label>
              <input
                className={inputCls}
                placeholder="Ej: Amarra 10m"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
          )}

          {tipo === 'cuota_mensual' && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Medida</label>
              <select
                className={inputCls}
                value={medida}
                onChange={(e) => setMedida(e.target.value as MedidaTarifa | '')}
              >
                <option value="">Seleccione una opción…</option>
                {MEDIDAS.map((m) => (
                  <option key={m} value={m}>
                    {medidaLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Precio</label>
            <input
              className={inputCls}
              type="number"
              min={0}
              step="0.01"
              placeholder="Precio"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          </div>

          {isEdit && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Estado</label>
              <select
                className={inputCls}
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoTarifa)}
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {isEdit && <HistorialAccordion servicioId={state.tarifa.id} />}
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
            onClick={handleSubmit}
            disabled={pending}
            className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
          >
            {pending ? 'Guardando…' : 'Guardar tarifa'}
          </button>
        </div>
      </div>
    </div>
  );
}

const ORIGEN_LABELS: Record<HistorialEntry['origen'], string> = {
  manual: 'Edición manual',
  masivo_porcentaje: 'Ajuste masivo (%)',
  masivo_monto: 'Ajuste masivo (monto)',
};

const FECHA_FMT = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function HistorialAccordion({ servicioId }: { servicioId: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistorialEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && entries === null && !loading) {
      setLoading(true);
      setError(null);
      try {
        const res = await getHistorialTarifaAction(servicioId);
        if (res.error) setError(res.error);
        else setEntries(res.entries ?? []);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="rounded-[10px] border border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-[#101828]"
      >
        <span className="flex items-center gap-2">
          <History className="h-4 w-4 text-[#669E9D]" />
          Historial de cambios
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 py-3">
          {loading && <p className="text-xs text-gray-500">Cargando…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {!loading && !error && entries && entries.length === 0 && (
            <p className="text-xs text-gray-500">Esta tarifa todavía no registró cambios.</p>
          )}
          {!loading && !error && entries && entries.length > 0 && (
            <ul className="space-y-2">
              {entries.map((e) => {
                const ant = e.precioAnterior;
                const nuevo = e.precioNuevo;
                const delta =
                  ant != null && nuevo != null && ant !== 0 ? ((nuevo - ant) / ant) * 100 : null;
                return (
                  <li
                    key={e.id}
                    className="flex flex-col gap-0.5 rounded-[8px] bg-white px-3 py-2 text-xs"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-[#101828]">
                        {ant != null ? formatARS(ant) : '—'}{' '}
                        <span className="text-gray-400">→</span>{' '}
                        {nuevo != null ? formatARS(nuevo) : '—'}
                      </span>
                      {delta != null && (
                        <span
                          className={`font-semibold ${
                            delta >= 0 ? 'text-green-700' : 'text-red-600'
                          }`}
                        >
                          {delta >= 0 ? '+' : ''}
                          {delta.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-gray-500">
                      <span>{FECHA_FMT.format(new Date(e.createdAt))}</span>
                      <span>·</span>
                      <span>{ORIGEN_LABELS[e.origen] ?? e.origen}</span>
                      {e.usuarioNombre && (
                        <>
                          <span>·</span>
                          <span>{e.usuarioNombre}</span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AjusteMasivoSection({
  totalTarifas,
  onApplied,
}: {
  totalTarifas: number;
  onApplied: () => void;
}) {
  const [tipo, setTipo] = useState<'' | AjusteMasivoData['tipo']>('');
  const [direccion, setDireccion] = useState<'aumento' | 'descuento'>('aumento');
  const [valor, setValor] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const valorNum = Number(valor);
  const sobrepasa100 = tipo === 'porcentaje' && direccion === 'descuento' && valorNum > 100;
  const valido =
    Boolean(tipo) && Number.isFinite(valorNum) && valorNum >= 0 && valor !== '' && !sobrepasa100;
  const sinTarifas = totalTarifas === 0;

  const handleAplicar = () => {
    setFeedback(null);
    if (sobrepasa100) {
      setFeedback({ type: 'error', msg: 'El descuento no puede superar el 100%.' });
      return;
    }
    if (!valido) {
      setFeedback({ type: 'error', msg: 'Elegí tipo de ajuste y un valor ≥ 0.' });
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    if (!tipo || !Number.isFinite(valorNum)) return;
    setFeedback(null);
    startTransition(async () => {
      const payload: AjusteMasivoData =
        tipo === 'porcentaje'
          ? { tipo: 'porcentaje', direccion, valor: valorNum }
          : { tipo: 'monto', valor: valorNum };
      const res = await ajusteMasivoTarifasAction(payload);
      if (res.error) {
        setFeedback({ type: 'error', msg: res.error });
        setConfirmOpen(false);
      } else {
        setConfirmOpen(false);
        setValor('');
        setTipo('');
        setDireccion('aumento');
        setFeedback({
          type: 'success',
          msg: `Ajuste aplicado a ${res.afectadas ?? 0} tarifa(s).`,
        });
        onApplied();
      }
    });
  };

  const previewTexto =
    tipo === 'porcentaje'
      ? `${direccion === 'aumento' ? 'un aumento' : 'un descuento'} de ${valor}%`
      : tipo === 'monto'
        ? `el monto fijo $${valor} (se reemplaza el precio actual)`
        : '';

  return (
    <>
      <section className="mb-6 rounded-2xl border border-gray-200 bg-[#F3F6F6] p-5">
        <h2 className="mb-1 text-sm font-bold" style={{ color: '#101828' }}>
          Ajuste Masivo de Tarifas
        </h2>
        <p className="mb-4 text-xs text-gray-500">
          Se aplicará a todas las tarifas ({totalTarifas}) sin importar el filtro.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <select
            className={`${inputCls} max-w-[220px]`}
            value={tipo}
            onChange={(e) => {
              const next = e.target.value as '' | AjusteMasivoData['tipo'];
              setTipo(next);
              if (next !== 'porcentaje') setDireccion('aumento');
              setFeedback(null);
            }}
          >
            <option value="">Seleccione una opción…</option>
            <option value="porcentaje">Porcentaje</option>
            <option value="monto">Monto</option>
          </select>

          {tipo === 'porcentaje' && (
            <select
              className={`${inputCls} max-w-[180px]`}
              value={direccion}
              onChange={(e) => {
                setDireccion(e.target.value as 'aumento' | 'descuento');
                setFeedback(null);
              }}
            >
              <option value="aumento">Aumentar</option>
              <option value="descuento">Descontar</option>
            </select>
          )}

          {tipo && (
            <input
              className={`${inputCls} max-w-[180px]`}
              type="number"
              min={0}
              step={tipo === 'porcentaje' ? '0.1' : '0.01'}
              placeholder={tipo === 'porcentaje' ? 'Ej: 10' : 'Ej: 500'}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setFeedback(null);
              }}
            />
          )}

          <button
            type="button"
            onClick={handleAplicar}
            disabled={!valido || sinTarifas || pending}
            className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Aplicar a todas
          </button>
        </div>

        {feedback && (
          <p
            className={`mt-3 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}
          >
            {feedback.msg}
          </p>
        )}
      </section>

      {confirmOpen && tipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
            <div className="p-6">
              <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
                Confirmar ajuste masivo
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Se va a aplicar <strong>{previewTexto}</strong> a las{' '}
                <strong>{totalTarifas}</strong> tarifa(s) de tu guardería. Esta acción no se puede
                deshacer con un solo clic.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="rounded-[10px] border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending}
                className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
              >
                {pending ? 'Aplicando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ConfirmDeleteModal({
  tarifa,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  tarifa: Tarifa;
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
            Eliminar tarifa
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            ¿Seguro querés eliminar <strong>{tarifa.nombre}</strong>? Esta acción no se puede
            deshacer.
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
