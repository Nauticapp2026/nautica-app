'use client';

import { useMemo, useState } from 'react';
import { Calendar, Edit3, FilterX, Globe, MessageSquare, Plus, Send, Users } from 'lucide-react';

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

export function ComunicacionesClient({ comunicaciones }: { comunicaciones: Comunicacion[] }) {
  const [query, setQuery] = useState('');

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
          <h1 className="text-2xl font-bold" style={{ color: '#101828' }}>
            Comunicaciones
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#669E9D' }}>
            Gestiona anuncios y comunicados
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Disponible en la próxima entrega"
          className="flex items-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] disabled:opacity-60"
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
            <ComunicacionCard key={c.id} c={c} />
          ))}
        </div>
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

function ComunicacionCard({ c }: { c: Comunicacion }) {
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
          disabled
          title="Disponible en la próxima entrega"
          className="rounded-[8px] p-1.5 text-[#669E9D] hover:bg-gray-100 disabled:opacity-40"
        >
          <Edit3 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
