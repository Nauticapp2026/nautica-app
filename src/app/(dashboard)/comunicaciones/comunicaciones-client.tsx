'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Edit3, FilterX, Globe, MessageSquare, Plus, Send, Users, X } from 'lucide-react';

import {
  createComunicacionAction,
  updateComunicacionAction,
  type ComunicacionInput,
} from '@/app/actions/comunicaciones';

export type TipoComunicacion = 'socios' | 'publica';
export type CategoriaComunicacion =
  | 'informacion'
  | 'anuncio'
  | 'evento'
  | 'mantenimiento'
  | 'alerta';

export type Comunicacion = {
  id: string;
  titulo: string;
  texto: string | null;
  categoria: CategoriaComunicacion | null;
  tipo: TipoComunicacion;
  publicar: boolean;
  fecha: string | null;
  autor: string | null;
};

const CATEGORIA_LABELS: Record<CategoriaComunicacion, { label: string; cls: string }> = {
  informacion: { label: 'Información', cls: 'bg-[#ECFDF3] text-[#027A48]' },
  anuncio: { label: 'Anuncio', cls: 'bg-blue-50 text-blue-700' },
  evento: { label: 'Evento', cls: 'bg-purple-50 text-purple-700' },
  mantenimiento: { label: 'Mantenimiento', cls: 'bg-orange-50 text-orange-700' },
  alerta: { label: 'Alerta', cls: 'bg-red-50 text-red-700' },
};

const TIPO_LABELS: Record<TipoComunicacion, { label: string; cls: string }> = {
  socios: { label: 'Socios', cls: 'bg-purple-50 text-purple-700' },
  publica: { label: 'Pública', cls: 'bg-sky-50 text-sky-700' },
};

function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

type ModalState = { mode: 'create' } | { mode: 'edit'; comunicacion: Comunicacion } | null;

export function ComunicacionesClient({ comunicaciones }: { comunicaciones: Comunicacion[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<ModalState>(null);

  const stats = useMemo(() => {
    const total = comunicaciones.length;
    const publicadas = comunicaciones.filter((c) => c.publicar).length;
    const soloSocios = comunicaciones.filter((c) => c.tipo === 'socios').length;
    const publicas = comunicaciones.filter((c) => c.tipo === 'publica').length;
    return { total, publicadas, soloSocios, publicas };
  }, [comunicaciones]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return comunicaciones;
    return comunicaciones.filter(
      (c) => c.titulo.toLowerCase().includes(q) || (c.texto ?? '').toLowerCase().includes(q),
    );
  }, [comunicaciones, query]);

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Comunicaciones</h1>
          <p className="page-subtitle mt-1">Gestiona anuncios y comunicados</p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249]"
        >
          <Plus className="h-4 w-4" />
          Nueva comunicación
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<MessageSquare className="h-5 w-5" />} label="Total" value={stats.total} />
        <StatCard icon={<Send className="h-5 w-5" />} label="Publicadas" value={stats.publicadas} />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Solo Socios"
          value={stats.soloSocios}
        />
        <StatCard icon={<Globe className="h-5 w-5" />} label="Públicas" value={stats.publicas} />
      </div>

      <div className="mb-6 flex items-center gap-3">
        <input
          className={inputCls}
          placeholder="Buscar comunicaciones…"
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
        <div className="rounded-2xl border border-gray-200 bg-white p-16 text-center">
          <p className="text-sm text-gray-500">
            {comunicaciones.length === 0
              ? 'Todavía no hay comunicaciones cargadas.'
              : 'Sin resultados con esa búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <ComunicacionCard
              key={c.id}
              c={c}
              onEdit={() => setModal({ mode: 'edit', comunicacion: c })}
            />
          ))}
        </div>
      )}

      {modal && (
        <ComunicacionModal
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

function ComunicacionCard({ c, onEdit }: { c: Comunicacion; onEdit: () => void }) {
  const categoria = c.categoria ? CATEGORIA_LABELS[c.categoria] : null;
  const tipo = TIPO_LABELS[c.tipo];

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold" style={{ color: '#101828' }}>
            {c.titulo}
          </h3>
          {c.texto && <p className="mt-1 text-sm text-gray-600">{c.texto}</p>}
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
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
          <Calendar className="h-3.5 w-3.5" />
          {formatFecha(c.fecha)}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <p className="text-xs" style={{ color: '#669E9D' }}>
          Por: {c.autor ?? '—'}
        </p>
        <button
          type="button"
          onClick={onEdit}
          title="Editar comunicación"
          className="rounded-[8px] p-1.5 text-[#669E9D] hover:bg-gray-100"
        >
          <Edit3 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function ComunicacionModal({
  state,
  onClose,
  onSaved,
}: {
  state: NonNullable<ModalState>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.mode === 'edit';
  const initial = isEdit ? state.comunicacion : null;

  const [titulo, setTitulo] = useState(initial?.titulo ?? '');
  const [texto, setTexto] = useState(initial?.texto ?? '');
  const [tipo, setTipo] = useState<'' | TipoComunicacion>(initial?.tipo ?? '');
  const [categoria, setCategoria] = useState<'' | CategoriaComunicacion>(initial?.categoria ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const baseValido = Boolean(titulo.trim() && tipo && categoria);

  const submit = (publicar: boolean) => {
    setError(null);
    if (!titulo.trim()) {
      setError('El título es obligatorio.');
      return;
    }
    if (!tipo) {
      setError('Elegí el tipo de comunicación.');
      return;
    }
    if (!categoria) {
      setError('Elegí una categoría.');
      return;
    }

    const input: ComunicacionInput = {
      titulo: titulo.trim(),
      texto,
      tipo,
      categoria,
      publicar,
    };

    startTransition(async () => {
      const res = isEdit
        ? await updateComunicacionAction(state.comunicacion.id, input)
        : await createComunicacionAction(input);
      if (res.error) setError(res.error);
      else onSaved();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
            {isEdit ? 'Editar Comunicación' : 'Nueva Comunicación'}
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
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Título</label>
            <input
              className={inputCls}
              placeholder="Título de la comunicación"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Contenido</label>
            <textarea
              className={`${inputCls} h-28 py-3`}
              placeholder="Escribe el contenido de la comunicación…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Tipo de comunicación
              </label>
              <select
                className={inputCls}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as '' | TipoComunicacion)}
              >
                <option value="">Seleccione una opción…</option>
                <option value="socios">Socios</option>
                <option value="publica">Pública</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Categoría</label>
              <select
                className={inputCls}
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as '' | CategoriaComunicacion)}
              >
                <option value="">Seleccione una opción…</option>
                <option value="informacion">Información</option>
                <option value="anuncio">Anuncio</option>
                <option value="evento">Evento</option>
                <option value="mantenimiento">Mantenimiento</option>
                <option value="alerta">Alerta</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 p-6">
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={pending || !titulo.trim()}
            className="rounded-[10px] border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
          >
            {pending ? 'Guardando…' : 'Guardar borrador'}
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={pending || !baseValido}
            className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
          >
            {pending ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
