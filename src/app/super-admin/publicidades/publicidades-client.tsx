'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Edit3,
  FilterX,
  Image as ImageIcon,
  Megaphone,
  Plus,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';

import {
  createPlatformPublicidadAction,
  deletePlatformPublicidadAction,
  updatePlatformPublicidadAction,
  uploadPlatformPublicidadImagenAction,
  type PlatformPublicidadInput,
} from '@/app/actions/super-admin/publicidades';
import { formatArgentinaDate } from '@/lib/dates';
import { ImagesUploader } from '@/components/shared/images-uploader';
import { EmptyState } from '@/components/shared/empty-state';

export type TamanoPublicidad = '350x300' | '353x119';

export type PublicidadSeccion =
  | 'home'
  | 'nautishop'
  | 'mi_club'
  | 'contactos'
  | 'solicitud_lavado'
  | 'acceso_externo'
  | 'qr'
  | 'marketplace_embarcacion'
  | 'marketplace_propiedad';

export type PlatformPublicidad = {
  id: string;
  titulo: string;
  texto: string | null;
  tamano: TamanoPublicidad;
  secciones: PublicidadSeccion[];
  fechaInicio: string | null;
  fechaFin: string | null;
  linkUrl: string | null;
  publicar: boolean;
  imagenUrls: string[];
  createdAt: string;
  autor: string | null;
};

const TAMANO_LABELS: Record<TamanoPublicidad, { label: string; cls: string }> = {
  '350x300': { label: 'Cuadrada · 350×300', cls: 'bg-blue-50 text-blue-700' },
  '353x119': { label: 'Horizontal · 353×119', cls: 'bg-purple-50 text-purple-700' },
};

const SECCION_LABELS: Record<PublicidadSeccion, string> = {
  home: 'Home',
  nautishop: 'NautiShop',
  mi_club: 'Mi Club',
  contactos: 'Contactos',
  solicitud_lavado: 'Solicitud de Lavado',
  acceso_externo: 'Acceso Externo',
  qr: 'QR',
  marketplace_embarcacion: 'Marketplace · Embarcación',
  marketplace_propiedad: 'Marketplace · Propiedad',
};

const SECCION_OPCIONES: { value: PublicidadSeccion; label: string }[] = (
  Object.keys(SECCION_LABELS) as PublicidadSeccion[]
).map((value) => ({ value, label: SECCION_LABELS[value] }));

