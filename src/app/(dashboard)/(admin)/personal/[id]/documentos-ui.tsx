'use client';

import { useRef, useState } from 'react';
import { FileText, Paperclip, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  guardarDocumentoLegajoAction,
  quitarArchivoDocumentoLegajoAction,
} from '@/app/actions/legajo-documentos';
import { fechaLegible } from '@/lib/documentacion-fechas';
import { todayArg } from '@/lib/dates';
import { DOCUMENTOS_LEGAJO, type DocumentoLegajoDef } from '@/lib/legajo/constantes';
import type { LegajoDetalle } from '@/lib/legajo/consultas';

import { botonSecundario, inputCls, useAccion } from '@/components/shared/form-ui';

type DocEstado = LegajoDetalle['documentos'][string] | undefined;

const defDe = (tipo: string): DocumentoLegajoDef => {
  const d = DOCUMENTOS_LEGAJO.find((x) => x.tipo === tipo);
  if (!d) throw new Error(`Tipo de documento desconocido: ${tipo}`);
  return d;
};

/** Botón "Adjuntar / Reemplazar" que sube el archivo apenas se elige. */
function SubirArchivo({
  empleadoId,
  tipo,
  tiene,
  etiqueta,
}: {
  empleadoId: string;
  tipo: string;
  tiene: boolean;
  etiqueta?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { pending, ejecutar } = useAccion();

  function elegido(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set('empleadoId', empleadoId);
    fd.set('tipo', tipo);
    fd.set('file', file);
    ejecutar(() => guardarDocumentoLegajoAction(fd), 'Archivo guardado.');
    if (ref.current) ref.current.value = '';
  }

  return (
    <>
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
          {pending ? 'Subiendo…' : (etiqueta ?? (tiene ? 'Reemplazar' : 'Adjuntar'))}
        </span>
      </button>
    </>
  );
}

function QuitarArchivo({ empleadoId, tipo }: { empleadoId: string; tipo: string }) {
  const { pending, ejecutar } = useAccion();
  return (
    <button
      type="button"
      disabled={pending}
      title="Quitar el archivo"
      aria-label="Quitar el archivo"
      onClick={() => {
        if (window.confirm('¿Quitar el archivo adjunto? El documento queda sin archivo.')) {
          ejecutar(() => quitarArchivoDocumentoLegajoAction(empleadoId, tipo), 'Archivo quitado.');
        }
      }}
      className="rounded-[8px] p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

/** Adjunto de un documento puntual dentro de otra solapa (copia de CBU, apto médico, alta ARCA…). */
export function AdjuntoInline({
  empleadoId,
  tipo,
  doc,
  rotulo,
}: {
  empleadoId: string;
  tipo: string;
  doc: DocEstado;
  rotulo?: string;
}) {
  const def = defDe(tipo);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-gray-300 bg-gray-50/60 px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-[#669E9D]" />
      <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
        {doc?.archivoNombre ?? rotulo ?? def.label}
        {!doc?.archivoNombre && <span className="ml-1 text-xs text-gray-400">(sin archivo)</span>}
      </span>
      {doc?.url && (
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#175861] hover:bg-gray-50"
        >
          Ver
        </a>
      )}
      <SubirArchivo empleadoId={empleadoId} tipo={tipo} tiene={!!doc?.url} />
      {doc?.url && <QuitarArchivo empleadoId={empleadoId} tipo={tipo} />}
    </div>
  );
}

/** Fila de la solapa Documentación: casilla "Posee", vencimiento opcional y archivo. */
export function FilaDocumento({
  empleadoId,
  tipo,
  doc,
}: {
  empleadoId: string;
  tipo: string;
  doc: DocEstado;
}) {
  const def = defDe(tipo);
  const { pending, ejecutar } = useAccion();
  const [venc, setVenc] = useState(doc?.vencimiento ?? '');
  const hoy = todayArg();
  const vencido = !!doc?.vencimiento && doc.vencimiento < hoy;

  function guardarCampos(posee: boolean, vencimiento: string) {
    const fd = new FormData();
    fd.set('empleadoId', empleadoId);
    fd.set('tipo', tipo);
    fd.set('actualizarCampos', 'true');
    fd.set('posee', String(posee));
    fd.set('vencimiento', vencimiento);
    ejecutar(() => guardarDocumentoLegajoAction(fd));
  }

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-gray-200 bg-white px-4 py-3 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {def.conCheck && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                checked={doc?.posee ?? false}
                disabled={pending}
                onChange={(e) => guardarCampos(e.target.checked, venc)}
              />
              <span className="text-sm font-medium text-gray-800">{def.label}</span>
            </label>
          )}
          {!def.conCheck && <span className="text-sm font-medium text-gray-800">{def.label}</span>}
          {def.conCheck && doc?.posee && !doc.url && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              Falta adjuntar
            </span>
          )}
          {vencido && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              Vencido el {fechaLegible(doc!.vencimiento!)}
            </span>
          )}
        </div>
        {doc?.archivoNombre && (
          <p className="mt-0.5 truncate text-xs text-gray-500">{doc.archivoNombre}</p>
        )}
      </div>

      {def.conVencimiento && (
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          Vence
          <input
            type="date"
            className={`${inputCls} !h-9 !w-40`}
            value={venc}
            disabled={pending}
            onChange={(e) => setVenc(e.target.value)}
            onBlur={() => {
              if (venc !== (doc?.vencimiento ?? '')) guardarCampos(doc?.posee ?? false, venc);
            }}
          />
        </label>
      )}

      <div className="flex shrink-0 items-center gap-2">
        {doc?.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#175861] hover:bg-gray-50"
          >
            Ver
          </a>
        )}
        <SubirArchivo empleadoId={empleadoId} tipo={tipo} tiene={!!doc?.url} />
        {doc?.url && <QuitarArchivo empleadoId={empleadoId} tipo={tipo} />}
      </div>
    </div>
  );
}

// toast se usa en subcomponentes que lo importan de ./ui; se reexporta para evitar imports sueltos
export { toast };
