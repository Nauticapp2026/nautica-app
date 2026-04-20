'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, UserPlus, Package, Plus, Eye, Search, X } from 'lucide-react';
import { createSocioAction } from '@/app/actions/socios';

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
  { value: 'consumidor_final', label: 'Consumidor Final' },
  { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { value: 'monotributo', label: 'Monotributista' },
  { value: 'exento', label: 'Exento' },
  { value: 'cliente_exterior', label: 'Cliente Exterior' },
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

function CrearSocioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
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
    setError(null);
    onClose();
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
      } else {
        handleClose();
        router.refresh();
      }
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
                    onChange={set('matricula')}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="flex min-h-16 cursor-pointer items-center justify-center rounded-[10px] border-2 border-dashed border-gray-300 text-sm text-gray-400 hover:border-gray-400">
                Agregue aquí los documentos
              </div>
            </div>

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

      <div className="p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: '#101828' }}>
            Usuarios
          </h1>
          <p className="mt-0.5 text-sm text-gray-400">Gestiona socios, invitados y proveedores</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 pb-3 text-sm font-medium transition ${
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

        {/* Content */}
        {activeTab === 'socios' && (
          <div className="rounded-2xl border border-gray-200 bg-white">
            {/* Search + button */}
            <div className="flex items-center gap-3 border-b border-gray-100 p-4">
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
                className="flex shrink-0 items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ background: '#175861' }}
              >
                <Plus className="h-4 w-4" />
                Agregar socio
              </button>
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                  <Users className="h-7 w-7 opacity-40" />
                </div>
                <p className="text-sm">
                  {search
                    ? 'No se encontraron socios con ese criterio.'
                    : 'No hay socios cargados aún.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
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
            )}
          </div>
        )}

        {activeTab === 'invitados' && (
          <div className="rounded-2xl border border-gray-200 bg-white">
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <UserPlus className="h-7 w-7 opacity-40" />
              </div>
              <p className="text-sm">No hay invitados cargados aún.</p>
            </div>
          </div>
        )}

        {activeTab === 'proveedores' && (
          <div className="rounded-2xl border border-gray-200 bg-white">
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <Package className="h-7 w-7 opacity-40" />
              </div>
              <p className="text-sm">No hay proveedores cargados aún.</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
