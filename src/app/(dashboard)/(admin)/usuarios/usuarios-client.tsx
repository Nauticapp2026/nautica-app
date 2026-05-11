'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, FileText, Package, Paperclip, Plus, Search, UserPlus, Users, X } from 'lucide-react';
import { createSocioAction, uploadSocioDocumentoAction } from '@/app/actions/socios';
import { EmptyState } from '@/components/shared/empty-state';

// ─── Types ───────────────────────────────────────────────────────────────────

type Socio = {
  membresiaId: string;
  profileId: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
  direccion: string | null;
  deuda: string | null;
  estadoSocio: 'activo' | 'moroso' | null;
  embarcacion: string | null;
};

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
  modelo: '',
  seguro: '',
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

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-gray-100 pb-2">
      <p className="text-sm font-bold" style={{ color: '#101828' }}>
        {title}
      </p>
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
  const [adjuntos, setAdjuntos] = useState<AdjuntoInput[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isValid = Boolean(
    form.nombre.trim() &&
    form.apellido.trim() &&
    form.email.trim() &&
    form.telefono.trim() &&
    form.direccion.trim(),
  );

  const set =
    (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleClose() {
    setForm(EMPTY_FORM);
    setAdjuntos([]);
    setUploadProgress(null);
    setError(null);
    onClose();
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
      const res = await createSocioAction(form);
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
            </div>

            {/* Datos de facturación */}
            <div className="space-y-4">
              <SectionHeader title="Datos de facturación" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Tipo Documento">
                  <select
                    className={inputCls}
                    value={form.tipoDocumento}
                    onChange={set('tipoDocumento')}
                  >
                    <option value="">Seleccione una opción</option>
                    {TIPO_DOC_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Número">
                  <input
                    className={inputCls}
                    placeholder="32434..."
                    value={form.numeroDocumento}
                    onChange={set('numeroDocumento')}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Razón social">
                  <input
                    className={inputCls}
                    placeholder="Razón social"
                    value={form.razonSocial}
                    onChange={set('razonSocial')}
                  />
                </Field>
                <Field label="Condición frente IVA">
                  <select
                    className={inputCls}
                    value={form.condicionIva}
                    onChange={set('condicionIva')}
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
                <Field label="Modelo">
                  <input
                    className={inputCls}
                    placeholder="Crucero 35'"
                    value={form.modelo}
                    onChange={set('modelo')}
                  />
                </Field>
                <Field label="Seguro">
                  <input
                    className={inputCls}
                    placeholder="Seguro"
                    value={form.seguro}
                    onChange={set('seguro')}
                  />
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
                <span className="text-xs text-gray-400">PDF, imágenes — varios archivos</span>
                <input
                  type="file"
                  multiple
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
            {error && <p className="text-sm text-red-600">{error}</p>}
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

type Tab = 'socios' | 'invitados' | 'proveedores';

export function UsuariosClient({ socios }: { socios: Socio[] }) {
  const [activeTab, setActiveTab] = useState<Tab>('socios');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return socios;
    const q = search.toLowerCase();
    return socios.filter((s) => {
      const nombre = `${s.nombre ?? ''} ${s.apellido ?? ''}`.toLowerCase();
      return nombre.includes(q) || s.email.toLowerCase().includes(q);
    });
  }, [socios, search]);

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'socios', label: 'Socios', icon: <Users className="h-4 w-4" /> },
    { id: 'invitados', label: 'Invitados', icon: <UserPlus className="h-4 w-4" /> },
    { id: 'proveedores', label: 'Proveedores', icon: <Package className="h-4 w-4" /> },
  ];

  return (
    <>
      <CrearSocioModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <div className="p-4 md:p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="page-title">Usuarios</h1>
          <p className="page-subtitle mt-1">Gestiona socios, invitados y proveedores</p>
        </div>

        {/* Tabs */}
        <div className="-mx-4 mb-6 overflow-x-auto border-b border-gray-200 md:mx-0">
          <div className="flex min-w-max px-4 whitespace-nowrap md:px-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex shrink-0 items-center gap-2 px-4 pb-3 text-sm font-medium transition ${
                  activeTab === t.id
                    ? 'border-b-2 border-[#175861] text-[#175861]'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {activeTab === 'socios' && (
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
                onClick={() => setModalOpen(true)}
                className="flex shrink-0 items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ background: '#175861' }}
              >
                <Plus className="h-4 w-4" />
                Agregar socio
              </button>
            </div>

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
                      <th className="px-4 py-3">Socio</th>
                      <th className="px-4 py-3">Embarcación</th>
                      <th className="px-4 py-3">Ubicación</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-center">Deuda</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s, i) => {
                      const nombre = [s.nombre, s.apellido].filter(Boolean).join(' ') || '—';
                      const deuda = parseFloat(s.deuda ?? '0');
                      return (
                        <tr
                          key={s.membresiaId}
                          className={`border-t border-gray-100 transition hover:bg-gray-50/50 ${
                            i === filtered.length - 1 ? '' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium" style={{ color: '#175861' }}>
                              {nombre}
                            </p>
                            <p className="text-xs" style={{ color: '#669E9D' }}>
                              {s.email}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{s.embarcacion ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500">{s.direccion ?? '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                                s.estadoSocio === 'moroso'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {s.estadoSocio === 'moroso' ? 'Moroso' : 'Activo'}
                            </span>
                          </td>
                          <td
                            className="px-4 py-3 text-center font-medium"
                            style={{ color: '#669E9D' }}
                          >
                            ${deuda.toLocaleString('es-AR')}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/usuarios/${s.profileId}`}
                              className="inline-flex items-center gap-1.5 text-xs font-medium transition hover:opacity-70"
                              style={{ color: '#669E9D' }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Ver
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'invitados' && (
          <div className="rounded-2xl border border-gray-200 bg-white">
            <EmptyState
              icon={<UserPlus className="h-7 w-7 opacity-40" />}
              text="No hay invitados cargados aún."
            />
          </div>
        )}

        {activeTab === 'proveedores' && (
          <div className="rounded-2xl border border-gray-200 bg-white">
            <EmptyState
              icon={<Package className="h-7 w-7 opacity-40" />}
              text="No hay proveedores cargados aún."
            />
          </div>
        )}
      </div>
    </>
  );
}
