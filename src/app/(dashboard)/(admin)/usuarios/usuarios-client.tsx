'use client';

import { useState, useTransition, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Mail,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { createSocioAction, uploadSocioDocumentoAction } from '@/app/actions/socios';
import { formatArgentinaDate } from '@/lib/dates';
import { EmptyState } from '@/components/shared/empty-state';
import { ImportSociosModal } from './import-socios-modal';
import { ImportEmbarcacionesModal } from './import-embarcaciones-modal';
import { ASTILLEROS } from './astilleros';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FiltroSocios = 'morosos' | 'docs-incompletas';

type InvitadoItem = {
  id: string;
  nombre: string;
  apellido: string | null;
  validoHasta: string | null;
};

type AccesoItem = {
  id: string;
  nombre: string | null;
};

type Socio = {
  membresiaId: string;
  profileId: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
  telefono: string | null;
  direccion: string | null;
  deuda: string | null;
  estadoSocio: 'activo' | 'moroso' | null;
  membershipStatus: 'active' | 'suspended' | 'inactivo';
  numeroSocio: number | null;
  embarcacion: string | null;
  ubicacion: string | null;
  docsCompletos: boolean;
  datosIncompletos: boolean;
  fechaIngreso: string | null;
  invitados: InvitadoItem[];
  accesosExternos: AccesoItem[];
};

const FILTRO_LABEL: Record<FiltroSocios, string> = {
  morosos: 'Socios con deuda 2+ meses',
  'docs-incompletas': 'Socios con documentación incompleta',
};

function buildWhatsappUrl(telefono: string | null): string | null {
  if (!telefono) return null;
  const digits = telefono.replace(/\D/g, '');
  if (!digits) return null;
  // wa.me requiere número con código de país y sin '+'. Si no empieza con
  // 54 (Argentina), asumimos número local y prepend.
  const normalized = digits.startsWith('54') ? digits : `54${digits}`;
  return `https://wa.me/${normalized}`;
}

type SortKey = 'numero' | 'socio' | 'embarcacion' | 'ubicacion' | 'deuda';
type SortDir = 'asc' | 'desc';

// ─── Constants ───────────────────────────────────────────────────────────────

const TIPO_DOC_OPTS = [
  { value: 'dni', label: 'DNI' },
  { value: 'cuit', label: 'CUIT' },
  { value: 'cuil', label: 'CUIL' },
  { value: 'pasaporte', label: 'Pasaporte' },
  { value: 'cdi', label: 'CDI' },
];

const CONDICION_IVA_OPTS = [
  { value: 'responsable_inscripto', label: 'IVA Responsable Inscripto' },
  { value: 'exento', label: 'IVA Sujeto Exento' },
  { value: 'monotributo', label: 'Responsable Monotributo' },
  { value: 'consumidor_final', label: 'Consumidor Final' },
  { value: 'proveedor_exterior', label: 'Proveedor del Exterior' },
  { value: 'cliente_exterior', label: 'Cliente del Exterior' },
  { value: 'iva_no_alcanzado', label: 'IVA No Alcanzado' },
];

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

const EMPTY_FORM = {
  nombre: '',
  apellido: '',
  email: '',
  telefono: '',
  direccion: '',
  tipoDocumento: '',
  numeroDocumento: '',
  razonSocial: '',
  condicionIva: '',
  embarcacionNombre: '',
  matricula: '',
  astillero: '',
  modelo: '',
  esloraM: '',
};

// ─── Field helper ────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold" style={{ color: '#101828' }}>
        {label}
        {required && '*'}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
      <p className="text-sm font-bold" style={{ color: '#101828' }}>
        {title}
      </p>
      {action}
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

type TipoDocAdjunto = 'carnet_nautico' | 'matricula' | 'seguro';

const TIPO_DOC_ADJUNTO_OPTS: { value: TipoDocAdjunto; label: string }[] = [
  { value: 'carnet_nautico', label: 'Certificado Náutico' },
  { value: 'matricula', label: 'Matrícula' },
  { value: 'seguro', label: 'Seguro' },
];

type AdjuntoInput = { file: File; tipo: TipoDocAdjunto };

function CrearSocioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [facturaFiscal, setFacturaFiscal] = useState(true);
  const [esloraUnidad, setEsloraUnidad] = useState<'m' | 'ft'>('m');
  const [astilleroSel, setAstilleroSel] = useState('');
  const [adjuntos, setAdjuntos] = useState<AdjuntoInput[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isValid = Boolean(
    form.nombre.trim() &&
    form.apellido.trim() &&
    form.email.trim() &&
    form.telefono.trim() &&
    form.direccion.trim() &&
    form.tipoDocumento &&
    form.numeroDocumento.trim(),
  );

  const set =
    (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleClose() {
    setForm(EMPTY_FORM);
    setFacturaFiscal(true);
    setEsloraUnidad('m');
    setAstilleroSel('');
    setAdjuntos([]);
    setUploadProgress(null);
    setError(null);
    onClose();
  }

  function switchEsloraUnidad(nueva: 'm' | 'ft') {
    if (nueva === esloraUnidad) return;
    setForm((f) => {
      const n = parseFloat(f.esloraM);
      if (!f.esloraM || isNaN(n)) return f;
      const converted = nueva === 'ft' ? n * 3.28084 : n * 0.3048;
      return { ...f, esloraM: converted.toFixed(2) };
    });
    setEsloraUnidad(nueva);
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: AdjuntoInput[] = [];
    for (const f of Array.from(files)) {
      next.push({ file: f, tipo: 'carnet_nautico' });
    }
    setAdjuntos((prev) => [...prev, ...next]);
  }

  function updateAdjunto(idx: number, patch: Partial<AdjuntoInput>) {
    setAdjuntos((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  function removeAdjunto(idx: number) {
    setAdjuntos((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    if (!form.nombre || !form.apellido || !form.email || !form.telefono || !form.direccion) {
      setError('Completá los campos obligatorios (*)');
      return;
    }
    setError(null);
    startTransition(async () => {
      const esloraFinal =
        esloraUnidad === 'ft' && form.esloraM
          ? (parseFloat(form.esloraM) * 0.3048).toFixed(2)
          : form.esloraM;
      const res = await createSocioAction({
        ...form,
        esloraM: esloraFinal,
        facturaFiscal,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      const socioId = res.socioId!;

      // Subir adjuntos (si hay). Si alguno falla, mostramos error pero el
      // socio ya quedó creado — el admin puede reintentar.
      for (let i = 0; i < adjuntos.length; i++) {
        const a = adjuntos[i];
        setUploadProgress(`Subiendo ${i + 1}/${adjuntos.length}: ${a.file.name}`);
        const fd = new FormData();
        fd.append('socioId', socioId);
        fd.append('tipo', a.tipo);
        fd.append('file', a.file);
        const up = await uploadSocioDocumentoAction(fd);
        if (up.error) {
          setError(`Socio creado, pero falló "${a.file.name}": ${up.error}`);
          setUploadProgress(null);
          router.refresh();
          return;
        }
      }

      setUploadProgress(null);
      handleClose();
      router.refresh();
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Alta de Socio
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Completá los datos del nuevo socio
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-t border-gray-200" />

        {/* Error banner — visible siempre arriba */}
        {error && (
          <div className="mx-6 mt-4 rounded-[10px] border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* Scrollable body */}
        <div className="max-h-[65vh] overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Datos Personales */}
            <div className="space-y-4">
              <SectionHeader title="Datos Personales" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nombre" required>
                  <input
                    className={inputCls}
                    placeholder="Nombre"
                    value={form.nombre}
                    onChange={set('nombre')}
                  />
                </Field>
                <Field label="Apellido" required>
                  <input
                    className={inputCls}
                    placeholder="Apellido"
                    value={form.apellido}
                    onChange={set('apellido')}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Email" required>
                  <input
                    className={inputCls}
                    type="email"
                    placeholder="email@ejemplo.com"
                    value={form.email}
                    onChange={set('email')}
                  />
                </Field>
                <Field label="Teléfono" required>
                  <input
                    className={inputCls}
                    placeholder="+54 11..."
                    value={form.telefono}
                    onChange={set('telefono')}
                  />
                </Field>
              </div>
              <Field label="Dirección" required>
                <input
                  className={inputCls}
                  placeholder="Av. Libertador 1234"
                  value={form.direccion}
                  onChange={set('direccion')}
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Tipo Documento" required>
                  <select
                    className={inputCls}
                    value={form.tipoDocumento}
                    onChange={set('tipoDocumento')}
                  >
                    <option value="">Seleccione...</option>
                    {TIPO_DOC_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Número Documento" required>
                  <input
                    className={inputCls}
                    placeholder="32434..."
                    value={form.numeroDocumento}
                    onChange={set('numeroDocumento')}
                  />
                </Field>
              </div>
            </div>

            {/* Datos Impositivos */}
            <div className="space-y-4">
              <SectionHeader
                title="Datos Impositivos"
                action={
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={facturaFiscal}
                      onChange={(e) => {
                        setFacturaFiscal(e.target.checked);
                        if (!e.target.checked)
                          setForm((f) => ({ ...f, razonSocial: '', condicionIva: '' }));
                      }}
                      className="h-3.5 w-3.5 cursor-pointer accent-[#175861]"
                    />
                    <span className="text-xs text-gray-500">Emite comprobante fiscal</span>
                  </label>
                }
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Razón social">
                  <input
                    className={inputCls}
                    placeholder="Razón social"
                    value={form.razonSocial}
                    onChange={set('razonSocial')}
                    disabled={!facturaFiscal}
                  />
                </Field>
                <Field label="Condición frente IVA">
                  <select
                    className={inputCls}
                    value={form.condicionIva}
                    onChange={set('condicionIva')}
                    disabled={!facturaFiscal}
                  >
                    <option value="">Seleccione...</option>
                    {CONDICION_IVA_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            {/* Datos de Embarcación */}
            <div className="space-y-4">
              <SectionHeader title="Datos de Embarcación" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nombre de embarcación">
                  <input
                    className={inputCls}
                    placeholder="Sirena"
                    value={form.embarcacionNombre}
                    onChange={set('embarcacionNombre')}
                  />
                </Field>
                <Field label="Matrícula">
                  <input
                    className={inputCls}
                    placeholder="BA-1234"
                    value={form.matricula}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, matricula: e.target.value.toUpperCase() }))
                    }
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Astillero">
                    <select
                      className={inputCls}
                      value={astilleroSel}
                      onChange={(e) => {
                        setAstilleroSel(e.target.value);
                        if (e.target.value !== 'Otro') {
                          setForm((f) => ({ ...f, astillero: e.target.value }));
                        } else {
                          setForm((f) => ({ ...f, astillero: '' }));
                        }
                      }}
                    >
                      <option value="">Seleccione...</option>
                      {ASTILLEROS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                      <option value="Otro">Otro</option>
                    </select>
                    {astilleroSel === 'Otro' && (
                      <input
                        className={`${inputCls} mt-2`}
                        placeholder="Nombre del astillero"
                        value={form.astillero}
                        onChange={set('astillero')}
                      />
                    )}
                  </Field>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Modelo">
                  <input
                    className={inputCls}
                    placeholder="Crucero 35'"
                    value={form.modelo}
                    onChange={set('modelo')}
                  />
                </Field>
                <Field label="Eslora">
                  <div className="flex gap-2">
                    <input
                      className={inputCls}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={esloraUnidad === 'm' ? 'ej: 9.50' : 'ej: 31.2'}
                      value={form.esloraM}
                      onChange={set('esloraM')}
                    />
                    <div className="flex shrink-0 overflow-hidden rounded-[10px] border border-gray-200">
                      <button
                        type="button"
                        onClick={() => switchEsloraUnidad('m')}
                        className={`px-3 text-xs font-semibold transition ${
                          esloraUnidad === 'm'
                            ? 'bg-[#175861] text-white'
                            : 'bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        m
                      </button>
                      <button
                        type="button"
                        onClick={() => switchEsloraUnidad('ft')}
                        className={`px-3 text-xs font-semibold transition ${
                          esloraUnidad === 'ft'
                            ? 'bg-[#175861] text-white'
                            : 'bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        ft
                      </button>
                    </div>
                  </div>
                </Field>
              </div>
            </div>

            {/* Adjuntos */}
            <div className="space-y-4">
              <SectionHeader title="Adjuntos" />

              <label className="flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-[#175861] hover:text-[#175861]">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  <span>Seleccionar documentos</span>
                </div>
                <span className="text-xs text-gray-400">
                  PDF, Word, Excel, imágenes — varios archivos
                </span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>

              {adjuntos.length > 0 && (
                <div className="space-y-2">
                  {adjuntos.map((a, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-[8px] border border-gray-200 bg-gray-50 px-3 py-2"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-[#669E9D]" />
                      <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                        {a.file.name}
                      </span>
                      <select
                        className="h-8 rounded-[6px] border border-gray-200 bg-white px-2 text-xs text-[#101828] focus:border-[#175861] focus:outline-none"
                        value={a.tipo}
                        onChange={(e) =>
                          updateAdjunto(idx, { tipo: e.target.value as TipoDocAdjunto })
                        }
                      >
                        {TIPO_DOC_ADJUNTO_OPTS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeAdjunto(idx)}
                        title="Quitar"
                        className="rounded-[6px] p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {uploadProgress && <p className="text-sm text-[#669E9D]">{uploadProgress}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6">
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending || !isValid}
              className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: '#175861' }}
            >
              {isPending ? 'Guardando...' : 'Guardar socio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main client component ───────────────────────────────────────────────────

type Tab = 'socios' | 'invitados';

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  dir: SortDir;
  onClick: () => void;
  align?: 'left' | 'center' | 'right';
}) {
  const isActive = activeKey === sortKey;
  const alignCls =
    align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start';
  return (
    <th
      className={`px-4 py-3 ${
        align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${alignCls} text-xs font-semibold tracking-wide uppercase transition hover:text-[#175861] ${
          isActive ? 'text-[#175861]' : 'text-gray-500'
        }`}
      >
        {label}
        {isActive ? (
          dir === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

export function UsuariosClient({
  socios,
  initialFiltro = null,
}: {
  socios: Socio[];
  initialFiltro?: FiltroSocios | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importEmbModalOpen, setImportEmbModalOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filtro, setFiltro] = useState<FiltroSocios | null>(initialFiltro);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFiltro() {
    setFiltro(null);
    router.replace('/usuarios');
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Default por columna: deuda arranca descendente (más deudor primero),
      // el resto ascendente alfabético.
      setSortDir(key === 'deuda' ? 'desc' : 'asc');
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = q
      ? socios.filter((s) => {
          const nombre = `${s.nombre ?? ''} ${s.apellido ?? ''}`.toLowerCase();
          return nombre.includes(q) || s.email.toLowerCase().includes(q);
        })
      : socios.slice();

    if (filtro === 'morosos') {
      base = base.filter((s) => s.estadoSocio === 'moroso');
    } else if (filtro === 'docs-incompletas') {
      base = base.filter((s) => !s.docsCompletos);
    }

    if (!sortKey) return base;

    const cmp = (a: Socio, b: Socio): number => {
      if (sortKey === 'numero') {
        const aNum = a.numeroSocio ?? Infinity;
        const bNum = b.numeroSocio ?? Infinity;
        return aNum - bNum;
      }
      if (sortKey === 'deuda') {
        return parseFloat(a.deuda ?? '0') - parseFloat(b.deuda ?? '0');
      }
      const aStr =
        sortKey === 'socio'
          ? `${a.nombre ?? ''} ${a.apellido ?? ''}`.trim().toLowerCase() || a.email.toLowerCase()
          : sortKey === 'embarcacion'
            ? (a.embarcacion ?? '').toLowerCase()
            : (a.ubicacion ?? '').toLowerCase();
      const bStr =
        sortKey === 'socio'
          ? `${b.nombre ?? ''} ${b.apellido ?? ''}`.trim().toLowerCase() || b.email.toLowerCase()
          : sortKey === 'embarcacion'
            ? (b.embarcacion ?? '').toLowerCase()
            : (b.ubicacion ?? '').toLowerCase();
      // Filas con valor vacío siempre al final, sin importar la dirección.
      if (aStr === '' && bStr !== '') return 1;
      if (bStr === '' && aStr !== '') return -1;
      return aStr.localeCompare(bStr, 'es');
    };

    base.sort((a, b) => {
      const result = cmp(a, b);
      return sortDir === 'asc' ? result : -result;
    });
    return base;
  }, [socios, search, sortKey, sortDir, filtro]);

  return (
    <>
      <CrearSocioModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <ImportSociosModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
      <ImportEmbarcacionesModal
        open={importEmbModalOpen}
        onClose={() => setImportEmbModalOpen(false)}
      />

      <div className="p-4 md:p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="page-title">Socios</h1>
          <p className="page-subtitle mt-1">Gestiona socios del club</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white">
          {/* Search + button */}
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o email..."
                className="h-10 w-full rounded-[10px] border border-gray-200 bg-white pr-4 pl-10 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
              />
            </div>
            <button
              onClick={() => setImportModalOpen(true)}
              className="flex shrink-0 items-center justify-center gap-2 rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <Upload className="h-4 w-4" />
              Importar socios
            </button>
            <button
              onClick={() => setImportEmbModalOpen(true)}
              className="flex shrink-0 items-center justify-center gap-2 rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <Upload className="h-4 w-4" />
              Importar embarcaciones
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="flex shrink-0 items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#175861' }}
            >
              <Plus className="h-4 w-4" />
              Agregar socio
            </button>
          </div>

          {filtro && (
            <div className="flex items-center gap-2 border-b border-gray-100 bg-[#F9FAFB] px-4 py-2.5 text-xs">
              <span className="text-gray-500">Filtrando:</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#175861] px-3 py-1 font-medium text-white">
                {FILTRO_LABEL[filtro]}
                <button
                  type="button"
                  onClick={clearFiltro}
                  aria-label="Quitar filtro"
                  className="rounded-full p-0.5 transition hover:bg-white/15"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}

          {/* Table */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="h-7 w-7 opacity-40" />}
              text={
                search
                  ? 'No se encontraron socios con ese criterio.'
                  : 'No hay socios cargados aún.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                    <th className="w-10 px-4 py-3" />
                    <SortableTh
                      label="#"
                      sortKey="numero"
                      activeKey={sortKey}
                      dir={sortDir}
                      onClick={() => toggleSort('numero')}
                      align="center"
                    />
                    <SortableTh
                      label="Nombre"
                      sortKey="socio"
                      activeKey={sortKey}
                      dir={sortDir}
                      onClick={() => toggleSort('socio')}
                    />
                    <SortableTh
                      label="Embarcación"
                      sortKey="embarcacion"
                      activeKey={sortKey}
                      dir={sortDir}
                      onClick={() => toggleSort('embarcacion')}
                    />
                    <SortableTh
                      label="Ubicación"
                      sortKey="ubicacion"
                      activeKey={sortKey}
                      dir={sortDir}
                      onClick={() => toggleSort('ubicacion')}
                    />
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-center">Ingreso</th>
                    <SortableTh
                      label="Saldo"
                      sortKey="deuda"
                      activeKey={sortKey}
                      dir={sortDir}
                      onClick={() => toggleSort('deuda')}
                      align="center"
                    />
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const nombre = [s.nombre, s.apellido].filter(Boolean).join(' ') || '—';
                    const deuda = parseFloat(s.deuda ?? '0');
                    const isExpanded = expandedIds.has(s.profileId);
                    return (
                      <Fragment key={s.membresiaId}>
                        <tr
                          className={`cursor-pointer border-t border-gray-100 transition hover:bg-gray-50/80 ${
                            isExpanded ? 'bg-gray-50/40' : ''
                          }`}
                          onClick={() => router.push(`/usuarios/${s.profileId}`)}
                        >
                          <td className="w-10 px-4 py-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(s.profileId);
                              }}
                              title={isExpanded ? 'Ocultar detalle' : 'Ver invitados y accesos'}
                              className="text-gray-400 transition hover:text-[#175861]"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                          <td className="w-14 px-4 py-3 text-center text-xs font-medium text-gray-400">
                            {s.numeroSocio != null ? `#${s.numeroSocio}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium" style={{ color: '#175861' }}>
                                {nombre}
                              </p>
                              {s.datosIncompletos && (
                                <span title="Datos incompletos" className="shrink-0">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                                </span>
                              )}
                            </div>
                            <p className="text-xs" style={{ color: '#669E9D' }}>
                              {s.email}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{s.embarcacion ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500">{s.ubicacion ?? '—'}</td>
                          <td className="px-4 py-3 text-center">
                            {s.membershipStatus === 'suspended' ? (
                              <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                                Pausado
                              </span>
                            ) : s.membershipStatus === 'inactivo' ? (
                              <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                                Inactivo
                              </span>
                            ) : s.estadoSocio === 'moroso' ? (
                              <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                                Moroso
                              </span>
                            ) : (
                              <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                                Activo
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-gray-400">
                            {s.fechaIngreso ? formatArgentinaDate(s.fechaIngreso) : '—'}
                          </td>
                          <td
                            className="px-4 py-3 text-center font-medium"
                            style={{ color: '#669E9D' }}
                          >
                            ${deuda.toLocaleString('es-AR')}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-3">
                              <a
                                href={`mailto:${s.email}`}
                                title={`Enviar email a ${s.email}`}
                                aria-label={`Enviar email a ${nombre}`}
                                className="text-gray-400 transition hover:text-[#175861]"
                              >
                                <Mail className="h-4 w-4" />
                              </a>
                              {(() => {
                                const wa = buildWhatsappUrl(s.telefono);
                                return wa ? (
                                  <a
                                    href={wa}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`WhatsApp ${s.telefono}`}
                                    aria-label={`Enviar WhatsApp a ${nombre}`}
                                    className="text-gray-400 transition hover:text-[#25D366]"
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                  </a>
                                ) : (
                                  <span
                                    title="Sin teléfono cargado"
                                    className="text-gray-200"
                                    aria-hidden
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                  </span>
                                );
                              })()}
                              <Link
                                href={`/usuarios/${s.profileId}`}
                                className="inline-flex items-center gap-1.5 text-xs font-medium transition hover:opacity-70"
                                style={{ color: '#669E9D' }}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Ver
                              </Link>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="border-t border-gray-100 bg-gray-50/60">
                            <td colSpan={8} className="px-6 pt-3 pb-4">
                              <div className="flex flex-col gap-0">
                                {/* Invitados autorizados */}
                                <div className="pb-4">
                                  <p className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
                                    Invitados autorizados
                                  </p>
                                  {s.invitados.length === 0 ? (
                                    <p className="text-xs text-gray-400">
                                      Sin invitados registrados
                                    </p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {s.invitados.map((inv) => (
                                        <div key={inv.id} className="flex items-center gap-2">
                                          <span className="text-xs text-gray-700">
                                            {[inv.nombre, inv.apellido].filter(Boolean).join(' ')}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="border-t border-gray-200 pt-4">
                                  <p className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
                                    Accesos externos recientes
                                  </p>
                                  {s.accesosExternos.length === 0 ? (
                                    <p className="text-xs text-gray-400">Sin accesos registrados</p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {s.accesosExternos.map((acc) => (
                                        <div key={acc.id} className="flex items-center gap-2">
                                          <span className="text-xs text-gray-700">
                                            {acc.nombre ?? '—'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
