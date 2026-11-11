'use client';

import { useRef, useState } from 'react';
import { Paperclip, Trash2 } from 'lucide-react';

import {
  eliminarRequisitoAction,
  guardarRequisitoAction,
  quitarArchivoDocumentoAction,
} from '@/app/actions/proveedores-documentos';
import {
  Campo,
  CatalogoSelect,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  inputCls,
  useAccion,
} from '@/components/shared/form-ui';
import type { CatalogosDisponibles } from '@/lib/catalogos-club';
import { todayArg } from '@/lib/dates';
import { fechaLegible } from '@/lib/documentacion-fechas';
import type { ProveedorDetalle } from '@/lib/proveedores/consultas';

type Requisito = ProveedorDetalle['requisitos'][number];

/**
 * Documentación que el proveedor debe presentar para ingresar o trabajar en el recinto. El
 * club enumera los requisitos que quiera; cada uno puede llevar vencimiento y archivo.
 */
export function TabDocumentacion({
  det,
  catalogos,
}: {
  det: ProveedorDetalle;
  catalogos: CatalogosDisponibles;
}) {
  const proveedorId = det.proveedor.id;
  const { pending, ejecutar } = useAccion();
  const [nuevo, setNuevo] = useState({ requisito: '', obligatorio: true, vencimiento: '' });
  const archivoNuevo = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);

  const yaCargados = new Set(det.requisitos.map((r) => r.requisito.toLowerCase()));
  const opciones = catalogos.prov_documento.filter((o) => !yaCargados.has(o.toLowerCase()));

  const pendientes = det.requisitos.filter((r) => r.obligatorio && !r.presentado).length;

  function agregar() {
    const fd = new FormData();
    fd.set('proveedorId', proveedorId);
    fd.set('requisito', nuevo.requisito);
    fd.set('obligatorio', String(nuevo.obligatorio));
    fd.set('presentado', 'false');
    fd.set('vencimiento', nuevo.vencimiento);
    if (archivo) fd.set('file', archivo);
    ejecutar(
      () => guardarRequisitoAction(fd),
      'Requisito agregado.',
      () => {
        setNuevo({ requisito: '', obligatorio: true, vencimiento: '' });
        setArchivo(null);
      },
    );
  }

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Documentación requerida"
        descripcion="Lo que el proveedor debe presentar para ingresar o trabajar en el recinto. Enumerá todos los requisitos que necesites."
      >
        {det.requisitos.length > 0 && pendientes > 0 && (
          <p className="mb-3 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Faltan presentar {pendientes}{' '}
            {pendientes === 1 ? 'requisito obligatorio' : 'requisitos obligatorios'}.
          </p>
        )}

        {det.requisitos.length === 0 ? (
          <p className="mb-4 text-sm text-gray-500">Todavía no hay requisitos cargados.</p>
        ) : (
          <div className="mb-5 space-y-2">
            {det.requisitos.map((r) => (
              <FilaRequisito key={r.id} proveedorId={proveedorId} r={r} />
            ))}
          </div>
        )}

        <div className="rounded-[10px] border border-gray-200 bg-gray-50/60 p-4">
          <p className="mb-3 text-sm font-semibold text-gray-800">Agregar un requisito</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Campo label="Documento" requerido>
              <CatalogoSelect
                tipo="prov_documento"
                value={nuevo.requisito}
                onChange={(v) => setNuevo((x) => ({ ...x, requisito: v }))}
                opciones={opciones}
              />
            </Campo>
            <Campo label="Vencimiento" ayuda="Opcional.">
              <input
                type="date"
                className={inputCls}
                value={nuevo.vencimiento}
                onChange={(e) => setNuevo((x) => ({ ...x, vencimiento: e.target.value }))}
              />
            </Campo>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                checked={nuevo.obligatorio}
                onChange={(e) => setNuevo((x) => ({ ...x, obligatorio: e.target.checked }))}
              />
              <span className="text-sm text-gray-700">Es obligatorio para ingresar</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={archivoNuevo}
                type="file"
                className="hidden"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className={botonSecundario}
                onClick={() => archivoNuevo.current?.click()}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Paperclip className="h-4 w-4" />
                  {archivo ? archivo.name : 'Adjuntar archivo'}
                </span>
              </button>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className={botonPrimario}
              disabled={pending || !nuevo.requisito.trim()}
              onClick={agregar}
            >
              {pending ? 'Guardando…' : 'Agregar requisito'}
            </button>
          </div>
        </div>
      </Tarjeta>
      <p className="text-xs text-gray-500">
        Archivos PDF, JPG, PNG o WebP de hasta 8 MB, en un espacio privado: solo los ve la
        administración del club.
      </p>
    </div>
  );
}

