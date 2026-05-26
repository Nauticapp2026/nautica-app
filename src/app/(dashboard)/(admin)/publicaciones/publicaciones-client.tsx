'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Anchor,
  ArrowUpDown,
  BedDouble,
  Clock,
  Coffee,
  Droplets,
  Edit3,
  Flame,
  Home,
  Layers,
  Lock,
  MapPin,
  Plus,
  Ruler,
  ShieldCheck,
  Shirt,
  Sparkles,
  Sun,
  Trash2,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import {
  createPublicacionAction,
  updatePublicacionAction,
  deletePublicacionAction,
  uploadPublicacionImagenAction,
  type PublicacionInput,
} from '@/app/actions/publicaciones';
import { ImagesUploader } from '@/components/shared/images-uploader';
import { EmptyState } from '@/components/shared/empty-state';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ServicioPublicacion =
  | 'agua_potable'
  | 'conexion_220v'
  | 'abierto_24hs'
  | 'combustible'
  | 'seguridad_24hs'
  | 'vestuarios'
  | 'confiteria'
  | 'lavadero'
  | 'aire_libre'
  | 'bajo_techo'
  | 'sin_arco';

export type PublicacionItem = {
  id: string;
  tipo: 'amarra' | 'cama';
  ubicacion: string | null;
  eslora: string | null;
  manga: string | null;
  unidadMetraje: 'metros' | 'pies';
  expensas: string | null;
  precio: string | null;
  servicios: ServicioPublicacion[];
  imagenUrls: string[];
  estado: 'borrador' | 'publicada';
  createdAt: string;
  isEditable: boolean;
  autor: string | null;
};

type Props = {
  items: PublicacionItem[];
  plan: string;
  limit: number;
};

type ModalState = { mode: 'create' } | { mode: 'edit'; item: PublicacionItem } | null;

type TipoFilter = 'todos' | 'amarra' | 'cama';
type EstadoFilter = 'todos' | 'publicada' | 'borrador';
type SortFilter = 'recientes' | 'precio_asc' | 'precio_desc';

// ─── Servicios config ─────────────────────────────────────────────────────────

const SERVICIO_CONFIG: Record<ServicioPublicacion, { label: string; icon: LucideIcon }> = {
  agua_potable: { label: 'Agua potable', icon: Droplets },
  conexion_220v: { label: 'Conexión 220V', icon: Zap },
  abierto_24hs: { label: 'Abierto 24 hs', icon: Clock },
  combustible: { label: 'Combustible', icon: Flame },
  seguridad_24hs: { label: 'Seguridad 24 hs', icon: ShieldCheck },
  vestuarios: { label: 'Vestuarios', icon: Shirt },
  confiteria: { label: 'Confitería', icon: Coffee },
  lavadero: { label: 'Lavadero', icon: Sparkles },
  aire_libre: { label: 'Aire libre', icon: Sun },
  bajo_techo: { label: 'Bajo techo', icon: Home },
  sin_arco: { label: 'Sin arco', icon: ArrowUpDown },
};