function formatRangoFechas(inicio: string | null, fin: string | null): string | null {
  if (!inicio && !fin) return null;
  const fmt = (iso: string) => {
    // 'YYYY-MM-DD' → mostrarlo sin TZ shenanigans
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  if (inicio && fin) return `${fmt(inicio)} → ${fmt(fin)}`;
  if (inicio) return `desde ${fmt(inicio)}`;
  return `hasta ${fmt(fin!)}`;
}

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

type ModalState = { mode: 'create' } | { mode: 'edit'; publicidad: PlatformPublicidad } | null;

export function PlatformPublicidadesClient({
  publicidades,
}: {
  publicidades: PlatformPublicidad[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<ModalState>(null);

  const stats = useMemo(() => {
    const total = publicidades.length;
    const publicadas = publicidades.filter((p) => p.publicar).length;
    const cuadradas = publicidades.filter((p) => p.tamano === '350x300').length;
    const horizontales = publicidades.filter((p) => p.tamano === '353x119').length;
    return { total, publicadas, cuadradas, horizontales };
  }, [publicidades]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return publicidades;
    return publicidades.filter(
      (p) => p.titulo.toLowerCase().includes(q) || (p.texto ?? '').toLowerCase().includes(q),
    );
  }, [publicidades, query]);

  return (
    <div className="p-4 md:p-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Publicidades</h1>
          <p className="page-subtitle mt-1">
            Banners que la app mobile muestra en sus slots de publicidad
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create' })}
          className="flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249]"
        >
          <Plus className="h-4 w-4" />
          Nueva publicidad
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Megaphone className="h-5 w-5" />} label="Total" value={stats.total} />
        <StatCard icon={<Send className="h-5 w-5" />} label="Publicadas" value={stats.publicadas} />
        <StatCard icon={<Square className="h-5 w-5" />} label="350×300" value={stats.cuadradas} />
        <StatCard
          icon={<ImageIcon className="h-5 w-5" />}
          label="353×119"
          value={stats.horizontales}
        />
      </div>

      <div className="mb-6 flex items-center gap-3">
        <input
          className={inputCls}
          placeholder="Buscar publicidades…"
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

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <EmptyState
            icon={<Megaphone className="h-7 w-7 opacity-40" />}
            text={
              publicidades.length === 0
                ? 'Todavía no hay publicidades cargadas.'
                : 'Sin resultados con esa búsqueda.'
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PublicidadCard
              key={p.id}
              p={p}
              onEdit={() => setModal({ mode: 'edit', publicidad: p })}
            />
          ))}
        </div>
      )}

      {modal && (
        <PublicidadModal
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

function PublicidadCard({ p, onEdit }: { p: PlatformPublicidad; onEdit: () => void }) {
  const tamano = TAMANO_LABELS[p.tamano];
  const cover = p.imagenUrls[0] ?? null;
  const rangoFechas = formatRangoFechas(p.fechaInicio, p.fechaFin);

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-4">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="h-16 w-16 shrink-0 rounded-[10px] border border-gray-200 object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold" style={{ color: '#101828' }}>
                {p.titulo}
              </h3>
              {p.texto && <p className="mt-1 text-sm text-gray-600">{p.texto}</p>}
              {p.linkUrl && (
                <a
                  href={p.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-xs text-[#175861] hover:underline"
                >
                  {p.linkUrl}
                </a>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tamano.cls}`}
                >
                  {tamano.label}
                </span>
                {p.secciones.length === 0 ? (
                  <span className="inline-block rounded-md bg-[#D9EBE9] px-2 py-0.5 text-xs font-semibold text-[#175861]">
                    Todas las secciones
                  </span>
                ) : (
                  p.secciones.map((s) => (
                    <span
                      key={s}
                      className="inline-block rounded-md bg-[#D9EBE9] px-2 py-0.5 text-xs font-semibold text-[#175861]"
                    >
                      {SECCION_LABELS[s]}
                    </span>
                  ))
                )}
                {rangoFechas && (
                  <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    {rangoFechas}
                  </span>
                )}
                {!p.publicar && (
                  <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                    Borrador
                  </span>
                )}
                {p.imagenUrls.length > 1 && (
                  <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                    {p.imagenUrls.length} imágenes
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              {formatArgentinaDate(p.createdAt)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <p className="text-xs" style={{ color: '#669E9D' }}>
          Por: {p.autor ?? '—'}
        </p>
        <button
          type="button"
          onClick={onEdit}
          title="Editar publicidad"
          className="rounded-[8px] p-1.5 text-[#669E9D] hover:bg-gray-100"
        >
          <Edit3 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function PublicidadModal({
  state,
  onClose,
  onSaved,
}: {
  state: NonNullable<ModalState>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.mode === 'edit';
  const initial = isEdit ? state.publicidad : null;

  const [titulo, setTitulo] = useState(initial?.titulo ?? '');
  const [texto, setTexto] = useState(initial?.texto ?? '');
  const [tamano, setTamano] = useState<'' | TamanoPublicidad>(initial?.tamano ?? '');
  const [secciones, setSecciones] = useState<PublicidadSeccion[]>(initial?.secciones ?? []);
  const [fechaInicio, setFechaInicio] = useState<string>(initial?.fechaInicio ?? '');
  const [fechaFin, setFechaFin] = useState<string>(initial?.fechaFin ?? '');
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl ?? '');
  const [imagenUrls, setImagenUrls] = useState<string[]>(initial?.imagenUrls ?? []);

  const toggleSeccion = (s: PublicidadSeccion) =>
    setSecciones((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const baseValido = Boolean(titulo.trim() && tamano);

  const submit = (publicar: boolean) => {
    setError(null);
    if (!titulo.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    if (!tamano) {
      setError('Elegí el tamaño de la publicidad.');
      return;
    }

    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
      setError('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }

    const input: PlatformPublicidadInput = {
      titulo: titulo.trim(),
      texto,
      tamano,
      secciones,
      fechaInicio: fechaInicio || null,
      fechaFin: fechaFin || null,
      linkUrl: linkUrl.trim() || null,
      publicar,
      imagenUrls,
    };

    startTransition(async () => {
      const res = isEdit
        ? await updatePlatformPublicidadAction(state.publicidad.id, input)
        : await createPlatformPublicidadAction(input);
      if (res.error) setError(res.error);
      else onSaved();
    });
  };

  const onDelete = () => {
    if (!isEdit) return;
    setError(null);
    startDelete(async () => {
      const res = await deletePlatformPublicidadAction(state.publicidad.id);
      if (res.error) {
        setError(res.error);
        setConfirmDelete(false);
      } else {
        onSaved();
      }
    });
  };

  const busy = pending || deleting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
            {isEdit ? 'Editar publicidad' : 'Nueva publicidad'}
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
              placeholder="Título interno de la publicidad"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Texto (opcional)
            </label>
            <textarea
              className={`${inputCls} h-24 py-3`}
              placeholder="Texto opcional que acompaña al banner"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Tamaño</label>
            <select
              className={inputCls}
              value={tamano}
              onChange={(e) => setTamano(e.target.value as '' | TamanoPublicidad)}
            >
              <option value="">Seleccione un tamaño…</option>
              <option value="350x300">Cuadrada — 350×300</option>
              <option value="353x119">Horizontal — 353×119</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              La app mobile filtra por tamaño para llenar cada slot. La imagen debería tener
              exactamente esas dimensiones.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Secciones</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SECCION_OPCIONES.map((s) => {
                const checked = secciones.includes(s.value);
                return (
                  <label
                    key={s.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-sm ${
                      checked
                        ? 'border-[#175861] bg-[#D9EBE9] text-[#175861]'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-[#175861]"
                      checked={checked}
                      onChange={() => toggleSeccion(s.value)}
                    />
                    {s.label}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Pantallas de la app mobile donde se muestra. Si no marcás ninguna, aparece en todas
              las pantallas del tamaño elegido.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Fecha de inicio
              </label>
              <input
                className={inputCls}
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Fecha de fin</label>
              <input
                className={inputCls}
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-gray-500">
            Si dejás ambas vacías, la publicidad se muestra sin restricción de fechas.
          </p>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Link (opcional)
            </label>
            <input
              className={inputCls}
              type="url"
              placeholder="https://…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Imágenes</label>
            <ImagesUploader
              urls={imagenUrls}
              onChange={setImagenUrls}
              upload={async (file) => {
                const fd = new FormData();
                fd.append('file', file);
                return uploadPlatformPublicidadImagenAction(fd);
              }}
              onError={setError}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-6">
          {isEdit ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">¿Confirmar borrado?</span>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy}
                  className="rounded-[10px] border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                >
                  {deleting ? 'Borrando…' : 'Sí, borrar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                  className="rounded-[10px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-[10px] border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Borrar
              </button>
            )
          ) : (
            <span />
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={busy || !titulo.trim()}
              className="rounded-[10px] border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
            >
              {pending ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={busy || !baseValido}
              className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
            >
              {pending ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
