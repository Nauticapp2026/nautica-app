'use client';

import { useRef } from 'react';
import { FileText, Paperclip, Trash2 } from 'lucide-react';

import {
  quitarArchivoDocumentoAction,
  subirDocumentoFijoAction,
} from '@/app/actions/proveedores-documentos';
import { botonSecundario, useAccion } from '@/components/shared/form-ui';

/** Adjunto fijo de la pestaña fiscal (legajo impositivo, certificado de retenciones). */
export function AdjuntoFijo({
  proveedorId,
  clave,
  rotulo,
  adjunto,
}: {
  proveedorId: string;
  clave: 'legajo_impositivo' | 'cert_retencion';
  rotulo: string;
  adjunto: { id: string; nombre: string | null; url: string | null } | undefined;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { pending, ejecutar } = useAccion();

  function elegido(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set('proveedorId', proveedorId);
    fd.set('clave', clave);
    fd.set('file', file);
    ejecutar(() => subirDocumentoFijoAction(fd), 'Archivo guardado.');
    if (ref.current) ref.current.value = '';
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-gray-300 bg-gray-50/60 px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-[#669E9D]" />
      <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
        {adjunto?.nombre ?? rotulo}
        {!adjunto && <span className="ml-1 text-xs text-gray-400">(sin archivo)</span>}
      </span>
      {adjunto?.url && (
        <a
          href={adjunto.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#175861] hover:bg-gray-50"
        >
          Ver
        </a>
      )}
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => elegido(e.target.files?.[0])}
      />
      <button
        type="button"
        className={botonSecundario}
        disabled={pending}
        onClick={() => ref.current?.click()}
      >
        <span className="inline-flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" />
          {pending ? 'Subiendo…' : adjunto ? 'Reemplazar' : 'Adjuntar'}
        </span>
      </button>
      {adjunto && (
        <button
          type="button"
          disabled={pending}
          aria-label="Quitar el archivo"
          title="Quitar el archivo"
          onClick={() => {
            if (window.confirm('¿Quitar el archivo adjunto?')) {
              ejecutar(
                () => quitarArchivoDocumentoAction(proveedorId, adjunto.id),
                'Archivo quitado.',
              );
            }
          }}
          className="rounded-[8px] p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
