'use client';

import { useMemo, useState } from 'react';
import { Edit3, Plus, Tag, Trash2 } from 'lucide-react';

export type TipoTarifa = 'cuota_mensual' | 'servicios' | 'espacios';
export type EstadoTarifa = 'activo' | 'inactivo';

export type Tarifa = {
  id: string;
  nombre: string;
  tipo: TipoTarifa;
  precio: number;
  estado: EstadoTarifa;
};

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

function formatARS(n: number): string {
  return n.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  });
}

export function TarifarioClient({ tarifas }: { tarifas: Tarifa[] }) {
  const [filtro, setFiltro] = useState<FiltroCategoria>('todas');

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

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#101828' }}>
            Tarifario
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#669E9D' }}>
            Gestiona y actualiza las tarifas de servicios
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] disabled:opacity-60"
          disabled
          title="Disponible en la próxima entrega"
        >
          <Plus className="h-4 w-4" />
          Nueva tarifa
        </button>
      </header>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-[#F3F6F6] p-5">
        <h2 className="mb-3 text-sm font-bold" style={{ color: '#101828' }}>
          Ajuste Masivo de Tarifas
        </h2>
        <p className="text-sm text-gray-500">Disponible en la próxima entrega.</p>
      </section>

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
            <TablaTarifas items={list} />
          </section>
        ))
      )}
    </div>
  );
}

function TablaTarifas({ items }: { items: Tarifa[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
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
                    className="rounded-[8px] p-1.5 text-[#669E9D] hover:bg-gray-100 disabled:opacity-40"
                    disabled
                    title="Disponible en la próxima entrega"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-[8px] p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                    disabled
                    title="Disponible en la próxima entrega"
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
