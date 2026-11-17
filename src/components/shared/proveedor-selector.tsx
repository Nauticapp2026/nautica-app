'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

import { inputCls } from '@/components/shared/form-ui';
import { normalizarBusqueda } from '@/lib/buscador';
import type { ProveedorSelector } from '@/lib/cuentas-a-pagar/consultas';

/**
 * Ayuda para elegir un proveedor del Maestro de Proveedores: se busca por código, razón
 * social o CUIT y se elige de la lista. Solo ofrece proveedores que existen en el maestro
 * (los inactivos ya vienen filtrados desde el servidor).
 */
export function ProveedorSelect({
  proveedores,
  value,
  onChange,
  disabled,
}: {
  proveedores: ProveedorSelector[];
  value: string;
  onChange: (p: ProveedorSelector | null) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const elegido = proveedores.find((p) => p.id === value) ?? null;

  const resultados = useMemo(() => {
    const n = normalizarBusqueda(q);
    const lista = n
      ? proveedores.filter((p) =>
          normalizarBusqueda(`${p.codigo} ${p.nombre} ${p.cuit ?? ''}`).includes(n),
        )
      : proveedores;
    return lista.slice(0, 50);
  }, [proveedores, q]);

  if (elegido) {
    return (
      <div className="border-input flex items-center justify-between gap-2 rounded-md border bg-gray-50 px-3 py-2 text-sm">
        <span>
          <span className="font-semibold text-gray-900">{elegido.codigo}</span> · {elegido.nombre}
          {elegido.cuit ? <span className="text-gray-500"> · {elegido.cuit}</span> : null}
        </span>
        {!disabled && (
          <button
            type="button"
            aria-label="Cambiar proveedor"
            className="rounded p-1 text-gray-400 hover:bg-gray-200"
            onClick={() => {
              onChange(null);
              setQ('');
              setAbierto(true);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        className={`${inputCls} pl-9`}
        placeholder="Buscar proveedor por código, razón social o CUIT"
        value={q}
        disabled={disabled}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
      />
      {abierto && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-gray-500">
              No hay proveedores que coincidan. Solo se puede cargar con proveedores del Maestro de
              Proveedores.
            </li>
          ) : (
            resultados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(p);
                    setAbierto(false);
                  }}
                >
                  <span className="font-medium text-gray-900">
                    {p.codigo} · {p.nombre}
                  </span>
                  <span className="text-xs text-gray-500">{p.cuit ?? 'Sin CUIT'}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
