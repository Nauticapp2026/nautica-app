'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Building2,
  Check,
  CreditCard,
  Edit3,
  FilterX,
  Minus,
  Plus,
  Receipt,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  confirmarCertificadoAfipAction,
  createMiembroEquipoAction,
  deleteMiembroEquipoAction,
  savePuntoVentaAction,
  solicitarCertificadoAfipAction,
  updateGuarderiaFeaturesAction,
  updateGuarderiaGeneralAction,
  updateGuarderiaPlanAction,
  updateMiembroEquipoAction,
  uploadGuarderiaImagenAction,
  type CreateMiembroEquipoData,
  type GuarderiaFeatures,
  type HorarioInput,
  type SavePuntoVentaData,
  type UpdateGuarderiaGeneralData,
  type UpdateMiembroEquipoData,
} from '@/app/actions/configuracion';
import { EmptyState } from '@/components/shared/empty-state';
import { ImagesUploader } from '@/components/shared/images-uploader';

export type TabKey = 'info' | 'equipo' | 'plan' | 'punto_venta' | 'notificaciones';

const TABS: { key: TabKey; label: string; icon: typeof Bell }[] = [
  { key: 'info', label: 'Información general', icon: Receipt },
  { key: 'equipo', label: 'Equipo', icon: Users },
  { key: 'plan', label: 'Plan', icon: CreditCard },
  { key: 'punto_venta', label: 'Datos de facturación', icon: Building2 },
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

export type PuntoVentaData = {
  puntoDeVenta: number | null;
  razonSocial: string;
  condicionIva: SavePuntoVentaData['condicionIva'];
  rubro: string;
  fechaInicio: string; // 'YYYY-MM-DD' o ''
  certificadoAfipOk: boolean;
};

const CONDICION_IVA_OPTS: { value: SavePuntoVentaData['condicionIva']; label: string }[] = [
  { value: 'monotributo', label: 'Monotributo' },
  { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { value: 'consumidor_final', label: 'Consumidor Final' },
  { value: 'exento', label: 'Exento' },
  { value: 'cliente_exterior', label: 'Cliente Exterior' },
  { value: 'iva_no_alcanzado', label: 'IVA No Alcanzado' },
];

export type Rol = CreateMiembroEquipoData['rol'];

export type MiembroEquipo = {
  profileId: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
  telefono: string | null;
  dni: string | null;
  sede: string | null;
  rol: Rol;
  estadoMiembro: 'activo' | 'inactivo' | null;
  isSuperAdmin: boolean;
};

export type PlanSlug = 'esencial' | 'club' | 'elite';

export type PlanInfo = {
  slug: PlanSlug;
  name: string;
  rate: number;
  features: string[];
};

const PLAN_ACCENT: Record<PlanSlug, string> = {
  esencial: '#677B85',
  club: '#669E9D',
  elite: '#ABC2B3',
};

const ROL_LABELS: Record<Rol, string> = {
  super_admin: 'Super Admin',
  administrador_general: 'Admin',
  administrativo: 'Administrativo',
  operario: 'Operario',
  contable: 'Contable',
  mantenimiento: 'Mantenimiento',
  comunicaciones: 'Comunicaciones',
  restaurantes: 'Restaurantes',
  socio: 'Socio',
  invitado: 'Invitado',
  proveedor: 'Proveedor',
  seguridad: 'Portería / Seguridad',
};

const ROL_OPTS = Object.entries(ROL_LABELS).map(([value, label]) => ({
  value: value as Rol,
  label,
}));

// Roles asignables al crear un miembro del equipo desde Configuración.
// El filtro de búsqueda usa todos los roles (`ROL_OPTS`) para mostrar
// miembros legacy con otros roles, pero el alta acota a estos 4.
const ROL_OPTS_ALTA: { value: Rol; label: string }[] = [
  { value: 'administrador_general', label: ROL_LABELS.administrador_general },
  { value: 'administrativo', label: ROL_LABELS.administrativo },
  { value: 'operario', label: ROL_LABELS.operario },
  { value: 'seguridad', label: ROL_LABELS.seguridad },
];

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

export function ConfiguracionClient({
  infoGeneral,
  miembros,
  currentUserId,
  features,
  puntoVenta,
  planes,
  currentPlan,
  initialTab = 'info',
  initialAltaEquipoOpen = false,
}: {
  infoGeneral: InfoGeneralData;
  miembros: MiembroEquipo[];
  currentUserId: string;
  features: GuarderiaFeatures;
  puntoVenta: PuntoVentaData;
  planes: PlanInfo[];
  currentPlan: PlanSlug;
  initialTab?: TabKey;
  initialAltaEquipoOpen?: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Limpiar la query string después de consumirla, así un reload no reabre el modal.
  useEffect(() => {
    if (initialTab !== 'info' || initialAltaEquipoOpen) {
      router.replace('/configuracion');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 md:p-8">
      <header className="mb-6">
        <h1 className="page-title">Configuración</h1>
        <p className="page-subtitle mt-1">Administra la configuración de tu guardería náutica</p>
      </header>

      <div className="mb-6 overflow-x-auto border-b border-gray-200">
        <div className="flex min-w-max items-center gap-2 whitespace-nowrap">
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
      </div>

      {activeTab === 'info' && <InfoGeneralForm initial={infoGeneral} />}
      {activeTab === 'equipo' && (
        <EquipoTab
          miembros={miembros}
          currentUserId={currentUserId}
          initialModalOpen={initialAltaEquipoOpen}
        />
      )}
      {activeTab === 'plan' && <PlanTab planes={planes} currentPlan={currentPlan} />}
      {activeTab === 'punto_venta' && <PuntoVentaTab initial={puntoVenta} />}
      {activeTab === 'notificaciones' && <NotificacionesTab initial={features} />}
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
      if (res.error) {
        setFeedback({ type: 'error', msg: res.error });
        toast.error(res.error);
      } else {
        setFeedback({ type: 'success', msg: 'Cambios guardados.' });
        toast.success('Cambios guardados.');
      }
    });
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-8">
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

        <Field label="Día de facturación" required>
          <input
            className={inputCls}
            type="number"
            min={1}
            max={28}
            value={data.diaFacturacion}
            onChange={(e) => onField('diaFacturacion', parseInt(e.target.value, 10) || 1)}
          />
          <p className="mt-1 text-xs text-gray-500">
            Día del mes (1 a 28) en que se generan los movimientos mensuales y se emiten las
            facturas automáticas para los socios. La primera factura de cada socio se emite
            manualmente; las siguientes se generan ese día automáticamente.
          </p>
        </Field>

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

        <div className="pt-2">
          <label className="mb-2 block text-sm font-semibold text-gray-700">
            Fotos de la guardería
          </label>
          <ImagesUploader
            urls={data.imagenes}
            onChange={(next) => onField('imagenes', next)}
            upload={async (file) => {
              const fd = new FormData();
              fd.append('file', file);
              return uploadGuarderiaImagenAction(fd);
            }}
            onError={(msg) => setFeedback({ type: 'error', msg })}
          />
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

function EquipoTab({
  miembros,
  currentUserId,
  initialModalOpen = false,
}: {
  miembros: MiembroEquipo[];
  currentUserId: string;
  initialModalOpen?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(initialModalOpen);
  const [filterNombre, setFilterNombre] = useState('');
  const [filterEmail, setFilterEmail] = useState('');
  const [filterRol, setFilterRol] = useState<'' | Rol>('');
  const [editTarget, setEditTarget] = useState<MiembroEquipo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MiembroEquipo | null>(null);

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
    <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
          className="flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[#175861] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249]"
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
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-gray-200 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <FilterX className="h-4 w-4" />
          Limpiar filtros
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-7 w-7 opacity-40" />}
          text={
            miembros.length === 0
              ? 'Aún no hay miembros en el equipo.'
              : 'Sin resultados con los filtros actuales.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => (
            <MiembroCard
              key={m.profileId}
              m={m}
              canEdit={!m.isSuperAdmin}
              canDelete={m.profileId !== currentUserId && !m.isSuperAdmin}
              onEdit={() => setEditTarget(m)}
              onDelete={() => setDeleteTarget(m)}
            />
          ))}
        </div>
      )}

      <AltaEquipoModal open={modalOpen} onClose={() => setModalOpen(false)} />
      {editTarget && (
        <EditarMiembroModal
          miembro={editTarget}
          isSelf={editTarget.profileId === currentUserId}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDeleteMiembroModal miembro={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </section>
  );
}

const AVATAR_COLORS = ['#F97066', '#2E90FA', '#F38744', '#7A5AF8', '#15B79E', '#EE46BC'];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function MiembroCard({
  m,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  m: MiembroEquipo;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
      {(canEdit || canDelete) && (
        <div className="mt-3 flex justify-end gap-1 border-t border-gray-100 pt-2">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              title="Editar miembro"
              className="rounded-[8px] p-1.5 text-[#669E9D] hover:bg-gray-100"
            >
              <Edit3 className="h-4 w-4" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Eliminar miembro"
              className="rounded-[8px] p-1.5 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
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
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success('Miembro agregado.');
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  {ROL_OPTS_ALTA.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

// Roles que puede asignar el admin al editar (mismos que el alta + permitir
// dejar el rol actual del miembro tal cual aunque sea legacy).
const ROL_OPTS_EDIT = ROL_OPTS_ALTA;

function EditarMiembroModal({
  miembro,
  isSelf,
  onClose,
}: {
  miembro: MiembroEquipo;
  isSelf: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    nombre: miembro.nombre ?? '',
    apellido: miembro.apellido ?? '',
    rol: miembro.rol,
    dni: miembro.dni ?? '',
    telefono: miembro.telefono ?? '',
    sede: miembro.sede ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Si el rol actual del miembro no está en las opciones del select (ej.
  // legacy 'contable', 'comunicaciones', etc.), lo agrego al inicio así no
  // se pierde al editar.
  const rolOpts = useMemo(() => {
    const baseValues = new Set(ROL_OPTS_EDIT.map((o) => o.value));
    if (!baseValues.has(miembro.rol)) {
      return [{ value: miembro.rol, label: ROL_LABELS[miembro.rol] }, ...ROL_OPTS_EDIT];
    }
    return ROL_OPTS_EDIT;
  }, [miembro.rol]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    if (!form.nombre.trim() || !form.apellido.trim()) {
      setError('Nombre y apellido son obligatorios.');
      return;
    }
    setError(null);
    const data: UpdateMiembroEquipoData = {
      profileId: miembro.profileId,
      nombre: form.nombre,
      apellido: form.apellido,
      rol: form.rol,
      dni: form.dni,
      telefono: form.telefono,
      sede: form.sede,
    };
    startTransition(async () => {
      const res = await updateMiembroEquipoAction(data);
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success('Miembro actualizado.');
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Editar miembro
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {miembro.email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-t border-gray-200" />

        <div className="max-h-[65vh] overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre" required>
                <input
                  className={inputCls}
                  value={form.nombre}
                  onChange={(e) => set('nombre', e.target.value)}
                />
              </Field>
              <Field label="Apellido" required>
                <input
                  className={inputCls}
                  value={form.apellido}
                  onChange={(e) => set('apellido', e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Email">
                <input
                  className={`${inputCls} cursor-not-allowed bg-gray-50 text-gray-500`}
                  value={miembro.email}
                  disabled
                  readOnly
                />
              </Field>
              <Field label="Rol" required>
                <select
                  className={inputCls}
                  value={form.rol}
                  onChange={(e) => set('rol', e.target.value as Rol)}
                >
                  {rolOpts.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {isSelf && (
              <p className="text-xs text-amber-700">
                Estás editando tu propio miembro. No te podés cambiar a un rol no administrativo (te
                quedarías sin acceso al panel).
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="DNI">
                <input
                  className={inputCls}
                  value={form.dni}
                  onChange={(e) => set('dni', e.target.value)}
                />
              </Field>
              <Field label="Teléfono">
                <input
                  className={inputCls}
                  value={form.telefono}
                  onChange={(e) => set('telefono', e.target.value)}
                />
              </Field>
            </div>
            <Field label="Sede">
              <input
                className={inputCls}
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
            onClick={onClose}
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
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteMiembroModal({
  miembro,
  onClose,
}: {
  miembro: MiembroEquipo;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fullName = `${miembro.nombre ?? ''} ${miembro.apellido ?? ''}`.trim() || miembro.email;

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteMiembroEquipoAction(miembro.profileId);
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success('Miembro eliminado.');
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        <div className="p-6 pb-4">
          <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
            Eliminar miembro
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Vas a eliminar la cuenta de <span className="font-semibold">{fullName}</span> de toda la
            plataforma. Si el usuario pertenece a otros clubes, también va a perder acceso ahí. Esta
            acción no se puede deshacer.
          </p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-[10px] border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="rounded-[10px] border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
          >
            {pending ? 'Eliminando…' : 'Eliminar cuenta'}
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

const FEATURES_META: {
  key: keyof GuarderiaFeatures;
  title: string;
  desc: string;
}[] = [
  {
    key: 'activarNotificaciones',
    title: 'Activar notificaciones a socios',
    desc: 'Enviá alertas automáticas por email y SMS',
  },
  {
    key: 'activarClimaYMareas',
    title: 'Activar clima y mareas',
    desc: 'Mostrá información meteorológica en tiempo real',
  },
  {
    key: 'activarReservasOnline',
    title: 'Activar reservas online',
    desc: 'Permitir que socios reserven espacios y servicios',
  },
  {
    key: 'activarPagosOnline',
    title: 'Activar pagos online',
    desc: 'Integrá con Mercado Pago y otros medios de pago',
  },
  {
    key: 'activarMenuGastronomico',
    title: 'Activar menú gastronómico',
    desc: 'Gestioná pedidos del buffet o restaurante',
  },
];

function NotificacionesTab({ initial }: { initial: GuarderiaFeatures }) {
  const [state, setState] = useState<GuarderiaFeatures>(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (key: keyof GuarderiaFeatures) => {
    const prev = state;
    const next = { ...state, [key]: !state[key] };
    setState(next);
    setError(null);
    startTransition(async () => {
      const res = await updateGuarderiaFeaturesAction(next);
      if (res.error) {
        setState(prev);
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success('Notificación actualizada.');
      }
    });
  };

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-bold" style={{ color: '#101828' }}>
          Configuraciones Generales
        </h2>
        <p className="mt-1 text-sm" style={{ color: '#669E9D' }}>
          Activa o desactiva funcionalidades de tu guardería
        </p>
      </div>

      <div className="space-y-3">
        {FEATURES_META.map((f) => (
          <div
            key={f.key}
            className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: '#101828' }}>
                {f.title}
              </p>
              <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
                {f.desc}
              </p>
            </div>
            <Toggle checked={state[f.key]} onChange={() => toggle(f.key)} />
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-[#175861]' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function PlanTab({ planes, currentPlan }: { planes: PlanInfo[]; currentPlan: PlanSlug }) {
  const router = useRouter();
  const [confirmTarget, setConfirmTarget] = useState<PlanInfo | null>(null);
  const [pending, startTransition] = useTransition();

  const handleChange = (target: PlanInfo) => {
    if (target.slug === currentPlan) return;
    startTransition(async () => {
      const res = await updateGuarderiaPlanAction(target.slug);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Plan cambiado a ${target.name}.`);
        setConfirmTarget(null);
        router.refresh();
      }
    });
  };

  const currentName = planes.find((p) => p.slug === currentPlan)?.name ?? currentPlan;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-8">
      <div className="mb-6">
        <h2 className="text-base font-bold" style={{ color: '#101828' }}>
          Plan del club
        </h2>
        <p className="mt-1 text-sm" style={{ color: '#669E9D' }}>
          Estás en el plan <span className="font-semibold text-[#175861]">{currentName}</span>.
          Podés cambiar a otro plan en cualquier momento. Los precios son por lugar de guarda al
          mes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {planes.map((plan) => (
          <PlanCard
            key={plan.slug}
            plan={plan}
            isCurrent={plan.slug === currentPlan}
            onSelect={() => setConfirmTarget(plan)}
          />
        ))}
      </div>

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
            <div className="p-6 pb-4">
              <h3 className="text-lg font-bold" style={{ color: '#101828' }}>
                Cambiar a plan {confirmTarget.name}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Vas a cambiar tu plan a <span className="font-semibold">{confirmTarget.name}</span>{' '}
                ($
                {confirmTarget.rate.toLocaleString('es-AR')} por lugar de guarda al mes). El cambio
                se aplica de inmediato.
              </p>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={pending}
                className="rounded-[10px] border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleChange(confirmTarget)}
                disabled={pending}
                className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
              >
                {pending ? 'Cambiando…' : 'Confirmar cambio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PlanCard({
  plan,
  isCurrent,
  onSelect,
}: {
  plan: PlanInfo;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const accent = PLAN_ACCENT[plan.slug];
  const features = plan.features;

  return (
    <div
      className={`flex flex-col rounded-[14px] border bg-white p-5 ${
        isCurrent ? 'border-[#175861] ring-1 ring-[#175861]' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold tracking-wider" style={{ color: accent }}>
          {plan.name}
        </h3>
        {isCurrent && (
          <span className="rounded-full bg-[#D9EBE9] px-2 py-0.5 text-xs font-semibold text-[#175861]">
            Plan actual
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold" style={{ color: '#101828' }}>
        ${plan.rate.toLocaleString('es-AR')}
        <span className="ml-1 text-xs font-normal text-gray-500">/ lugar / mes</span>
      </p>

      <ul className="mt-4 flex-1 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSelect}
        disabled={isCurrent}
        className={`mt-5 rounded-[10px] px-4 py-2.5 text-sm font-semibold transition-colors ${
          isCurrent
            ? 'cursor-not-allowed bg-gray-100 text-gray-400'
            : 'bg-[#175861] text-white hover:bg-[#0f4249]'
        }`}
      >
        {isCurrent ? 'Tu plan actual' : `Cambiar a ${plan.name}`}
      </button>
    </div>
  );
}

function PuntoVentaTab({ initial }: { initial: PuntoVentaData }) {
  const [data, setData] = useState<PuntoVentaData>(initial);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const yaConfigurado = initial.puntoDeVenta != null;
  const readOnly = yaConfigurado;

  const onField = <K extends keyof PuntoVentaData>(key: K, value: PuntoVentaData[K]) => {
    if (readOnly) return;
    setData((prev) => ({ ...prev, [key]: value }));
    setFeedback(null);
  };

  const onSubmit = () => {
    setFeedback(null);
    if (!data.puntoDeVenta || data.puntoDeVenta <= 0) {
      setFeedback({ type: 'error', msg: 'Ingresá un número de punto de venta válido.' });
      return;
    }
    if (!data.fechaInicio) {
      setFeedback({ type: 'error', msg: 'Elegí la fecha de inicio.' });
      return;
    }
    startTransition(async () => {
      const res = await savePuntoVentaAction({
        puntoDeVenta: data.puntoDeVenta!,
        razonSocial: data.razonSocial,
        condicionIva: data.condicionIva,
        rubro: data.rubro,
        fechaInicio: data.fechaInicio,
      });
      if (res.error) setFeedback({ type: 'error', msg: res.error });
      else setFeedback({ type: 'success', msg: 'Punto de venta sincronizado con TusFacturas.' });
    });
  };

  const readOnlyCls = readOnly ? 'bg-gray-50 text-gray-500' : '';

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-8">
      <h2 className="mb-2 text-base font-bold" style={{ color: '#101828' }}>
        Datos de facturación
      </h2>

      {yaConfigurado && (
        <div className="mb-6 rounded-[10px] border border-[#CAE6E4] bg-[#ECFDF3] px-4 py-3 text-sm text-[#175861]">
          Este punto de venta ya fue creado en TusFacturas. Los datos no se pueden modificar desde
          acá.
        </div>
      )}

      {!yaConfigurado && (
        <div className="mb-6 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Antes de continuar:</strong> el número de punto de venta tiene que estar dado de
          alta previamente en AFIP (Servicios → Administrador de Relaciones → POS de Facturación
          Electrónica). Si no existe en AFIP, las facturas van a ser rechazadas al emitirlas.
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Punto de venta" required>
            <input
              className={`${inputCls} ${readOnlyCls}`}
              type="number"
              min={1}
              placeholder="1"
              value={data.puntoDeVenta ?? ''}
              disabled={readOnly}
              onChange={(e) =>
                onField('puntoDeVenta', e.target.value ? Number(e.target.value) : null)
              }
            />
          </Field>
          <Field label="Condición frente IVA" required>
            <select
              className={`${inputCls} ${readOnlyCls}`}
              value={data.condicionIva}
              disabled={readOnly}
              onChange={(e) =>
                onField('condicionIva', e.target.value as PuntoVentaData['condicionIva'])
              }
            >
              {CONDICION_IVA_OPTS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Rubro" required>
            <input
              className={`${inputCls} ${readOnlyCls}`}
              value={data.rubro}
              disabled={readOnly}
              onChange={(e) => onField('rubro', e.target.value)}
            />
          </Field>
          <Field label="Razón social" required>
            <input
              className={`${inputCls} ${readOnlyCls}`}
              value={data.razonSocial}
              disabled={readOnly}
              onChange={(e) => onField('razonSocial', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Fecha inicio" required>
          <input
            className={`${inputCls} ${readOnlyCls}`}
            type="date"
            value={data.fechaInicio}
            disabled={readOnly}
            onChange={(e) => onField('fechaInicio', e.target.value)}
          />
        </Field>

        {feedback && (
          <p className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
            {feedback.msg}
          </p>
        )}

        {!readOnly && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={pending}
              className="rounded-[10px] bg-[#175861] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Sincronizando…' : 'Guardar cambios'}
            </button>
          </div>
        )}

        {yaConfigurado && (
          <div className="mt-2 border-t border-gray-200 pt-6">
            <h3 className="mb-1 text-sm font-bold" style={{ color: '#101828' }}>
              Certificado de enlace con AFIP
            </h3>
            <CertificadoAfipSection
              ok={data.certificadoAfipOk}
              onChangeOk={(ok) => setData((prev) => ({ ...prev, certificadoAfipOk: ok }))}
              onFeedback={setFeedback}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function CertificadoAfipSection({
  ok,
  onChangeOk,
  onFeedback,
}: {
  ok: boolean;
  onChangeOk: (ok: boolean) => void;
  onFeedback: (f: { type: 'error' | 'success'; msg: string } | null) => void;
}) {
  const [pendingSolicitar, startSolicitar] = useTransition();
  const [pendingConfirmar, startConfirmar] = useTransition();

  function handleSolicitar() {
    if (
      !window.confirm(
        '¿Solicitar el certificado de enlace con AFIP? TusFacturas va a enviar las instrucciones al mail del administrador de la cuenta.',
      )
    ) {
      return;
    }
    onFeedback(null);
    startSolicitar(async () => {
      const res = await solicitarCertificadoAfipAction();
      if (res.error) {
        onFeedback({ type: 'error', msg: res.error });
        return;
      }
      onFeedback({
        type: 'success',
        msg: 'Solicitud enviada. Revisá el mail del administrador para las instrucciones.',
      });
    });
  }

  function handleConfirmar(nextOk: boolean) {
    onFeedback(null);
    startConfirmar(async () => {
      const res = await confirmarCertificadoAfipAction(nextOk);
      if (res.error) {
        onFeedback({ type: 'error', msg: res.error });
        return;
      }
      onChangeOk(nextOk);
      onFeedback({
        type: 'success',
        msg: nextOk
          ? 'Certificado marcado como instalado. Ya podés emitir facturas.'
          : 'Certificado marcado como pendiente. La emisión de facturas queda bloqueada.',
      });
    });
  }

  return (
    <>
      {ok ? (
        <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-[#CAE6E4] bg-[#ECFDF3] px-4 py-3 text-sm text-[#175861]">
          <span className="font-semibold">✓ Certificado instalado.</span>
          <span>La emisión de facturas está habilitada.</span>
        </div>
      ) : (
        <div className="mb-3 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Pendiente:</strong> hasta que el certificado esté instalado, la emisión de
          facturas (manual y automática) queda bloqueada.
        </div>
      )}

      <p className="mb-3 text-xs text-gray-500">
        Pedile a TusFacturas que genere el certificado de enlace y, una vez que sigas las
        instrucciones del mail e instales el certificado en TusFacturas/AFIP, confirmá la
        instalación con el botón de la derecha.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSolicitar}
          disabled={pendingSolicitar}
          className="rounded-[10px] border border-[#175861] bg-white px-5 py-3 text-sm font-semibold text-[#175861] transition-colors hover:bg-[#175861] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingSolicitar ? 'Solicitando…' : 'Solicitar certificado AFIP'}
        </button>

        {ok ? (
          <button
            type="button"
            onClick={() => handleConfirmar(false)}
            disabled={pendingConfirmar}
            className="rounded-[10px] border border-red-200 bg-white px-5 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingConfirmar ? 'Guardando…' : 'Marcar como pendiente'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleConfirmar(true)}
            disabled={pendingConfirmar}
            className="rounded-[10px] bg-[#175861] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingConfirmar ? 'Guardando…' : 'Confirmar instalación'}
          </button>
        )}
      </div>
    </>
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
