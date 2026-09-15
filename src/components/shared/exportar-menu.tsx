'use client';

import { useState } from 'react';
import { ChevronDown, FileDown } from 'lucide-react';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FORMATOS_EXPORTACION, type FormatoExportacion } from '@/lib/exportar-tabla';

/**
 * Botón "Exportar" con el desplegable de formato (Excel / PDF / CSV).
 *
 * Reemplaza al botón que exportaba CSV directo en Ventas, Cobranzas y Cuenta
 * Corriente (pedido del cliente 2026-09-15: elegir la extensión). El botón se
 * ve IGUAL que antes — mismas clases — solo que ahora abre el menú en vez de
 * descargar de una. Quién arma las columnas y las filas sigue siendo cada
 * pantalla; acá solo se elige el formato y se muestra el estado.
 *
 * `className` reemplaza las clases del botón por completo, porque cada pantalla
 * ya tenía su tamaño (h-10 en Ventas/Cobranzas, h-9 en la ficha del socio) y no
 * hay que unificarlos: tienen que seguir pareciéndose a los botones de al lado.
 */
export function ExportarMenu({
  onExportar,
  disabled = false,
  className,
}: {
  onExportar: (formato: FormatoExportacion) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const [exportando, setExportando] = useState(false);

  async function elegir(formato: FormatoExportacion) {
    setExportando(true);
    try {
      await onExportar(formato);
    } catch (err) {
      console.error('[ExportarMenu]', err);
      toast.error('No se pudo generar el archivo. Probá de nuevo.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || exportando}
          title="Exportar"
          className={
            className ??
            'flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40'
          }
        >
          <FileDown className="h-4 w-4" />
          <span className="hidden sm:inline">{exportando ? 'Exportando…' : 'Exportar'}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {FORMATOS_EXPORTACION.map((f) => (
          <DropdownMenuItem key={f.value} onSelect={() => void elegir(f.value)}>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{f.label}</span>
              <span className="text-xs text-gray-500">{f.detalle}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
