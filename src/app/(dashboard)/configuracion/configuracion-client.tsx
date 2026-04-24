'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Building2, FilterX, Minus, Plus, Receipt, Users, X } from 'lucide-react';

import {
  createMiembroEquipoAction,
  updateGuarderiaGeneralAction,
  type CreateMiembroEquipoData,
  type HorarioInput,
  type UpdateGuarderiaGeneralData,
} from '@/app/actions/configuracion';

type TabKey = 'info' | 'equipo' | 'punto_venta' | 'notificaciones';

const TABS: { key: TabKey; label: string; icon: typeof Bell }[] = [
  { key: 'info', label: 'Información general', icon: Receipt },
  { key: 'equipo', label: 'Equipo', icon: Users },
  { key: 'punto_venta', label: 'Punto de venta', icon: Building2 },
  { key: 'notificaciones', label: 'Notificaciones', icon: Bell },
];

const TIPO_OPTS = [
  { value: 'club_nautico', label: 'Club Náutico' },
  { value: 'marina_privada', label: 'Marina Privada' },
  { value: 'guarderia_nautica', label: 'Guardería Náutica' },
  { value: 'puerto_deportivo', label: 'Puerto Deportivo' },
  { value: 'otro', label: 'Otro' },
] as const;

const DIAS_LABELS: Record<HorarioInput['dia'], string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

export type InfoGeneralData = UpdateGuarderiaGeneralData;

export type Rol = CreateMiembroEquipoData['rol'];

export type MiembroEquipo = {
  profileId: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
  telefono: string | null;
  rol: Rol;
  estadoMiembro: 'activo' | 'inactivo' | null;
};

const ROL_LABELS: Record<Rol, string> = {
  super_admin: 'Super Admin',
  administrador_general: 'Administrador general',
  operario: 'Operario',
  contable: 'Contable',
  mantenimiento: 'Mantenimiento',
  comunicaciones: 'Comunicaciones',
  restaurantes: 'Restaurantes',
  socio: 'Socio',
  invitado: 'Invitado',
  proveedor: 'Proveedor',
};

const ROL_OPTS = Object.entries(ROL_LABELS).map(([value, label]) => ({
  value: value as Rol,
  label,
}));

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

export function ConfiguracionClient({
  infoGeneral,
  miembros,
}: {
  infoGeneral: InfoGeneralData;
  miembros: MiembroEquipo[];
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('info');

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#101828' }}>
          Configuración
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#669E9D' }}>
          Administra la configuración de tu guardería náutica
        </p>
      </header>

      <div className="mb-6 flex items-center gap-2 border-b border-gray-200">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors ${
                isActive
                  ? 'border-[#175861] font-semibold text-[#175861]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === 'info' && <InfoGeneralForm initial={infoGeneral} />}
      {activeTab === 'equipo' && <EquipoTab miembros={miembros} />}
      {activeTab === 'punto_venta' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-8">
          <TabPlaceholder title="Punto de venta" />
        </section>
      )}
      {activeTab === 'notificaciones' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-8">
          <TabPlaceholder title="Notificaciones" />
        </section>
      )}
    </div>
  );
}

