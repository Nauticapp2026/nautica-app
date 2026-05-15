'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Anchor,
  Building2,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { toast } from 'sonner';

import {
  addEspacioToMarinaAction,
  addEspacioToPisoAction,
  addPisoAction,
  createAreaAction,
  deleteAreaAction,
  deleteEspacioAction,
  deletePeineAction,
  deletePisoAction,
  moveEspacioToMarinaAction,
  moveEspacioToPisoAction,
  moveOcupanteAction,
  reorderEspaciosAction,
  updateEspacioAction,
  type CreateAreaInput,
} from '@/app/actions/espacios';
import { EmptyState } from '@/components/shared/empty-state';
import { ImportAreasModal } from './import-areas-modal';

export type EstadoEspacio = 'ocupado' | 'reservado' | 'disponible';

export type EspacioCell = {
  id: string;
  nomenclatura: string;
  estado: EstadoEspacio;
  ocupanteId: string | null;
  servicioId: string | null;
  eslora: number | null;
  manga: number | null;
  puntual: number | null;
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

export type SocioOpt = { id: string; nombre: string };

export type ServicioEspacio = {
  id: string;
  nombre: string;
  precio: number;
  eslora: number | null;
  manga: number | null;
  puntual: number | null;
  unidadMetraje: 'metros' | 'pies' | null;
};

type Filtro = 'marina' | 'nave';

export type LugarEspacio =
  | { tipo: 'marina'; peine: string }
  | { tipo: 'nave'; lado: string; piso: string };

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

export function EspaciosClient({
  areas,
  socios,
  serviciosEspacios,
  esloraMaxPorSocio,
}: {
  areas: AreaView[];
  socios: SocioOpt[];
  serviciosEspacios: ServicioEspacio[];
  esloraMaxPorSocio: Record<string, number>;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>('marina');
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AreaView | null>(null);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [confirmDeleteEspacio, setConfirmDeleteEspacio] = useState<EspacioCell | null>(null);
  const [deletingEspacio, startDeleteEspacio] = useTransition();
  const [deleteEspacioError, setDeleteEspacioError] = useState<string | null>(null);

  const [editEspacio, setEditEspacio] = useState<{
    cell: EspacioCell;
    areaNombre: string;
    lugar: LugarEspacio;
  } | null>(null);

  const [cambiarUbicacion, setCambiarUbicacion] = useState<{
    cell: EspacioCell;
    origenLabel: string;
    ocupanteNombre: string;
  } | null>(null);

  // ─── Búsqueda de espacios para asignar a un cliente ─────────────────────────
  const [searchEslora, setSearchEslora] = useState('');
  const [searchManga, setSearchManga] = useState('');
  const [searchUnidad, setSearchUnidad] = useState<'m' | 'ft'>('m');
  const [searchTipoBusqueda, setSearchTipoBusqueda] = useState<'' | 'marina' | 'nave'>('');
  const [searchSoloDisponibles, setSearchSoloDisponibles] = useState(true);

  // Mapa: servicioId → unidad de medida ('metros' | 'pies' | null). Si una
  // tarifa está cargada en pies, los espacios que la usan tienen su eslora
  // / manga en pies. El filtro respeta esa unidad: si el admin busca en
  // metros, solo aparecen espacios con tarifa en metros, sin conversión.
  const unidadPorServicio = useMemo(() => {
    const m = new Map<string, 'metros' | 'pies' | null>();
    for (const s of serviciosEspacios) m.set(s.id, s.unidadMetraje);
    return m;
  }, [serviciosEspacios]);

  // Lista plana de todos los espacios con su contexto (área + lugar). Sirve
  // de input al buscador de espacios.
  const espaciosFlat = useMemo(() => {
    const list: {
      cell: EspacioCell;
      areaNombre: string;
      tipo: 'marina' | 'nave';
      lugar: LugarEspacio;
      lugarLabel: string;
    }[] = [];
    for (const a of areas) {
      for (const p of a.peines) {
        for (const e of p.espacios) {
          list.push({
            cell: e,
            areaNombre: a.nombre,
            tipo: 'marina',
            lugar: { tipo: 'marina', peine: p.nombre },
            lugarLabel: `${a.nombre} · ${p.nombre} · ${e.nomenclatura}`,
          });
        }
      }
      for (const l of a.lados) {
        for (const pi of l.pisos) {
          for (const e of pi.espacios) {
            list.push({
              cell: e,
              areaNombre: a.nombre,
              tipo: 'nave',
              lugar: { tipo: 'nave', lado: l.nombre, piso: pi.nombre },
              lugarLabel: `${a.nombre} · ${l.nombre} · ${pi.nombre} · ${e.nomenclatura}`,
            });
          }
        }
      }
    }
    return list;
  }, [areas]);

  const hayFiltroActivo =
    searchEslora.trim() !== '' || searchManga.trim() !== '' || searchTipoBusqueda !== '';

  const searchResults = useMemo(() => {
    if (!hayFiltroActivo) return [];
    const esloraMin = parseFloat(searchEslora.replace(',', '.'));
    const mangaMin = parseFloat(searchManga.replace(',', '.'));
    const unidadBuscada: 'metros' | 'pies' = searchUnidad === 'm' ? 'metros' : 'pies';

    return espaciosFlat.filter((e) => {
      if (searchTipoBusqueda && e.tipo !== searchTipoBusqueda) return false;
      if (searchSoloDisponibles && e.cell.estado !== 'disponible') return false;
      // El espacio debe tener tarifa asignada y la unidad de la tarifa
      // tiene que matchear con la unidad seleccionada en el filtro.
      const unidadEspacio = e.cell.servicioId ? unidadPorServicio.get(e.cell.servicioId) : null;
      if (!unidadEspacio || unidadEspacio !== unidadBuscada) return false;
      if (Number.isFinite(esloraMin)) {
        if (e.cell.eslora == null || e.cell.eslora < esloraMin) return false;
      }
      if (Number.isFinite(mangaMin)) {
        if (e.cell.manga == null || e.cell.manga < mangaMin) return false;
      }
      return true;
    });
  }, [
    espaciosFlat,
    hayFiltroActivo,
    searchEslora,
    searchManga,
    searchUnidad,
    searchTipoBusqueda,
    searchSoloDisponibles,
    unidadPorServicio,
  ]);

  function limpiarBusqueda() {
    setSearchEslora('');
    setSearchManga('');
    setSearchUnidad('m');
    setSearchTipoBusqueda('');
    setSearchSoloDisponibles(true);
  }

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (areaId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });

  const [confirmDeleteContenedor, setConfirmDeleteContenedor] = useState<{
    tipo: 'peine' | 'piso';
    id: string;
    nombre: string;
    espaciosCount: number;
    ocupadosCount: number;
  } | null>(null);
  const [deletingContenedor, startDeleteContenedor] = useTransition();
  const [deleteContenedorError, setDeleteContenedorError] = useState<string | null>(null);

  // Drag-and-drop global de espacios. Un único DndContext envuelve todas las
  // áreas para permitir mover entre áreas distintas (cross-area). El handler
  // distingue:
  //  - Drop sobre otro espacio del mismo contenedor → reorder dentro del contenedor.
  //  - Drop sobre otro espacio de otro contenedor → mover al contenedor del otro.
  //  - Drop sobre el contenedor (piso/peine vacío o area gris) → mover al contenedor.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [movingId, setMovingId] = useState<string | null>(null);

  // Mapas: espacioId → containerKey ("piso:xxx" o "peine:xxx") y containerKey
  // → lista ordenada de espacioIds. Se calculan a partir de las areas.
  const { espacioToContainer, containerToEspacios } = useMemo(() => {
    const e2c = new Map<string, string>();
    const c2e = new Map<string, string[]>();
    for (const a of areas) {
      for (const p of a.peines) {
        const key = `peine:${p.marinaId}`;
        c2e.set(
          key,
          p.espacios.map((e) => e.id),
        );
        for (const e of p.espacios) e2c.set(e.id, key);
      }
      for (const l of a.lados) {
        for (const pi of l.pisos) {
          const key = `piso:${pi.pisoId}`;
          c2e.set(
            key,
            pi.espacios.map((e) => e.id),
          );
          for (const e of pi.espacios) e2c.set(e.id, key);
        }
      }
    }
    return { espacioToContainer: e2c, containerToEspacios: c2e };
  }, [areas]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeParts = String(active.id).split(':');
    const overParts = String(over.id).split(':');
    if (activeParts.length !== 2 || overParts.length !== 2) return;
    const [activeTipo, activeId] = activeParts;
    const [overTipo, overId] = overParts;

    // Caso A: drop sobre otro espacio (sortable).
    if (overTipo === 'nave' || overTipo === 'marina') {
      if (activeTipo !== overTipo) return;
      const sourceKey = espacioToContainer.get(activeId);
      const targetKey = espacioToContainer.get(overId);
      if (!sourceKey || !targetKey) return;

      if (sourceKey === targetKey) {
        // Reorder dentro del mismo contenedor.
        const items = containerToEspacios.get(sourceKey) ?? [];
        const fromIdx = items.indexOf(activeId);
        const toIdx = items.indexOf(overId);
        if (fromIdx < 0 || toIdx < 0) return;
        const newOrder = arrayMove(items, fromIdx, toIdx);
        setMovingId(activeId);
        void reorderEspaciosAction(newOrder).then((res) => {
          setMovingId(null);
          if (res.error) {
            console.error('[reorderEspaciosAction]', res.error);
            alert(`No se pudo reordenar: ${res.error}`);
            return;
          }
          router.refresh();
        });
      } else {
        // Diferente contenedor: mover al contenedor del espacio target.
        const [targetContainerTipo, targetContainerId] = targetKey.split(':');
        const isNaveMove = activeTipo === 'nave' && targetContainerTipo === 'piso';
        const isMarinaMove = activeTipo === 'marina' && targetContainerTipo === 'peine';
        if (!isNaveMove && !isMarinaMove) return;
        setMovingId(activeId);
        const promise = isNaveMove
          ? moveEspacioToPisoAction(activeId, targetContainerId)
          : moveEspacioToMarinaAction(activeId, targetContainerId);
        void promise.then((res) => {
          setMovingId(null);
          if (res.error) {
            console.error('[moveEspacio]', res.error);
            alert(`No se pudo mover el espacio: ${res.error}`);
          }
          router.refresh();
        });
      }
      return;
    }

    // Caso B: drop sobre un contenedor (piso o peine).
    const isNaveMove = activeTipo === 'nave' && overTipo === 'piso';
    const isMarinaMove = activeTipo === 'marina' && overTipo === 'peine';
    if (!isNaveMove && !isMarinaMove) return;

    setMovingId(activeId);
    const promise = isNaveMove
      ? moveEspacioToPisoAction(activeId, overId)
      : moveEspacioToMarinaAction(activeId, overId);

    void promise.then((res) => {
      setMovingId(null);
      if (res.error) {
        console.error('[moveEspacio]', res.error);
        alert(`No se pudo mover el espacio: ${res.error}`);
      }
      router.refresh();
    });
  };

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

  const onDeleteEspacio = () => {
    if (!confirmDeleteEspacio) return;
    setDeleteEspacioError(null);
    startDeleteEspacio(async () => {
      const res = await deleteEspacioAction(confirmDeleteEspacio.id);
      if (res.error) {
        setDeleteEspacioError(res.error);
        toast.error(res.error);
      } else {
        toast.success('Espacio eliminado.');
        setConfirmDeleteEspacio(null);
        router.refresh();
      }
    });
  };

  const onDeleteContenedor = () => {
    if (!confirmDeleteContenedor) return;
    setDeleteContenedorError(null);
    startDeleteContenedor(async () => {
      const res =
        confirmDeleteContenedor.tipo === 'peine'
          ? await deletePeineAction(confirmDeleteContenedor.id)
          : await deletePisoAction(confirmDeleteContenedor.id);
      if (res.error) setDeleteContenedorError(res.error);
      else {
        setConfirmDeleteContenedor(null);
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
    <div className="p-4 md:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Gestión de espacios</h1>
          <p className="page-subtitle mt-1">
            Creá áreas con peines y amarras, asigná clientes y embarcaciones
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <Upload className="h-4 w-4" />
            Importar áreas
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249]"
          >
            <Plus className="h-4 w-4" />
            Nueva área
          </button>
        </div>
      </header>

      <ImportAreasModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total de espacios" value={totales.total} accent="#101828" />
        <StatCard label="Ocupados" value={totales.ocupado} accent="#B42318" />
        <StatCard label="Reservados" value={totales.reservado} accent="#B54708" />
        <StatCard label="Disponibles" value={totales.disponible} accent="#039855" />
      </div>

      {/* Buscador de espacios para asignar a un cliente */}
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" style={{ color: '#669E9D' }} />
            <h2 className="text-base font-bold" style={{ color: '#101828' }}>
              Buscar espacio
            </h2>
          </div>
          {hayFiltroActivo && (
            <button
              type="button"
              onClick={limpiarBusqueda}
              className="text-xs font-semibold text-[#175861] hover:underline"
            >
              Limpiar
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Eslora del barco
            </label>
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder={searchUnidad === 'm' ? 'Ej: 10' : 'Ej: 30'}
              value={searchEslora}
              onChange={(e) => setSearchEslora(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Manga del barco
            </label>
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder="Opcional"
              value={searchManga}
              onChange={(e) => setSearchManga(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Unidad</label>
            <select
              className={inputCls}
              value={searchUnidad}
              onChange={(e) => setSearchUnidad(e.target.value as 'm' | 'ft')}
            >
              <option value="m">Metros</option>
              <option value="ft">Pies</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Tipo</label>
            <select
              className={inputCls}
              value={searchTipoBusqueda}
              onChange={(e) => setSearchTipoBusqueda(e.target.value as '' | 'marina' | 'nave')}
            >
              <option value="">Cualquiera</option>
              <option value="marina">Marina</option>
              <option value="nave">Nave</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828]">
              <input
                type="checkbox"
                checked={searchSoloDisponibles}
                onChange={(e) => setSearchSoloDisponibles(e.target.checked)}
                className="h-4 w-4 accent-[#175861]"
              />
              Solo disponibles
            </label>
          </div>
        </div>

        {hayFiltroActivo && (
          <div className="mt-5">
            <p className="mb-2 text-xs text-gray-500">
              {searchResults.length === 0
                ? 'No se encontraron espacios que cumplan los criterios.'
                : `${searchResults.length} espacio${searchResults.length === 1 ? '' : 's'} encontrado${searchResults.length === 1 ? '' : 's'}.`}
            </p>
            {searchResults.length > 0 && (
              <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                      <th className="px-4 py-3">Ubicación</th>
                      <th className="px-4 py-3 text-right">Eslora</th>
                      <th className="px-4 py-3 text-right">Manga</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((r) => (
                      <tr key={r.cell.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-medium" style={{ color: '#175861' }}>
                          {r.lugarLabel}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {r.cell.eslora != null
                            ? `${r.cell.eslora} ${searchUnidad === 'm' ? 'm' : 'pies'}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {r.cell.manga != null
                            ? `${r.cell.manga} ${searchUnidad === 'm' ? 'm' : 'pies'}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                              r.cell.estado === 'disponible'
                                ? 'bg-green-100 text-green-700'
                                : r.cell.estado === 'reservado'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {r.cell.estado === 'disponible'
                              ? 'Disponible'
                              : r.cell.estado === 'reservado'
                                ? 'Reservado'
                                : 'Ocupado'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setEditEspacio({
                                cell: r.cell,
                                areaNombre: r.areaNombre,
                                lugar: r.lugar,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#175861] hover:bg-gray-50"
                          >
                            Editar / Asignar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4" style={{ color: '#669E9D' }} />
          <h2 className="text-base font-bold" style={{ color: '#101828' }}>
            Areas ({areas.length})
          </h2>
        </div>
        {areas.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-7 w-7 opacity-40" />}
            text="Todavía no hay áreas cargadas."
          />
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
        <div className="rounded-2xl border border-gray-200 bg-white">
          <EmptyState
            icon={
              filtro === 'marina' ? (
                <Anchor className="h-7 w-7 opacity-40" />
              ) : (
                <Building2 className="h-7 w-7 opacity-40" />
              )
            }
            text={`No hay áreas de tipo ${filtro === 'marina' ? 'marina' : 'nave'} cargadas.`}
          />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className="space-y-4">
            {areasFiltradas.map((a) =>
              a.tipo === 'marina' ? (
                <MarinaSection
                  key={a.id}
                  area={a}
                  collapsed={collapsed.has(a.id)}
                  movingId={movingId}
                  onToggleCollapsed={() => toggleCollapsed(a.id)}
                  onEditEspacio={(cell, lugar) =>
                    setEditEspacio({ cell, areaNombre: a.nombre, lugar })
                  }
                  onDeleteEspacio={(cell) => {
                    setDeleteEspacioError(null);
                    setConfirmDeleteEspacio(cell);
                  }}
                  onDeletePeine={(p) => {
                    setDeleteContenedorError(null);
                    setConfirmDeleteContenedor({
                      tipo: 'peine',
                      id: p.marinaId,
                      nombre: p.nombre,
                      espaciosCount: p.espacios.length,
                      ocupadosCount: p.espacios.filter((e) => e.estado === 'ocupado').length,
                    });
                  }}
                  onAddEspacio={async (marinaId) => {
                    const res = await addEspacioToMarinaAction(marinaId);
                    if (!res.error) router.refresh();
                  }}
                />
              ) : (
                <NaveSection
                  key={a.id}
                  area={a}
                  collapsed={collapsed.has(a.id)}
                  movingId={movingId}
                  onToggleCollapsed={() => toggleCollapsed(a.id)}
                  onEditEspacio={(cell, lugar) =>
                    setEditEspacio({ cell, areaNombre: a.nombre, lugar })
                  }
                  onDeleteEspacio={(cell) => {
                    setDeleteEspacioError(null);
                    setConfirmDeleteEspacio(cell);
                  }}
                  onDeletePiso={(pi) => {
                    setDeleteContenedorError(null);
                    setConfirmDeleteContenedor({
                      tipo: 'piso',
                      id: pi.pisoId,
                      nombre: pi.nombre,
                      espaciosCount: pi.espacios.length,
                      ocupadosCount: pi.espacios.filter((e) => e.estado === 'ocupado').length,
                    });
                  }}
                  onAddEspacio={async (pisoId) => {
                    const res = await addEspacioToPisoAction(pisoId);
                    if (!res.error) router.refresh();
                  }}
                />
              ),
            )}
          </div>
        </DndContext>
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

      {confirmDeleteEspacio && (
        <ConfirmDeleteEspacioModal
          espacio={confirmDeleteEspacio}
          pending={deletingEspacio}
          error={deleteEspacioError}
          onCancel={() => setConfirmDeleteEspacio(null)}
          onConfirm={onDeleteEspacio}
        />
      )}

      {confirmDeleteContenedor && (
        <ConfirmDeleteContenedorModal
          contenedor={confirmDeleteContenedor}
          pending={deletingContenedor}
          error={deleteContenedorError}
          onCancel={() => setConfirmDeleteContenedor(null)}
          onConfirm={onDeleteContenedor}
        />
      )}

      {editEspacio && (
        <EditarEspacioModal
          cell={editEspacio.cell}
          areaNombre={editEspacio.areaNombre}
          lugar={editEspacio.lugar}
          socios={socios}
          serviciosEspacios={serviciosEspacios}
          onClose={() => setEditEspacio(null)}
          onSaved={() => {
            setEditEspacio(null);
            router.refresh();
          }}
          onDelete={() => {
            setDeleteEspacioError(null);
            setConfirmDeleteEspacio(editEspacio.cell);
            setEditEspacio(null);
          }}
          onCambiarUbicacion={() => {
            const lugar = editEspacio.lugar;
            const breadcrumb =
              lugar.tipo === 'marina'
                ? `${editEspacio.areaNombre} · ${lugar.peine} · ${editEspacio.cell.nomenclatura}`
                : `${editEspacio.areaNombre} · ${lugar.lado} · ${lugar.piso} · ${editEspacio.cell.nomenclatura}`;
            const ocupante = socios.find((s) => s.id === editEspacio.cell.ocupanteId);
            setCambiarUbicacion({
              cell: editEspacio.cell,
              origenLabel: breadcrumb,
              ocupanteNombre: ocupante?.nombre ?? 'Cliente',
            });
            setEditEspacio(null);
          }}
        />
      )}

      {cambiarUbicacion &&
        (() => {
          const ocupanteId = cambiarUbicacion.cell.ocupanteId;
          const esloraMaxM = ocupanteId ? (esloraMaxPorSocio[ocupanteId] ?? 0) : 0;
          // Eslora del espacio destino expresada en metros. Si el espacio
          // no tiene tarifa asignada (unidad desconocida), asumimos metros.
          // Si no tiene eslora cargada, devuelve null (no se valida).
          const esloraDestinoM = (cell: EspacioCell): number | null => {
            if (cell.eslora == null) return null;
            const unidad = cell.servicioId
              ? (unidadPorServicio.get(cell.servicioId) ?? 'metros')
              : 'metros';
            return unidad === 'pies' ? cell.eslora * 0.3048 : cell.eslora;
          };
          return (
            <CambiarUbicacionModal
              cell={cambiarUbicacion.cell}
              origenLabel={cambiarUbicacion.origenLabel}
              ocupanteNombre={cambiarUbicacion.ocupanteNombre}
              destinos={espaciosFlat
                .filter(
                  (e) =>
                    e.cell.id !== cambiarUbicacion.cell.id &&
                    e.cell.estado === 'disponible' &&
                    !e.cell.ocupanteId,
                )
                .filter((e) => {
                  if (esloraMaxM <= 0) return true;
                  const m = esloraDestinoM(e.cell);
                  if (m == null) return true;
                  return m + 0.01 >= esloraMaxM;
                })
                .map((e) => ({ id: e.cell.id, label: e.lugarLabel }))}
              onClose={() => setCambiarUbicacion(null)}
              onSaved={() => {
                setCambiarUbicacion(null);
                router.refresh();
              }}
            />
          );
        })()}
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

function MarinaSection({
  area,
  collapsed,
  movingId,
  onToggleCollapsed,
  onEditEspacio,
  onDeleteEspacio,
  onDeletePeine,
  onAddEspacio,
}: {
  area: AreaView;
  collapsed: boolean;
  movingId: string | null;
  onToggleCollapsed: () => void;
  onEditEspacio: (cell: EspacioCell, lugar: LugarEspacio) => void;
  onDeleteEspacio: (cell: EspacioCell) => void;
  onDeletePeine: (peine: AreaView['peines'][number]) => void;
  onAddEspacio: (marinaId: string) => Promise<void>;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className={`flex w-full items-center gap-2 bg-[#175861] px-5 py-3 text-left text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] ${
          collapsed ? 'rounded-2xl' : 'rounded-t-2xl'
        }`}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        <Building2 className="h-4 w-4" />
        {area.nombre}
      </button>
      {collapsed ? null : (
        <div className="space-y-5 p-5">
          {area.peines.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">Sin peines cargados.</p>
          ) : (
            area.peines.map((p) => (
              <div key={p.marinaId}>
                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <Anchor className="h-3.5 w-3.5" />
                    {p.nombre}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeletePeine(p)}
                    title={`Eliminar ${p.nombre}`}
                    className="rounded-[8px] p-1 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <DroppablePeine
                  marinaId={p.marinaId}
                  espacios={p.espacios}
                  movingId={movingId}
                  onEditEspacio={(cell) => onEditEspacio(cell, { tipo: 'marina', peine: p.nombre })}
                  onDeleteEspacio={onDeleteEspacio}
                  onAddEspacio={() => onAddEspacio(p.marinaId)}
                />
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

function NaveSection({
  area,
  collapsed,
  movingId,
  onToggleCollapsed,
  onEditEspacio,
  onDeleteEspacio,
  onDeletePiso,
  onAddEspacio,
}: {
  area: AreaView;
  collapsed: boolean;
  movingId: string | null;
  onToggleCollapsed: () => void;
  onEditEspacio: (cell: EspacioCell, lugar: LugarEspacio) => void;
  onDeleteEspacio: (cell: EspacioCell) => void;
  onDeletePiso: (piso: AreaView['lados'][number]['pisos'][number]) => void;
  onAddEspacio: (pisoId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pendingAddPiso, startAddPiso] = useTransition();

  const onAddPiso = (ladoId: string) => {
    startAddPiso(async () => {
      const res = await addPisoAction(ladoId);
      if (!res.error) router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className={`flex w-full items-center gap-2 bg-[#175861] px-5 py-3 text-left text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] ${
          collapsed ? 'rounded-2xl' : 'rounded-t-2xl'
        }`}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        <Anchor className="h-4 w-4" />
        {area.nombre}
      </button>
      {collapsed ? null : (
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
                    <DroppablePiso
                      key={pi.pisoId}
                      pisoId={pi.pisoId}
                      nombre={pi.nombre}
                      espacios={pi.espacios}
                      movingId={movingId}
                      onEditEspacio={(cell) =>
                        onEditEspacio(cell, {
                          tipo: 'nave',
                          lado: l.nombre,
                          piso: pi.nombre,
                        })
                      }
                      onDeleteEspacio={onDeleteEspacio}
                      onDeletePiso={() => onDeletePiso(pi)}
                      onAddEspacio={() => onAddEspacio(pi.pisoId)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => onAddPiso(l.ladoId)}
                    disabled={pendingAddPiso}
                    className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:border-[#175861] hover:text-[#175861] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {pendingAddPiso ? 'Agregando...' : 'Agregar piso'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DroppablePiso({
  pisoId,
  nombre,
  espacios,
  movingId,
  onEditEspacio,
  onDeleteEspacio,
  onDeletePiso,
  onAddEspacio,
}: {
  pisoId: string;
  nombre: string;
  espacios: EspacioCell[];
  movingId: string | null;
  onEditEspacio: (cell: EspacioCell) => void;
  onDeleteEspacio: (cell: EspacioCell) => void;
  onDeletePiso: () => void;
  onAddEspacio: () => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `piso:${pisoId}` });
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-400">{nombre}</p>
        <button
          type="button"
          onClick={onDeletePiso}
          title={`Eliminar ${nombre}`}
          className="rounded-[8px] p-0.5 text-red-500 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[2.5rem] rounded-[10px] border p-1.5 transition-colors ${
          isOver ? 'border-[#175861] bg-[#D9EBE9]/40' : 'border-dashed border-transparent'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {espacios.length === 0 ? (
            <p className="px-1 py-1 text-[11px] text-gray-400">Sin espacios.</p>
          ) : (
            <SortableContext
              items={espacios.map((e) => `nave:${e.id}`)}
              strategy={rectSortingStrategy}
            >
              {espacios.map((e) => (
                <SortableEspacio
                  key={e.id}
                  cell={e}
                  tipo="nave"
                  isMoving={movingId === e.id}
                  onEdit={() => onEditEspacio(e)}
                  onDelete={() => onDeleteEspacio(e)}
                />
              ))}
            </SortableContext>
          )}
          <AddEspacioButton onAdd={onAddEspacio} />
        </div>
      </div>
    </div>
  );
}

function DroppablePeine({
  marinaId,
  espacios,
  movingId,
  onEditEspacio,
  onDeleteEspacio,
  onAddEspacio,
}: {
  marinaId: string;
  espacios: EspacioCell[];
  movingId: string | null;
  onEditEspacio: (cell: EspacioCell) => void;
  onDeleteEspacio: (cell: EspacioCell) => void;
  onAddEspacio: () => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `peine:${marinaId}` });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[2.5rem] rounded-[10px] border p-1.5 transition-colors ${
        isOver ? 'border-[#175861] bg-[#D9EBE9]/40' : 'border-dashed border-transparent'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {espacios.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-gray-400">Sin espacios.</p>
        ) : (
          <SortableContext
            items={espacios.map((e) => `marina:${e.id}`)}
            strategy={rectSortingStrategy}
          >
            {espacios.map((e) => (
              <SortableEspacio
                key={e.id}
                cell={e}
                tipo="marina"
                isMoving={movingId === e.id}
                onEdit={() => onEditEspacio(e)}
                onDelete={() => onDeleteEspacio(e)}
              />
            ))}
          </SortableContext>
        )}
        <AddEspacioButton onAdd={onAddEspacio} />
      </div>
    </div>
  );
}

function SortableEspacio({
  cell,
  tipo,
  isMoving,
  onEdit,
  onDelete,
}: {
  cell: EspacioCell;
  tipo: 'nave' | 'marina';
  isMoving: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Prefijo del id distingue origen para que el handler global del DndContext
  // valide que se arrastra solo entre containers del mismo tipo (nave→piso,
  // marina→peine). Cross-tipo se ignora.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${tipo}:${cell.id}`,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <button
        type="button"
        onClick={onEdit}
        title={`Editar espacio ${cell.nomenclatura} — arrastrá para mover o reordenar`}
        disabled={isMoving}
        className={`inline-flex h-7 min-w-[2.25rem] cursor-grab items-center justify-center rounded-[8px] border px-2 text-xs font-semibold transition-colors hover:brightness-95 active:cursor-grabbing disabled:cursor-wait ${ESTADO_CLS[cell.estado]}`}
        {...listeners}
        {...attributes}
      >
        {isMoving ? <Loader2 className="h-3 w-3 animate-spin" /> : cell.nomenclatura}
      </button>
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          onDelete();
        }}
        title={`Eliminar espacio ${cell.nomenclatura}`}
        aria-label={`Eliminar espacio ${cell.nomenclatura}`}
        className="absolute -top-1.5 -right-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow transition-colors group-hover:flex hover:bg-red-600"
      >
        <X className="h-3 w-3" strokeWidth={3} />
      </button>
    </div>
  );
}

function AddEspacioButton({ onAdd }: { onAdd: () => Promise<void> }) {
  const [pending, startAdd] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startAdd(async () => onAdd())}
      disabled={pending}
      title="Agregar espacio"
      aria-label="Agregar espacio"
      className="inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded-[8px] border border-dashed border-gray-300 bg-white px-2 text-gray-400 transition-colors hover:border-[#175861] hover:text-[#175861] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div className="space-y-3">
                {lados.map((l, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto]"
                  >
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-600">
                        Pisos
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
                        Camas
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

              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={addLado}
                  className="flex items-center gap-1 text-sm font-semibold text-[#175861] hover:underline"
                >
                  Agregar lado
                  <Plus className="h-3.5 w-3.5" />
                </button>
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
  const [confirmText, setConfirmText] = useState('');
  const canConfirm = confirmText === 'ELIMINAR' && !pending;

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
          <div className="mt-4">
            <label htmlFor="confirm-area-text" className="text-sm text-gray-700">
              Para confirmar, escribí <strong>ELIMINAR</strong>:
            </label>
            <input
              id="confirm-area-text"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              autoComplete="off"
              placeholder="ELIMINAR"
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 mt-2 w-full rounded-[10px] border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus-visible:ring-[3px]"
            />
          </div>
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
            disabled={!canConfirm}
            className="rounded-[10px] bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteEspacioModal({
  espacio,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  espacio: EspacioCell;
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
            Eliminar espacio
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            ¿Seguro querés eliminar el espacio <strong>{espacio.nomenclatura}</strong>? Esta acción
            no se puede deshacer.
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

function ConfirmDeleteContenedorModal({
  contenedor,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  contenedor: {
    tipo: 'peine' | 'piso';
    nombre: string;
    espaciosCount: number;
    ocupadosCount: number;
  };
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tipoLabel = contenedor.tipo === 'peine' ? 'peine' : 'piso';
  const [confirmText, setConfirmText] = useState('');
  const canConfirm = confirmText === 'ELIMINAR' && !pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        <div className="p-6">
          <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
            Eliminar {tipoLabel}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            ¿Seguro querés eliminar el {tipoLabel} <strong>{contenedor.nombre}</strong>? Se van a
            borrar también <strong>{contenedor.espaciosCount}</strong>{' '}
            {contenedor.espaciosCount === 1 ? 'espacio' : 'espacios'}
            {contenedor.ocupadosCount > 0
              ? ` (${contenedor.ocupadosCount} con ocupante asignado)`
              : ''}
            . Esta acción no se puede deshacer.
          </p>
          <div className="mt-4">
            <label htmlFor="confirm-contenedor-text" className="text-sm text-gray-700">
              Para confirmar, escribí <strong>ELIMINAR</strong>:
            </label>
            <input
              id="confirm-contenedor-text"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              autoComplete="off"
              placeholder="ELIMINAR"
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 mt-2 w-full rounded-[10px] border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus-visible:ring-[3px]"
            />
          </div>
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
            disabled={!canConfirm}
            className="rounded-[10px] bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

const ESTADO_LABEL: Record<EstadoEspacio, string> = {
  disponible: 'Disponible',
  ocupado: 'Ocupado',
  reservado: 'Reservado',
};

function EditarEspacioModal({
  cell,
  areaNombre,
  lugar,
  socios,
  serviciosEspacios,
  onClose,
  onSaved,
  onDelete,
  onCambiarUbicacion,
}: {
  cell: EspacioCell;
  areaNombre: string;
  lugar: LugarEspacio;
  socios: SocioOpt[];
  serviciosEspacios: ServicioEspacio[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
  onCambiarUbicacion: () => void;
}) {
  const breadcrumb =
    lugar.tipo === 'marina'
      ? `${areaNombre} / ${lugar.peine}`
      : `${areaNombre} / ${lugar.lado} / ${lugar.piso}`;
  const [ocupanteId, setOcupanteId] = useState<string>(cell.ocupanteId ?? '');
  const [nomenclatura, setNomenclatura] = useState<string>(cell.nomenclatura);
  const [estado, setEstado] = useState<EstadoEspacio>(cell.estado);
  const [servicioId, setServicioId] = useState<string>(cell.servicioId ?? '');
  const [eslora, setEslora] = useState<string>(cell.eslora != null ? String(cell.eslora) : '');
  const [manga, setManga] = useState<string>(cell.manga != null ? String(cell.manga) : '');
  const [puntual, setPuntual] = useState<string>(cell.puntual != null ? String(cell.puntual) : '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onTarifaChange = (id: string) => {
    setServicioId(id);
    if (!id) return;
    const s = serviciosEspacios.find((x) => x.id === id);
    if (!s) return;
    if (eslora === '' && s.eslora != null) setEslora(String(s.eslora));
    if (manga === '' && s.manga != null) setManga(String(s.manga));
    if (puntual === '' && s.puntual != null) setPuntual(String(s.puntual));
  };

  const submit = () => {
    setError(null);
    if (!nomenclatura.trim()) {
      setError('La nomenclatura es obligatoria.');
      return;
    }
    const toNum = (s: string): number | null => {
      if (s.trim() === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    startTransition(async () => {
      const res = await updateEspacioAction({
        id: cell.id,
        ocupanteId: ocupanteId || null,
        nomenclatura: nomenclatura.trim(),
        estado,
        servicioId: servicioId || null,
        eslora: toNum(eslora),
        manga: toNum(manga),
        puntual: toNum(puntual),
      });
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success('Espacio actualizado.');
        onSaved();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Editar espacio {cell.nomenclatura}
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {breadcrumb}
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
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Cliente (socio)
            </label>
            <select
              className={inputCls}
              value={ocupanteId}
              onChange={(e) => setOcupanteId(e.target.value)}
            >
              <option value="">Seleccione una opción…</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Nomenclatura <span className="font-normal text-gray-400">(Nombre del espacio)</span>
            </label>
            <input
              className={inputCls}
              value={nomenclatura}
              onChange={(e) => setNomenclatura(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Estado</label>
            <div className="flex flex-wrap gap-2">
              {(['disponible', 'ocupado', 'reservado'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setEstado(st)}
                  className={`rounded-[10px] px-4 py-2 text-sm font-semibold transition-colors ${
                    estado === st
                      ? 'bg-[#175861] text-white'
                      : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {ESTADO_LABEL[st]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Tarifa</label>
            <select
              className={inputCls}
              value={servicioId}
              onChange={(e) => onTarifaChange(e.target.value)}
            >
              <option value="">Tarifa</option>
              {serviciosEspacios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} —{' '}
                  {s.precio.toLocaleString('es-AR', {
                    style: 'currency',
                    currency: 'ARS',
                    maximumFractionDigits: 0,
                  })}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">Eslora</label>
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

          {cell.ocupanteId && (
            <div className="text-center">
              <button
                type="button"
                onClick={onCambiarUbicacion}
                className="text-sm font-semibold text-[#175861] underline hover:text-[#0f4249]"
              >
                Cambiar ubicación
              </button>
            </div>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={onDelete}
              className="text-sm font-semibold text-red-600 underline hover:text-red-700"
            >
              Eliminar
            </button>
          </div>

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
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CambiarUbicacionModal({
  cell,
  origenLabel,
  ocupanteNombre,
  destinos,
  onClose,
  onSaved,
}: {
  cell: EspacioCell;
  origenLabel: string;
  ocupanteNombre: string;
  destinos: { id: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [destinoId, setDestinoId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    if (!destinoId) {
      setError('Seleccioná un espacio destino.');
      return;
    }
    startTransition(async () => {
      const res = await moveOcupanteAction({ origenId: cell.id, destinoId });
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success('Cliente mudado al nuevo espacio.');
        onSaved();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Cambiar ubicación
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {ocupanteNombre}
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
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Ubicación actual
            </label>
            <p className="text-sm text-gray-600">{origenLabel}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Nueva ubicación
            </label>
            {destinos.length === 0 ? (
              <p className="text-sm text-gray-500">
                No hay espacios disponibles para mudar al cliente.
              </p>
            ) : (
              <select
                className={inputCls}
                value={destinoId}
                onChange={(e) => setDestinoId(e.target.value)}
              >
                <option value="">Seleccione un espacio disponible…</option>
                {destinos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </div>

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
            disabled={pending || destinos.length === 0}
            className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
          >
            {pending ? 'Mudando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