const SERVICIOS_LIST = Object.keys(SERVICIO_CONFIG) as ServicioPublicacion[];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPrecio(v: string | null): string {
  if (!v) return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function fmtNum(v: string | null, unit: 'metros' | 'pies' = 'metros'): string | null {
  if (!v) return null;
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  const s = n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  return `${s} ${unit === 'pies' ? 'pies' : 'm'}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PublicacionesClient({ items, plan, limit }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('todos');
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('todos');
  const [sortFilter, setSortFilter] = useState<SortFilter>('recientes');
  const atLimit = limit > 0 && items.length >= limit;

  const filtered = useMemo(() => {
    let result = [...items];

    if (tipoFilter !== 'todos') result = result.filter((i) => i.tipo === tipoFilter);
    if (estadoFilter !== 'todos') result = result.filter((i) => i.estado === estadoFilter);

    if (sortFilter === 'precio_asc') {
      result.sort((a, b) => parseFloat(a.precio ?? '0') - parseFloat(b.precio ?? '0'));
    } else if (sortFilter === 'precio_desc') {
      result.sort((a, b) => parseFloat(b.precio ?? '0') - parseFloat(a.precio ?? '0'));
    }

    return result;
  }, [items, tipoFilter, estadoFilter, sortFilter]);

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Publicaciones</h1>
          <p className="page-subtitle mt-1">
            Amarras y camas publicadas en la app
            {limit > 0 && (
              <span className="ml-2 text-xs font-medium text-gray-400">
                {items.length}/{limit}
              </span>
            )}
          </p>
        </div>

        {limit === 0 ? (
          <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            Disponible a partir del plan <span className="font-semibold">Premium</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setModal({ mode: 'create' })}
            disabled={atLimit}
            title={atLimit ? `Límite de ${limit} publicaciones alcanzado` : undefined}
            className="flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Nueva publicación
          </button>
        )}
      </header>

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            { value: 'todos', label: 'Todos' },
            { value: 'cama', label: 'Camas' },
            { value: 'amarra', label: 'Amarras' },
          ] as { value: TipoFilter; label: string }[]
        ).map(({ value, label }) => (
          <Pill key={value} active={tipoFilter === value} onClick={() => setTipoFilter(value)}>
            {label}
          </Pill>
        ))}

        <div className="h-6 w-px self-center bg-gray-200" />

        {(
          [
            { value: 'todos', label: 'Todos' },
            { value: 'publicada', label: 'Publicadas' },
            { value: 'borrador', label: 'Borradores' },
          ] as { value: EstadoFilter; label: string }[]
        ).map(({ value, label }) => (
          <Pill key={value} active={estadoFilter === value} onClick={() => setEstadoFilter(value)}>
            {label}
          </Pill>
        ))}

        <div className="h-6 w-px self-center bg-gray-200" />

        {(
          [
            { value: 'recientes', label: 'Más recientes' },
            { value: 'precio_asc', label: 'Menor precio' },
            { value: 'precio_desc', label: 'Mayor precio' },
          ] as { value: SortFilter; label: string }[]
        ).map(({ value, label }) => (
          <Pill key={value} active={sortFilter === value} onClick={() => setSortFilter(value)}>
            {label}
          </Pill>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <EmptyState
            icon={<Layers className="h-7 w-7 opacity-40" />}
            text={
              items.length === 0
                ? limit === 0
                  ? 'Actualizá tu plan para publicar amarras o camas.'
                  : 'Todavía no hay publicaciones. ¡Creá la primera!'
                : 'Sin resultados con los filtros aplicados.'
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3">
          {filtered.map((item) => (
            <PublicacionCard
              key={item.id}
              item={item}
              onEdit={() => setModal({ mode: 'edit', item })}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <PublicacionModal
          state={modal}
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

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-[#175861] text-white'
          : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function PublicacionCard({ item, onEdit }: { item: PublicacionItem; onEdit: () => void }) {
  const canEdit = item.isEditable;
  const foto = item.imagenUrls[0];
  const esAmarra = item.tipo === 'amarra';
  const eslora = fmtNum(item.eslora, item.unidadMetraje);
  const manga = fmtNum(item.manga, item.unidadMetraje);

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-md">
      {/* Foto */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">
            {esAmarra ? <Anchor className="h-10 w-10" /> : <BedDouble className="h-10 w-10" />}
          </div>
        )}
        {/* Badge tipo */}
        <div className="absolute top-2 left-2">
          <span className="rounded-md bg-[#175861] px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
            {esAmarra ? 'Amarra' : 'Cama'}
          </span>
        </div>
        {/* Badge borrador */}
        {item.estado === 'borrador' && (
          <div className="absolute top-2 right-2">
            <span className="rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white">
              Borrador
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1.5 px-3 pt-3 pb-2">
        {/* Precio */}
        <p className="text-base font-bold text-[#101828]">
          {fmtPrecio(item.precio)}
          {item.precio && <span className="text-xs font-normal text-gray-500"> /mes</span>}
        </p>

        {/* Ubicación */}
        {item.ubicacion && (
          <div className="flex items-start gap-1 text-xs text-gray-500">
            <MapPin className="mt-px h-3 w-3 shrink-0" />
            <span className="line-clamp-2 leading-snug">{item.ubicacion}</span>
          </div>
        )}

        {/* Dimensiones */}
        {(eslora || manga) && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Ruler className="h-3 w-3 shrink-0" />
            <span>{[eslora, manga].filter(Boolean).join(' × ')}</span>
          </div>
        )}

        {/* Servicios icons — solo los primeros 6 */}
        {item.servicios.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.servicios.slice(0, 6).map((s) => {
              const cfg = SERVICIO_CONFIG[s];
              if (!cfg) return null;
              const Icon = cfg.icon;
              return (
                <span
                  key={s}
                  title={cfg.label}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F4F8F8] text-[#175861]"
                >
                  <Icon className="h-3 w-3" />
                </span>
              );
            })}
            {item.servicios.length > 6 && (
              <span className="flex h-6 items-center px-1 text-[10px] text-gray-400">
                +{item.servicios.length - 6}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Botón ver más — estilo mobile */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={canEdit ? onEdit : undefined}
          disabled={!canEdit}
          title={canEdit ? undefined : 'El plazo de edición de 24 hs venció'}
          className={`flex w-full items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-xs font-bold tracking-wide text-white transition-colors ${canEdit ? 'bg-[#175861] hover:bg-[#0f4249]' : 'cursor-not-allowed bg-gray-300'}`}
        >
          {canEdit ? <Edit3 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {canEdit ? 'EDITAR' : 'BLOQUEADO'}
        </button>
      </div>
    </article>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

const labelCls = 'mb-1 block text-sm font-semibold text-gray-700';

function PublicacionModal({
  state,
  onClose,
  onSaved,
}: {
  state: NonNullable<ModalState>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.mode === 'edit';
  const initial = isEdit ? state.item : null;

  const [tipo, setTipo] = useState<'amarra' | 'cama' | ''>(initial?.tipo ?? '');
  const [ubicacion, setUbicacion] = useState(initial?.ubicacion ?? '');
  const [eslora, setEslora] = useState(initial?.eslora ?? '');
  const [manga, setManga] = useState(initial?.manga ?? '');
  const [unidadMetraje, setUnidadMetraje] = useState<'metros' | 'pies'>(
    initial?.unidadMetraje ?? 'metros',
  );
  const [expensas, setExpensas] = useState(initial?.expensas ?? '');
  const [precio, setPrecio] = useState(initial?.precio ?? '');
  const [servicios, setServicios] = useState<ServicioPublicacion[]>(initial?.servicios ?? []);
  const [imagenUrls, setImagenUrls] = useState<string[]>(initial?.imagenUrls ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleServicio = (s: ServicioPublicacion) => {
    setServicios((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const submit = (estado: 'borrador' | 'publicada') => {
    setError(null);
    if (!tipo) {
      setError('Seleccioná el tipo de publicación.');
      return;
    }

    const input: PublicacionInput = {
      tipo,
      ubicacion,
      eslora,
      manga,
      unidadMetraje,
      expensas,
      precio,
      servicios,
      imagenUrls,
      estado,
    };

    startTransition(async () => {
      const res = isEdit
        ? await updatePublicacionAction(state.item.id, input)
        : await createPublicacionAction(input);
      if (res.error) setError(res.error);
      else onSaved();
    });
  };

  const handleDelete = () => {
    if (!isEdit) return;
    startTransition(async () => {
      const res = await deletePublicacionAction(state.item.id);
      if (res.error) setError(res.error);
      else onSaved();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="flex w-full max-w-xl flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-lg font-bold text-[#101828]">
            {isEdit ? 'Editar publicación' : 'Nueva publicación'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-t border-gray-200" />

        {/* Body — scrollable */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Tipo */}
          <div>
            <p className={labelCls}>Tipo de espacio</p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { value: 'amarra', label: 'Amarra', icon: Anchor },
                  { value: 'cama', label: 'Cama', icon: BedDouble },
                ] as const
              ).map(({ value, label, icon: Icon }) => {
                const selected = tipo === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTipo(value)}
                    className={`flex flex-col items-center gap-2 rounded-[12px] border-2 py-5 transition-colors ${
                      selected
                        ? 'border-[#175861] bg-[#F0F9FA] text-[#175861]'
                        : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-8 w-8" />
                    <span className="text-sm font-semibold">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fotos */}
          <div>
            <p className={labelCls}>Fotos</p>
            <ImagesUploader
              urls={imagenUrls}
              onChange={setImagenUrls}
              upload={async (file) => {
                const fd = new FormData();
                fd.append('file', file);
                return uploadPublicacionImagenAction(fd);
              }}
              onError={setError}
            />
          </div>

          {/* Ubicación */}
          <div>
            <label className={labelCls}>Dirección / Ubicación</label>
            <input
              className={inputCls}
              placeholder="Ej: Av. del Puerto 123, Tigre"
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
            />
          </div>

          {/* Dimensiones + unidad */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className={labelCls + ' mb-0'}>Dimensiones</p>
              {/* Toggle metros / pies */}
              <div className="flex rounded-[8px] border border-gray-200 bg-gray-50 p-0.5 text-xs font-semibold">
                {(['metros', 'pies'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnidadMetraje(u)}
                    className={`rounded-[6px] px-3 py-1 transition-colors ${
                      unidadMetraje === u
                        ? 'bg-[#175861] text-white'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {u === 'metros' ? 'm' : 'pies'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>
                  Eslora ({unidadMetraje === 'metros' ? 'm' : 'pies'})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className={inputCls}
                  placeholder="Ej: 10"
                  value={eslora}
                  onChange={(e) => setEslora(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Manga ({unidadMetraje === 'metros' ? 'm' : 'pies'})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className={inputCls}
                  placeholder="Ej: 3.5"
                  value={manga}
                  onChange={(e) => setManga(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Precios */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Precio / mes</label>
              <input
                type="number"
                min="0"
                step="1"
                className={inputCls}
                placeholder="Ej: 150000"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Expensas / mes</label>
              <input
                type="number"
                min="0"
                step="1"
                className={inputCls}
                placeholder="Ej: 30000"
                value={expensas}
                onChange={(e) => setExpensas(e.target.value)}
              />
            </div>
          </div>

          {/* Servicios */}
          <div>
            <p className={labelCls}>Servicios e instalaciones</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {SERVICIOS_LIST.map((s) => {
                const cfg = SERVICIO_CONFIG[s];
                const Icon = cfg.icon;
                const selected = servicios.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleServicio(s)}
                    className={`flex flex-col items-center gap-1.5 rounded-[10px] border p-3 text-center transition-colors ${
                      selected
                        ? 'border-[#175861] bg-[#F0F9FA] text-[#175861]'
                        : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[10px] leading-tight font-medium">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="rounded-[8px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Eliminar */}
            {isEdit ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">¿Confirmar?</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={handleDelete}
                    className="rounded-[8px] bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Sí, eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 rounded-[8px] border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              )
            ) : (
              <div />
            )}

            {/* Guardar / Publicar */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => submit('borrador')}
                disabled={pending || !tipo}
                className="rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
              >
                {pending ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button
                type="button"
                onClick={() => submit('publicada')}
                disabled={pending || !tipo}
                className="rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
              >
                {pending ? 'Publicando…' : 'Publicar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