function InfoGeneralForm({ initial }: { initial: InfoGeneralData }) {
  const [data, setData] = useState<InfoGeneralData>(initial);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const onField = <K extends keyof InfoGeneralData>(key: K, value: InfoGeneralData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
    setFeedback(null);
  };

  const onHorario = (
    dia: HorarioInput['dia'],
    patch: Partial<Pick<HorarioInput, 'horarios' | 'cerrado'>>,
  ) => {
    setData((prev) => ({
      ...prev,
      horarios: prev.horarios.map((h) => (h.dia === dia ? { ...h, ...patch } : h)),
    }));
    setFeedback(null);
  };

  const onSubmit = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateGuarderiaGeneralAction(data);
      if (res.error) setFeedback({ type: 'error', msg: res.error });
      else setFeedback({ type: 'success', msg: 'Cambios guardados.' });
    });
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-8">
      <h2 className="mb-6 text-base font-bold" style={{ color: '#101828' }}>
        Datos de la Guardería
      </h2>

      <div className="space-y-4">
        <Field label="Nombre del club / guardería" required>
          <input
            className={inputCls}
            value={data.nombre}
            onChange={(e) => onField('nombre', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="CUIT" required>
            <input
              className={inputCls}
              value={data.cuit}
              onChange={(e) => onField('cuit', e.target.value)}
            />
          </Field>
          <Field label="Tipo de establecimiento" required>
            <select
              className={inputCls}
              value={data.tipo}
              onChange={(e) => onField('tipo', e.target.value as InfoGeneralData['tipo'])}
            >
              {TIPO_OPTS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Dirección" required>
          <input
            className={inputCls}
            value={data.direccion}
            onChange={(e) => onField('direccion', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Ciudad" required>
            <input
              className={inputCls}
              value={data.ciudad}
              onChange={(e) => onField('ciudad', e.target.value)}
            />
          </Field>
          <Field label="Provincia" required>
            <input
              className={inputCls}
              value={data.provincia}
              onChange={(e) => onField('provincia', e.target.value)}
            />
          </Field>
          <Field label="Código Postal" required>
            <input
              className={inputCls}
              value={data.codigoPostal}
              onChange={(e) => onField('codigoPostal', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Teléfono operativo" required>
            <input
              className={inputCls}
              value={data.telefono}
              onChange={(e) => onField('telefono', e.target.value)}
            />
          </Field>
          <Field label="Email operativo" required>
            <input
              className={inputCls}
              type="email"
              value={data.email}
              onChange={(e) => onField('email', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
          {data.horarios.map((h) => (
            <div key={h.dia}>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                {DIAS_LABELS[h.dia]}
              </label>
              <div className="flex items-center gap-2">
                <input
                  className={`${inputCls} ${h.cerrado ? 'bg-gray-50 text-gray-400' : ''}`}
                  placeholder="09:00 - 18:00"
                  value={h.horarios ?? ''}
                  disabled={h.cerrado}
                  onChange={(e) => onHorario(h.dia, { horarios: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => onHorario(h.dia, { cerrado: !h.cerrado })}
                  title={h.cerrado ? 'Marcar como abierto' : 'Marcar como cerrado'}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border transition-colors ${
                    h.cerrado
                      ? 'border-gray-300 bg-gray-100 text-gray-500'
                      : 'border-gray-200 bg-white text-[#669E9D] hover:bg-gray-50'
                  }`}
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {feedback && (
          <p className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
            {feedback.msg}
          </p>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="rounded-[10px] bg-[#175861] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </section>
  );
}

function EquipoTab({ miembros }: { miembros: MiembroEquipo[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [filterNombre, setFilterNombre] = useState('');
  const [filterEmail, setFilterEmail] = useState('');
  const [filterRol, setFilterRol] = useState<'' | Rol>('');

  const filtered = useMemo(() => {
    const nq = filterNombre.trim().toLowerCase();
    const eq = filterEmail.trim().toLowerCase();
    return miembros.filter((m) => {
      const fullName = `${m.nombre ?? ''} ${m.apellido ?? ''}`.toLowerCase();
      if (nq && !fullName.includes(nq)) return false;
      if (eq && !m.email.toLowerCase().includes(eq)) return false;
      if (filterRol && m.rol !== filterRol) return false;
      return true;
    });
  }, [miembros, filterNombre, filterEmail, filterRol]);

  const clearFilters = () => {
    setFilterNombre('');
    setFilterEmail('');
    setFilterRol('');
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold" style={{ color: '#101828' }}>
            Gestión de Equipo
          </h2>
          <p className="mt-1 text-sm" style={{ color: '#669E9D' }}>
            Administra los miembros de tu equipo y sus roles
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249]"
        >
          <Plus className="h-4 w-4" />
          Agregar miembro
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <input
          className={inputCls}
          placeholder="Buscar por nombre"
          value={filterNombre}
          onChange={(e) => setFilterNombre(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Buscar por email"
          value={filterEmail}
          onChange={(e) => setFilterEmail(e.target.value)}
        />
        <select
          className={inputCls}
          value={filterRol}
          onChange={(e) => setFilterRol(e.target.value as '' | Rol)}
        >
          <option value="">Buscar por rol</option>
          {ROL_OPTS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={clearFilters}
          title="Limpiar filtros"
          className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <FilterX className="h-4 w-4" />
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          {miembros.length === 0
            ? 'Aún no hay miembros en el equipo.'
            : 'Sin resultados con los filtros actuales.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => (
            <MiembroCard key={m.profileId} m={m} />
          ))}
        </div>
      )}

      <AltaEquipoModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}

const AVATAR_COLORS = ['#F97066', '#2E90FA', '#F38744', '#7A5AF8', '#15B79E', '#EE46BC'];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function MiembroCard({ m }: { m: MiembroEquipo }) {
  const fullName =
    `${m.nombre ?? ''} ${m.apellido ?? ''}`.trim() || m.email.split('@')[0] || m.email;
  const initial = (m.nombre?.[0] ?? m.email[0] ?? '?').toUpperCase();
  const isActive = m.estadoMiembro === 'activo';

  return (
    <div className="rounded-[14px] border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: avatarColor(m.profileId) }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold" style={{ color: '#101828' }}>
                {fullName}
              </p>
              <p className="text-xs" style={{ color: '#669E9D' }}>
                {ROL_LABELS[m.rol]}
              </p>
            </div>
            {isActive && (
              <span className="shrink-0 rounded-full bg-[#ECFDF3] px-2 py-0.5 text-xs font-semibold text-[#027A48]">
                Activo
              </span>
            )}
          </div>
          <p className="mt-2 truncate text-xs text-gray-500">✉ {m.email}</p>
          {m.telefono && <p className="mt-1 truncate text-xs text-gray-500">☎ {m.telefono}</p>}
        </div>
      </div>
    </div>
  );
}

const EMPTY_MIEMBRO_FORM: CreateMiembroEquipoData = {
  nombre: '',
  apellido: '',
  email: '',
  rol: 'socio',
  dni: '',
  telefono: '',
  sede: '',
};

function AltaEquipoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<CreateMiembroEquipoData>(EMPTY_MIEMBRO_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof CreateMiembroEquipoData>(
    key: K,
    value: CreateMiembroEquipoData[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleClose = () => {
    setForm(EMPTY_MIEMBRO_FORM);
    setError(null);
    onClose();
  };

  const handleSubmit = () => {
    if (!form.nombre.trim() || !form.apellido.trim() || !form.email.trim()) {
      setError('Completá nombre, apellido y email.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createMiembroEquipoAction(form);
      if (res.error) setError(res.error);
      else {
        handleClose();
        router.refresh();
      }
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Alta de Equipo
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Completá los datos del nuevo miembro
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

        <div className="max-h-[65vh] overflow-y-auto p-6">
          <p className="mb-4 text-sm font-bold" style={{ color: '#101828' }}>
            Datos Personales
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" required>
                <input
                  className={inputCls}
                  placeholder="Nombre"
                  value={form.nombre}
                  onChange={(e) => set('nombre', e.target.value)}
                />
              </Field>
              <Field label="Apellido" required>
                <input
                  className={inputCls}
                  placeholder="Apellido"
                  value={form.apellido}
                  onChange={(e) => set('apellido', e.target.value)}
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
                  onChange={(e) => set('email', e.target.value)}
                />
              </Field>
              <Field label="Rol" required>
                <select
                  className={inputCls}
                  value={form.rol}
                  onChange={(e) => set('rol', e.target.value as Rol)}
                >
                  {ROL_OPTS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="DNI">
                <input
                  className={inputCls}
                  placeholder="32434..."
                  value={form.dni}
                  onChange={(e) => set('dni', e.target.value)}
                />
              </Field>
              <Field label="Teléfono">
                <input
                  className={inputCls}
                  placeholder="+54 11..."
                  value={form.telefono}
                  onChange={(e) => set('telefono', e.target.value)}
                />
              </Field>
            </div>
            <Field label="Sede">
              <input
                className={inputCls}
                placeholder="Sede principal"
                value={form.sede}
                onChange={(e) => set('sede', e.target.value)}
              />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
          <button
            type="button"
            onClick={handleClose}
            disabled={pending}
            className="rounded-[10px] border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
          >
            {pending ? 'Guardando…' : 'Guardar miembro'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    <div>
      <label className="mb-1 block text-sm font-semibold text-gray-700">
        {label}
        {required && '*'}
      </label>
      {children}
    </div>
  );
}

function TabPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h2 className="text-lg font-semibold" style={{ color: '#101828' }}>
        {title}
      </h2>
      <p className="mt-2 text-sm text-gray-500">Próximamente</p>
    </div>
  );
}
