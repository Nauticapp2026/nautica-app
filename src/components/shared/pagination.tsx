'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
  /** Página actual (1-based). */
  page: number;
  /** Cantidad total de ítems (sin paginar). */
  totalItems: number;
  /** Ítems por página. */
  pageSize: number;
  /** Callback al cambiar de página. */
  onPageChange: (page: number) => void;
};

/**
 * Paginación client-side reutilizable. Muestra el rango visible ("11–20 de 47")
 * y controles anterior/siguiente con números de página.
 *
 * No renderiza nada si hay una sola página.
 */
export function Pagination({ page, totalItems, pageSize, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  if (pageCount <= 1) return null;

  const current = Math.min(Math.max(1, page), pageCount);
  const desde = (current - 1) * pageSize + 1;
  const hasta = Math.min(current * pageSize, totalItems);

  // Ventana de páginas a mostrar (máx 5), centrada en la actual.
  const ventana = 5;
  let inicio = Math.max(1, current - Math.floor(ventana / 2));
  const fin = Math.min(pageCount, inicio + ventana - 1);
  inicio = Math.max(1, fin - ventana + 1);
  const paginas = Array.from({ length: fin - inicio + 1 }, (_, i) => inicio + i);

  const btnBase =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-[8px] border px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row">
      <p className="text-xs text-gray-500">
        Mostrando <span className="font-medium text-gray-700">{desde}</span>–
        <span className="font-medium text-gray-700">{hasta}</span> de{' '}
        <span className="font-medium text-gray-700">{totalItems}</span>
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(current - 1)}
          disabled={current === 1}
          aria-label="Página anterior"
          className={`${btnBase} border-gray-200 text-gray-600 hover:bg-gray-50`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {paginas.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-current={p === current ? 'page' : undefined}
            className={
              p === current
                ? `${btnBase} bg-primary text-primary-foreground border-transparent`
                : `${btnBase} border-gray-200 text-gray-600 hover:bg-gray-50`
            }
          >
            {p}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onPageChange(current + 1)}
          disabled={current === pageCount}
          aria-label="Página siguiente"
          className={`${btnBase} border-gray-200 text-gray-600 hover:bg-gray-50`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
