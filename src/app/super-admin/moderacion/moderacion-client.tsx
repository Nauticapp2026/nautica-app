'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Anchor,
  Calendar,
  Eye,
  FilterX,
  Image as ImageIcon,
  MessageSquare,
  Newspaper,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  deleteComunicacionClubAction,
  deletePublicacionClubAction,
} from '@/app/actions/super-admin/moderacion';
import { formatArgentinaDate } from '@/lib/dates';
import { EmptyState } from '@/components/shared/empty-state';

export type ComunicacionClub = {
  id: string;
  guarderiaId: string;
  guarderiaName: string;
  titulo: string;
  texto: string | null;
  categoria: string | null;
  tipo: string;
  publicar: boolean;
  fecha: string | null;
  imagenUrls: string[];
  autorNombre: string | null;
};

export type PublicacionClub = {
  id: string;
  guarderiaId: string;
  guarderiaName: string;
  tipo: string;
  ubicacion: string | null;
  eslora: string | null;
  manga: string | null;
  unidadMetraje: string;
  precio: string | null;
  expensas: string | null;
  puntual: string | null;
  servicios: string[];
  imagenUrls: string[];
  estado: string;
  createdAt: string;
  autorNombre: string | null;
};

const CATEGORIA_LABELS: Record<string, { label: string; cls: string }> = {
  informacion: { label: 'Información', cls: 'bg-[#ECFDF3] text-[#027A48]' },
  anuncio: { label: 'Anuncio', cls: 'bg-blue-50 text-blue-700' },
  evento: { label: 'Evento', cls: 'bg-purple-50 text-purple-700' },
  mantenimiento: { label: 'Mantenimiento', cls: 'bg-orange-50 text-orange-700' },
  alerta: { label: 'Alerta', cls: 'bg-red-50 text-red-700' },
};

const TIPO_COM_LABELS: Record<string, { label: string; cls: string }> = {
  socios: { label: 'Socios', cls: 'bg-purple-50 text-purple-700' },
  publica: { label: 'Pública', cls: 'bg-sky-50 text-sky-700' },
};

const TIPO_PUB_LABELS: Record<string, { label: string; cls: string }> = {
  amarra: { label: 'Amarra', cls: 'bg-blue-50 text-blue-700' },
  cama: { label: 'Cama', cls: 'bg-amber-50 text-amber-700' },
};

const SERVICIO_LABELS: Record<string, string> = {
  agua_potable: 'Agua potable',
  conexion_220v: '220V',
  abierto_24hs: 'Abierto 24hs',
  combustible: 'Combustible',
  seguridad_24hs: 'Seguridad 24hs',
  vestuarios: 'Vestuarios',
  confiteria: 'Confitería',
  lavadero: 'Lavadero',
  aire_libre: 'Aire libre',
  bajo_techo: 'Bajo techo',
  sin_arco: 'Sin arco',
};

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

type Tab = 'comunicaciones' | 'publicaciones';
type DetailModal =
  | { kind: 'comunicacion'; item: ComunicacionClub }
  | { kind: 'publicacion'; item: PublicacionClub }
  | null;

