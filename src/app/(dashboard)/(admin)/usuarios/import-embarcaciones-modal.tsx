'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  confirmImportEmbarcacionesAction,
  previewImportEmbarcacionesAction,
} from '@/app/actions/bulk-import-embarcaciones';
import {
  STATUS_LABEL,
  STATUS_TONE,
  type ImportEmbarcacionPreview,
  type PreviewEmbarcacionesResumen,
} from './bulk-import-embarcaciones-types';

type Step = 'pick' | 'preview' | 'done';

const TONE_CLASSES: Record<'ok' | 'warn' | 'error', string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
};

export function ImportEmbarcacionesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportEmbarcacionPreview[]>([]);
  const [resumen, setResumen] = useState<PreviewEmbarcacionesResumen | null>(null);
  const [finalSummary, setFinalSummary] = useState<{
    creadas: number;
    saltadas: number;
    falladas: { fila: number; nombre: string; mensaje: string }[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setStep('pick');
    setFile(null);
    setPreview([]);
    setResumen(null);
    setFinalSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  }

  function handlePreview() {
    if (!file) {
      toast.error('Elegí un archivo .xlsx primero.');
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await previewImportEmbarcacionesAction(fd);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setPreview(res.rows ?? []);
      setResumen(res.resumen ?? null);
      setStep('preview');
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      const res = await confirmImportEmbarcacionesAction({ rows: preview });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setFinalSummary(res.resumen ?? null);
      setStep('done');
      toast.success(`${res.resumen?.creadas ?? 0} embarcaciones creadas.`);
      router.refresh();
    });
  }

  if (!open) return null;

  const aProcesar = resumen?.aCrear ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Importar embarcaciones desde Excel
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {step === 'pick' && 'Subí la plantilla con las embarcaciones a importar.'}
              {step === 'preview' &&
                `Revisá las ${preview.length} filas antes de confirmar la importación.`}
              {step === 'done' && 'Listo. Mirá el resumen abajo.'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'pick' && (
            <PickStep file={file} fileInputRef={fileInputRef} onPickFile={onPickFile} />
          )}
          {step === 'preview' && resumen && <PreviewStep rows={preview} resumen={resumen} />}
          {step === 'done' && finalSummary && <DoneStep summary={finalSummary} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
          {step === 'pick' && (
            <>
              <button
                onClick={handleClose}
                className="rounded-[10px] px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={handlePreview}
                disabled={!file || isPending}
                className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: '#175861' }}
              >
                {isPending ? 'Procesando...' : 'Ver previsualización'}
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('pick')}
                disabled={isPending}
                className="rounded-[10px] px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                ← Volver
              </button>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  Se van a crear <strong>{aProcesar}</strong> embarcaciones
                </span>
                <button
                  onClick={handleConfirm}
                  disabled={isPending || aProcesar === 0}
                  className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: '#175861' }}
                >
                  {isPending ? 'Importando...' : 'Confirmar importación'}
                </button>
              </div>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={handleClose}
              className="ml-auto rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#175861' }}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pick step ───────────────────────────────────────────────────────────────
function PickStep({
  file,
  fileInputRef,
  onPickFile,
}: {
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPickFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-[#175861]" />
          <div className="flex-1 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">¿No tenés la plantilla?</p>
            <p className="mt-1 text-gray-600">
              Descargá el archivo, completalo con los datos de las embarcaciones y volvé a subirlo
              acá. Recordá que cada embarcación se vincula a un socio por su email, así que los
              socios tienen que estar cargados primero.
            </p>
            <a
              href="/templates/embarcaciones.xlsx"
              download="plantilla-embarcaciones.xlsx"
              className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border border-[#175861] px-3 py-1.5 text-sm font-medium text-[#175861] hover:bg-[#175861] hover:text-white"
            >
              <Download className="h-4 w-4" />
              Descargar plantilla
            </a>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Tu archivo</label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-6 text-left transition hover:border-[#175861] hover:bg-[#F0F8F8]"
        >
          <Upload className="h-5 w-5 text-gray-400" />
          <div className="flex-1">
            {file ? (
              <>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB · Hacé clic para elegir otro archivo
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-900">Elegir archivo .xlsx</p>
                <p className="text-xs text-gray-500">Hacé clic acá para seleccionar tu Excel</p>
              </>
            )}
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={onPickFile}
        />
      </div>
    </div>
  );
}

// ─── Preview step ────────────────────────────────────────────────────────────
function PreviewStep({
  rows,
  resumen,
}: {
  rows: ImportEmbarcacionPreview[];
  resumen: PreviewEmbarcacionesResumen;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total" value={resumen.total} />
        <Stat label="A crear" value={resumen.aCrear} tone="ok" />
        <Stat label="Se saltan" value={resumen.saltados} tone="warn" />
        <Stat label="Con error" value={resumen.conError} tone="error" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2 font-semibold text-gray-700">Fila</th>
              <th className="px-3 py-2 font-semibold text-gray-700">Embarcación</th>
              <th className="px-3 py-2 font-semibold text-gray-700">Dueño (email)</th>
              <th className="px-3 py-2 font-semibold text-gray-700">Matrícula</th>
              <th className="px-3 py-2 font-semibold text-gray-700">Estado</th>
              <th className="px-3 py-2 font-semibold text-gray-700">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tone = STATUS_TONE[r.status];
              return (
                <tr key={r.rowIndex} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-500">{r.rowIndex}</td>
                  <td className="px-3 py-2 text-gray-900">{r.raw.nombre || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{r.raw.emailSocio || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{r.raw.matricula || '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{r.mensaje}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn' | 'error';
}) {
  const cls = tone ? TONE_CLASSES[tone] : 'bg-gray-50 text-gray-700 border-gray-200';
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <p className="text-xs tracking-wide uppercase opacity-80">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

// ─── Done step ───────────────────────────────────────────────────────────────
function DoneStep({
  summary,
}: {
  summary: {
    creadas: number;
    saltadas: number;
    falladas: { fila: number; nombre: string; mensaje: string }[];
  };
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <h3 className="text-xl font-bold text-gray-900">Importación completada</h3>
        <p className="text-sm text-gray-600">
          Las embarcaciones quedaron vinculadas a sus dueños y sin amarra asignada todavía.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Creadas" value={summary.creadas} tone="ok" />
        <Stat label="Saltadas" value={summary.saltadas} tone="warn" />
      </div>

      {summary.falladas.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-sm font-semibold text-red-800">
            {summary.falladas.length} fila(s) fallaron:
          </p>
          <ul className="space-y-1 text-xs text-red-700">
            {summary.falladas.map((f) => (
              <li key={`${f.fila}-${f.nombre}`}>
                Fila {f.fila} ({f.nombre}): {f.mensaje}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