function FilaRequisito({ proveedorId, r }: { proveedorId: string; r: Requisito }) {
  const { pending, ejecutar } = useAccion();
  const fileRef = useRef<HTMLInputElement>(null);
  const [venc, setVenc] = useState(r.vencimiento ?? '');
  const vencido = !!r.vencimiento && r.presentado && r.vencimiento < todayArg();

  function guardar(parcial: {
    presentado?: boolean;
    obligatorio?: boolean;
    vencimiento?: string;
    file?: File;
  }) {
    const fd = new FormData();
    fd.set('proveedorId', proveedorId);
    fd.set('id', r.id);
    fd.set('requisito', r.requisito);
    fd.set('obligatorio', String(parcial.obligatorio ?? r.obligatorio));
    fd.set('presentado', String(parcial.presentado ?? r.presentado));
    fd.set('vencimiento', parcial.vencimiento ?? venc);
    fd.set('notas', r.notas ?? '');
    if (parcial.file) fd.set('file', parcial.file);
    ejecutar(() => guardarRequisitoAction(fd), parcial.file ? 'Archivo guardado.' : undefined);
  }

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-gray-200 bg-white px-4 py-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
              checked={r.presentado}
              disabled={pending}
              onChange={(e) => guardar({ presentado: e.target.checked })}
            />
            <span className="text-sm font-medium text-gray-800">{r.requisito}</span>
          </label>
          {r.obligatorio ? (
            !r.presentado && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                Falta presentar
              </span>
            )
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              Opcional
            </span>
          )}
          {vencido && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              Vencido el {fechaLegible(r.vencimiento!)}
            </span>
          )}
        </div>
        {r.archivoNombre && (
          <p className="mt-0.5 truncate text-xs text-gray-500">{r.archivoNombre}</p>
        )}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-gray-500">
        Vence
        <input
          type="date"
          className={`${inputCls} !h-9 !w-40`}
          value={venc}
          disabled={pending}
          onChange={(e) => setVenc(e.target.value)}
          onBlur={() => {
            if (venc !== (r.vencimiento ?? '')) guardar({ vencimiento: venc });
          }}
        />
      </label>

      <div className="flex shrink-0 items-center gap-2">
        {r.url && (
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#175861] hover:bg-gray-50"
          >
            Ver
          </a>
        )}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) guardar({ file });
            if (fileRef.current) fileRef.current.value = '';
          }}
        />
        <button
          type="button"
          className={botonSecundario}
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          <span className="inline-flex items-center gap-1.5">
            <Paperclip className="h-4 w-4" />
            {r.url ? 'Reemplazar' : 'Adjuntar'}
          </span>
        </button>
        {r.url && (
          <button
            type="button"
            disabled={pending}
            title="Quitar el archivo"
            aria-label="Quitar el archivo"
            className="rounded-[8px] px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
            onClick={() => {
              if (window.confirm('¿Quitar el archivo adjunto? El requisito queda sin archivo.')) {
                ejecutar(() => quitarArchivoDocumentoAction(proveedorId, r.id), 'Archivo quitado.');
              }
            }}
          >
            Quitar archivo
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          aria-label="Eliminar requisito"
          title="Eliminar el requisito"
          className="rounded-[8px] p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
          onClick={() => {
            if (window.confirm(`¿Eliminar el requisito “${r.requisito}”?`)) {
              ejecutar(() => eliminarRequisitoAction(proveedorId, r.id), 'Requisito eliminado.');
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