export function ModeracionClient({
  comunicaciones,
  publicaciones,
}: {
  comunicaciones: ComunicacionClub[];
  publicaciones: PublicacionClub[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('comunicaciones');
  const [query, setQuery] = useState('');
  const [clubFiltro, setClubFiltro] = useState('');
  const [detail, setDetail] = useState<DetailModal>(null);

  const clubesCom = useMemo(
    () =>
      [...new Map(comunicaciones.map((c) => [c.guarderiaId, c.guarderiaName])).entries()].sort(
        (a, b) => a[1].localeCompare(b[1]),
      ),
    [comunicaciones],
  );
  const clubesPub = useMemo(
    () =>
      [...new Map(publicaciones.map((p) => [p.guarderiaId, p.guarderiaName])).entries()].sort(
        (a, b) => a[1].localeCompare(b[1]),
      ),
    [publicaciones],
  );

  const filteredCom = useMemo(() => {
    const q = query.trim().toLowerCase();
    return comunicaciones.filter((c) => {
      if (clubFiltro && c.guarderiaId !== clubFiltro) return false;
      if (q && !c.titulo.toLowerCase().includes(q) && !(c.texto ?? '').toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [comunicaciones, query, clubFiltro]);

  const filteredPub = useMemo(() => {
    const q = query.trim().toLowerCase();
    return publicaciones.filter((p) => {
      if (clubFiltro && p.guarderiaId !== clubFiltro) return false;
      if (q && !(p.ubicacion ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [publicaciones, query, clubFiltro]);

  const onTabChange = (t: Tab) => {
    setTab(t);
    setQuery('');
    setClubFiltro('');
  };

  const onDeleted = () => {
    setDetail(null);
    router.refresh();
  };

  const clubes = tab === 'comunicaciones' ? clubesCom : clubesPub;

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-[10px] border border-gray-200 bg-gray-50 p-1">
        {(
          [
            {
              id: 'comunicaciones',
              label: 'Comunicaciones',
              icon: MessageSquare,
              count: comunicaciones.length,
            },
            {
              id: 'publicaciones',
              label: 'Publicaciones',
              icon: Newspaper,
              count: publicaciones.length,
            },
          ] as const
        ).map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`flex items-center gap-2 rounded-[8px] px-4 py-2 text-sm font-medium transition-colors ${
              tab === id ? 'bg-white text-[#101828] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                tab === id ? 'bg-[#E8F0F1] text-[#175861]' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className={inputCls}
          placeholder={
            tab === 'comunicaciones' ? 'Buscar por título o contenido…' : 'Buscar por ubicación…'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className={`${inputCls} sm:max-w-xs`}
          value={clubFiltro}
          onChange={(e) => setClubFiltro(e.target.value)}
        >
          <option value="">Todos los clubes</option>
          {clubes.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setClubFiltro('');
          }}
          title="Limpiar filtros"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <FilterX className="h-4 w-4" />
        </button>
      </div>

      {/* Lista */}
      {tab === 'comunicaciones' &&
        (filteredCom.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white">
            <EmptyState
              icon={<MessageSquare className="h-7 w-7 opacity-40" />}
              text={
                comunicaciones.length === 0 ? 'No hay comunicaciones de clubes.' : 'Sin resultados.'
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCom.map((c) => (
              <ComunicacionCard
                key={c.id}
                c={c}
                onDeleted={onDeleted}
                onView={() => setDetail({ kind: 'comunicacion', item: c })}
              />
            ))}
          </div>
        ))}

      {tab === 'publicaciones' &&
        (filteredPub.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white">
            <EmptyState
              icon={<Newspaper className="h-7 w-7 opacity-40" />}
              text={
                publicaciones.length === 0 ? 'No hay publicaciones de clubes.' : 'Sin resultados.'
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPub.map((p) => (
              <PublicacionCard
                key={p.id}
                p={p}
                onDeleted={onDeleted}
                onView={() => setDetail({ kind: 'publicacion', item: p })}
              />
            ))}
          </div>
        ))}

      {/* Modal de detalle */}
      {detail?.kind === 'comunicacion' && (
        <ComunicacionDetailModal
          c={detail.item}
          onClose={() => setDetail(null)}
          onDeleted={onDeleted}
        />
      )}
      {detail?.kind === 'publicacion' && (
        <PublicacionDetailModal
          p={detail.item}
          onClose={() => setDetail(null)}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

// ─── Cards ───────────────────────────────────────────────────────────────────

function Thumbnails({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  const visible = urls.slice(0, 3);
  const extra = urls.length - visible.length;
  return (
    <div className="mt-3 flex gap-1.5">
      {visible.map((url, i) => (
        <div
          key={url}
          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] bg-gray-100"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
          {i === visible.length - 1 && extra > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-bold text-white">
              +{extra}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ComunicacionCard({
  c,
  onDeleted,
  onView,
}: {
  c: ComunicacionClub;
  onDeleted: () => void;
  onView: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const categoria = c.categoria ? CATEGORIA_LABELS[c.categoria] : null;
  const tipo = TIPO_COM_LABELS[c.tipo] ?? TIPO_COM_LABELS.socios;

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteComunicacionClubAction(c.id);
      if (res.error) {
        toast.error(res.error);
        setConfirmDelete(false);
      } else {
        toast.success('Comunicación eliminada.');
        onDeleted();
      }
    });
  };

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2">
            <span className="inline-block rounded-md bg-[#E8F0F1] px-2 py-0.5 text-xs font-semibold text-[#175861]">
              {c.guarderiaName}
            </span>
          </div>
          <h3 className="text-base font-bold" style={{ color: '#101828' }}>
            {c.titulo}
          </h3>
          {c.texto && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{c.texto}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {categoria && (
              <span
                className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${categoria.cls}`}
              >
                {categoria.label}
              </span>
            )}
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tipo.cls}`}
            >
              {tipo.label}
            </span>
            {!c.publicar && (
              <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                Borrador
              </span>
            )}
            {c.imagenUrls.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                <ImageIcon className="h-3 w-3" />
                {c.imagenUrls.length}
              </span>
            )}
          </div>
          <Thumbnails urls={c.imagenUrls} />
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
          <Calendar className="h-3.5 w-3.5" />
          {formatArgentinaDate(c.fecha)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <p className="text-xs" style={{ color: '#669E9D' }}>
          Por: {c.autorNombre ?? '—'}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onView}
            className="flex items-center gap-1.5 rounded-[8px] border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            <Eye className="h-3.5 w-3.5" />
            Ver
          </button>
          <DeleteInline
            confirmDelete={confirmDelete}
            pending={pending}
            onRequest={() => setConfirmDelete(true)}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
          />
        </div>
      </div>
    </article>
  );
}

function PublicacionCard({
  p,
  onDeleted,
  onView,
}: {
  p: PublicacionClub;
  onDeleted: () => void;
  onView: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const tipo = TIPO_PUB_LABELS[p.tipo] ?? { label: p.tipo, cls: 'bg-gray-100 text-gray-600' };

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deletePublicacionClubAction(p.id);
      if (res.error) {
        toast.error(res.error);
        setConfirmDelete(false);
      } else {
        toast.success('Publicación eliminada.');
        onDeleted();
      }
    });
  };

  const medidas =
    p.eslora || p.manga
      ? [p.eslora && `Eslora ${p.eslora}`, p.manga && `Manga ${p.manga}`]
          .filter(Boolean)
          .join(' · ') + ` ${p.unidadMetraje}`
      : null;

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2">
            <span className="inline-block rounded-md bg-[#E8F0F1] px-2 py-0.5 text-xs font-semibold text-[#175861]">
              {p.guarderiaName}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tipo.cls}`}
            >
              {tipo.label}
            </span>
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
                p.estado === 'publicada'
                  ? 'bg-[#ECFDF3] text-[#027A48]'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {p.estado === 'publicada' ? 'Publicada' : 'Borrador'}
            </span>
            {p.imagenUrls.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                <ImageIcon className="h-3 w-3" />
                {p.imagenUrls.length}
              </span>
            )}
          </div>
          {p.ubicacion && (
            <p className="mt-2 flex items-center gap-1 text-sm text-gray-700">
              <Anchor className="h-3.5 w-3.5 text-gray-400" />
              {p.ubicacion}
            </p>
          )}
          {medidas && <p className="mt-1 text-xs text-gray-500">{medidas}</p>}
          <Thumbnails urls={p.imagenUrls} />
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
          <Calendar className="h-3.5 w-3.5" />
          {formatArgentinaDate(p.createdAt)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <p className="text-xs" style={{ color: '#669E9D' }}>
          <Users className="mr-0.5 inline h-3 w-3" />
          {p.autorNombre ?? '—'}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onView}
            className="flex items-center gap-1.5 rounded-[8px] border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            <Eye className="h-3.5 w-3.5" />
            Ver
          </button>
          <DeleteInline
            confirmDelete={confirmDelete}
            pending={pending}
            onRequest={() => setConfirmDelete(true)}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
          />
        </div>
      </div>
    </article>
  );
}

// ─── Modales de detalle ───────────────────────────────────────────────────────

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />
        <div className="space-y-5 p-6">{children}</div>
        <div className="flex items-center justify-between border-t border-gray-200 p-6">
          {footer}
        </div>
      </div>
    </div>
  );
}

function ImageGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-700">Imágenes</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((url) => (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
            <div className="aspect-video overflow-hidden rounded-[8px] bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover transition-opacity hover:opacity-90"
              />
            </div>
          </a>
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Click en una imagen para verla en tamaño completo
      </p>
    </div>
  );
}

function ComunicacionDetailModal({
  c,
  onClose,
  onDeleted,
}: {
  c: ComunicacionClub;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const categoria = c.categoria ? CATEGORIA_LABELS[c.categoria] : null;
  const tipo = TIPO_COM_LABELS[c.tipo] ?? TIPO_COM_LABELS.socios;

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteComunicacionClubAction(c.id);
      if (res.error) {
        toast.error(res.error);
        setConfirmDelete(false);
      } else {
        toast.success('Comunicación eliminada.');
        onDeleted();
      }
    });
  };

  return (
    <ModalShell
      title={c.titulo}
      subtitle={c.guarderiaName}
      onClose={onClose}
      footer={
        <DeleteInline
          confirmDelete={confirmDelete}
          pending={pending}
          onRequest={() => setConfirmDelete(true)}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      }
    >
      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        {categoria && (
          <span
            className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${categoria.cls}`}
          >
            {categoria.label}
          </span>
        )}
        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tipo.cls}`}>
          {tipo.label}
        </span>
        <span
          className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
            c.publicar ? 'bg-[#ECFDF3] text-[#027A48]' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {c.publicar ? 'Publicada' : 'Borrador'}
        </span>
      </div>

      {/* Texto */}
      {c.texto && (
        <div>
          <p className="mb-1 text-sm font-semibold text-gray-700">Contenido</p>
          <p className="text-sm whitespace-pre-wrap text-gray-700">{c.texto}</p>
        </div>
      )}

      {/* Imágenes */}
      <ImageGrid urls={c.imagenUrls} />

      {/* Meta */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
        <span>Por: {c.autorNombre ?? '—'}</span>
        <span>Fecha: {formatArgentinaDate(c.fecha)}</span>
      </div>
    </ModalShell>
  );
}

function PublicacionDetailModal({
  p,
  onClose,
  onDeleted,
}: {
  p: PublicacionClub;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const tipo = TIPO_PUB_LABELS[p.tipo] ?? { label: p.tipo, cls: 'bg-gray-100 text-gray-600' };

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deletePublicacionClubAction(p.id);
      if (res.error) {
        toast.error(res.error);
        setConfirmDelete(false);
      } else {
        toast.success('Publicación eliminada.');
        onDeleted();
      }
    });
  };

  const formatPrecio = (v: string | null) => (v ? `$${Number(v).toLocaleString('es-AR')}` : null);

  return (
    <ModalShell
      title={`${tipo.label} — ${p.guarderiaName}`}
      subtitle={p.ubicacion ?? undefined}
      onClose={onClose}
      footer={
        <DeleteInline
          confirmDelete={confirmDelete}
          pending={pending}
          onRequest={() => setConfirmDelete(true)}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      }
    >
      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${tipo.cls}`}>
          {tipo.label}
        </span>
        <span
          className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
            p.estado === 'publicada' ? 'bg-[#ECFDF3] text-[#027A48]' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {p.estado === 'publicada' ? 'Publicada' : 'Borrador'}
        </span>
      </div>

      {/* Medidas y precios */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {p.eslora && <DetailField label="Eslora" value={`${p.eslora} ${p.unidadMetraje}`} />}
        {p.manga && <DetailField label="Manga" value={`${p.manga} ${p.unidadMetraje}`} />}
        {formatPrecio(p.precio) && (
          <DetailField label="Precio/mes" value={formatPrecio(p.precio)!} />
        )}
        {formatPrecio(p.expensas) && (
          <DetailField label="Expensas" value={formatPrecio(p.expensas)!} />
        )}
        {formatPrecio(p.puntual) && (
          <DetailField label="Puntual" value={formatPrecio(p.puntual)!} />
        )}
      </div>

      {/* Servicios */}
      {p.servicios.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-700">Servicios</p>
          <div className="flex flex-wrap gap-1.5">
            {p.servicios.map((s) => (
              <span
                key={s}
                className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
              >
                {SERVICIO_LABELS[s] ?? s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Imágenes */}
      <ImageGrid urls={p.imagenUrls} />

      {/* Meta */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
        <span>Por: {p.autorNombre ?? '—'}</span>
        <span>Fecha: {formatArgentinaDate(p.createdAt)}</span>
      </div>
    </ModalShell>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-gray-50 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[#101828]">{value}</p>
    </div>
  );
}

// ─── DeleteInline ─────────────────────────────────────────────────────────────

function DeleteInline({
  confirmDelete,
  pending,
  onRequest,
  onCancel,
  onConfirm,
}: {
  confirmDelete: boolean;
  pending: boolean;
  onRequest: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirmDelete) {
    return (
      <button
        type="button"
        onClick={onRequest}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-[8px] border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Eliminar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600">¿Eliminar?</span>
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className="rounded-[8px] bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {pending ? 'Eliminando…' : 'Sí'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="rounded-[8px] border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
      >
        No
      </button>
    </div>
  );
}
