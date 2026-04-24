'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { Logo } from '@/components/shared/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  signUpStep,
  createGuarderiaStep,
  updateDetallesStep,
  updateFeaturesStep,
  selectPlanStep,
  inviteTeamMembersStep,
  uploadGuarderiaFotoStep,
} from '@/app/actions/onboarding';
import { Check, Trash2, Plus, ChevronRight } from 'lucide-react';

const TOTAL_STEPS = 10;

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;
const DIAS_LABELS: Record<string, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

type TeamMember = {
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  telefono: string;
  sede: string;
};

type HorarioDia = { apertura: string; cierre: string; activo: boolean };

type Data = {
  // step 1
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  password: string;
  // step 2
  guarderiaId: string;
  guarderiaName: string;
  cuit: string;
  tipo: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
  telefonoOperativo: string;
  emailOperativo: string;
  instagram: string;
  facebook: string;
  // step 3
  descripcion: string;
  horarios: Record<string, HorarioDia>;
  // step 4
  equipo: TeamMember[];
  // step 5
  cantidadNaves: string;
  cantidadPeines: string;
  // step 6
  activarNotificaciones: boolean;
  activarClimaYMareas: boolean;
  activarReservasOnline: boolean;
  activarPagosOnline: boolean;
  activarMenuGastronomico: boolean;
  // step 7
  plan: 'classic' | 'plus' | 'platinum';
};

const DEFAULT_HORARIOS: Record<string, HorarioDia> = Object.fromEntries(
  DIAS.map((d) => [d, { apertura: '09:00', cierre: '18:00', activo: true }]),
);

const PLAN_INFO = {
  classic: {
    label: 'CLASSIC',
    precio: '$29.900/mes',
    features: ['Sistema de gestión', 'Control de accesos', 'Hasta 1 sede', 'Soporte por email'],
  },
  plus: {
    label: 'PLUS',
    precio: '$59.900/mes',
    features: [
      'Todo lo de Classic',
      'Facturación electrónica',
      'Comunicaciones a socios',
      'Hasta 3 sedes',
    ],
  },
  platinum: {
    label: 'PLATINUM',
    precio: '$99.900/mes',
    features: [
      'Todo lo de Plus',
      'Módulo gastronómico',
      'API para integraciones',
      'Sedes ilimitadas',
      'Soporte prioritario 24/7',
    ],
  },
} as const;

// ─── Shell ──────────────────────────────────────────────────────────────────

function Shell({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* White header */}
      <div className="bg-white">
        <div className="flex items-center justify-between px-6 py-3">
          <Logo size={36} />
          <span className="text-xs text-gray-400">
            Paso {step} de {TOTAL_STEPS}
          </span>
        </div>
        {/* Segmented progress bar */}
        <div className="flex gap-1 px-0">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 transition-colors duration-300"
              style={{ background: i < step ? '#175861' : '#D1D5DB' }}
            />
          ))}
        </div>
      </div>

      {/* Gradient content area */}
      <div
        className="flex flex-1 items-center justify-center px-4 py-12"
        style={{
          background: 'linear-gradient(180deg, #175861 0%, #669E9D 60%, #ABC2B3 100%)',
        }}
      >
        <div className="w-full max-w-3xl rounded-2xl bg-white px-8 py-8 shadow-2xl">{children}</div>
      </div>
    </div>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col items-center gap-2 text-center">
      <Logo size={48} />
      <h1 className="mt-2 text-2xl font-bold" style={{ color: '#175861' }}>
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm" style={{ color: '#175861', opacity: 0.7 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel = 'Continuar',
  extraButton,
  pending,
  disabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  extraButton?: React.ReactNode;
  pending?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = pending || disabled;
  return (
    <div className="mt-6 flex gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-3 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
        >
          Atras
        </button>
      )}
      {extraButton}
      <button
        type="button"
        onClick={onNext}
        disabled={isDisabled}
        className="flex flex-1 items-center justify-center gap-2 rounded-[10px] py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: '#175861' }}
      >
        {nextLabel} <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function FieldGroup({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`space-y-4 ${className ?? ''}`}>{children}</div>;
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-semibold" style={{ color: '#101828' }}>
        {label}
        {required && '*'}
      </Label>
      {children}
    </div>
  );
}

const inputCls =
  'h-12 rounded-[10px] border border-gray-200 bg-white px-4 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none';

// ─── Steps ──────────────────────────────────────────────────────────────────

function Step1({
  data,
  onChange,
  onNext,
  error,
  pending,
}: {
  data: Data;
  onChange: (k: keyof Data, v: string | boolean) => void;
  onNext: () => void;
  error?: string;
  pending: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const isValid =
    !!data.nombre.trim() &&
    !!data.apellido.trim() &&
    !!data.email.trim() &&
    !!data.telefono.trim() &&
    data.password.length >= 8 &&
    accepted;

  return (
    <>
      <StepHeader
        title="Creá tu cuenta en NauticApp"
        subtitle="Comenzá a gestionar tu guardería de forma profesional"
      />
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" required>
            <Input
              className={inputCls}
              placeholder="Juan"
              value={data.nombre}
              onChange={(e) => onChange('nombre', e.target.value)}
            />
          </Field>
          <Field label="Apellido" required>
            <Input
              className={inputCls}
              placeholder="Pérez"
              value={data.apellido}
              onChange={(e) => onChange('apellido', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Email" required>
          <Input
            className={inputCls}
            type="email"
            placeholder="tu@email.com"
            value={data.email}
            onChange={(e) => onChange('email', e.target.value)}
          />
        </Field>
        <Field label="Teléfono" required>
          <Input
            className={inputCls}
            placeholder="+54 11 1234-5678"
            value={data.telefono}
            onChange={(e) => onChange('telefono', e.target.value)}
          />
        </Field>
        <Field label="Contraseña" required>
          <Input
            className={inputCls}
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={data.password}
            onChange={(e) => onChange('password', e.target.value)}
          />
        </Field>
        <div className="flex items-start gap-3">
          <Checkbox
            id="terms"
            checked={accepted}
            onCheckedChange={(v) => setAccepted(!!v)}
            className="mt-0.5"
          />
          <label htmlFor="terms" className="text-sm" style={{ color: '#101828' }}>
            Acepto los{' '}
            <span className="cursor-pointer underline" style={{ color: '#669E9D' }}>
              Términos y Condiciones
            </span>{' '}
            y la{' '}
            <span className="cursor-pointer underline" style={{ color: '#669E9D' }}>
              Política de Privacidad
            </span>
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <NavButtons onNext={onNext} pending={pending} disabled={!isValid} />
      </FieldGroup>
    </>
  );
}

function Step2({
  data,
  onChange,
  onNext,
  onBack,
  error,
  pending,
}: {
  data: Data;
  onChange: (k: keyof Data, v: string) => void;
  onNext: () => void;
  onBack: () => void;
  error?: string;
  pending: boolean;
}) {
  const isValid =
    !!data.guarderiaName.trim() &&
    !!data.cuit.trim() &&
    !!data.tipo &&
    !!data.direccion.trim() &&
    !!data.ciudad.trim() &&
    !!data.provincia.trim() &&
    !!data.codigoPostal.trim() &&
    !!data.telefonoOperativo.trim() &&
    !!data.emailOperativo.trim();

  return (
    <>
      <StepHeader
        title="Datos de tu guardería"
        subtitle={
          <>
            Configurá la <span style={{ color: '#669E9D' }}>información principal</span> de{' '}
            <span style={{ color: '#669E9D' }}>tu</span> establecimiento
          </>
        }
      />
      <FieldGroup>
        <Field label="Nombre del club / guardería" required>
          <Input
            className={inputCls}
            placeholder="Club Náutico del Sol"
            value={data.guarderiaName}
            onChange={(e) => onChange('guarderiaName', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CUIT" required>
            <Input
              className={inputCls}
              placeholder="20-12345678-9"
              value={data.cuit}
              onChange={(e) => onChange('cuit', e.target.value)}
            />
          </Field>
          <Field label="Tipo de establecimiento" required>
            <Select value={data.tipo} onValueChange={(v) => onChange('tipo', v)}>
              <SelectTrigger className={inputCls}>
                <SelectValue placeholder="Tipo de establecimiento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="club_nautico">Club Náutico</SelectItem>
                <SelectItem value="marina_privada">Marina Privada</SelectItem>
                <SelectItem value="guarderia_nautica">Guardería Náutica</SelectItem>
                <SelectItem value="puerto_deportivo">Puerto Deportivo</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Dirección" required>
          <Input
            className={inputCls}
            placeholder="Av. Costanera 1234"
            value={data.direccion}
            onChange={(e) => onChange('direccion', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Ciudad" required>
            <Input
              className={inputCls}
              placeholder="Buenos Aires"
              value={data.ciudad}
              onChange={(e) => onChange('ciudad', e.target.value)}
            />
          </Field>
          <Field label="Provincia" required>
            <Input
              className={inputCls}
              placeholder="Buenos Aires"
              value={data.provincia}
              onChange={(e) => onChange('provincia', e.target.value)}
            />
          </Field>
          <Field label="Código Postal" required>
            <Input
              className={inputCls}
              placeholder="1234"
              value={data.codigoPostal}
              onChange={(e) => onChange('codigoPostal', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono operativo" required>
            <Input
              className={inputCls}
              placeholder="+54 11 1234-5678"
              value={data.telefonoOperativo}
              onChange={(e) => onChange('telefonoOperativo', e.target.value)}
            />
          </Field>
          <Field label="Email operativo" required>
            <Input
              className={inputCls}
              type="email"
              placeholder="info@club.com"
              value={data.emailOperativo}
              onChange={(e) => onChange('emailOperativo', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Instagram">
            <Input
              className={inputCls}
              placeholder="@tuguarderia"
              value={data.instagram}
              onChange={(e) => onChange('instagram', e.target.value)}
            />
          </Field>
          <Field label="Facebook">
            <Input
              className={inputCls}
              placeholder="Tu Guardería Náutica"
              value={data.facebook}
              onChange={(e) => onChange('facebook', e.target.value)}
            />
          </Field>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <NavButtons onBack={onBack} onNext={onNext} pending={pending} disabled={!isValid} />
      </FieldGroup>
    </>
  );
}

function Step3({
  data,
  onChangeHorario,
  onChangeDesc,
  onNext,
  onBack,
}: {
  data: Data;
  onChangeHorario: (
    dia: string,
    field: 'apertura' | 'cierre' | 'activo',
    val: string | boolean,
  ) => void;
  onChangeDesc: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [fotos, setFotos] = useState<string[]>([]);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [fotosError, setFotosError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !data.guarderiaId) return;
    setFotosError(null);
    for (const f of Array.from(files)) {
      setSubiendo(f.name);
      const fd = new FormData();
      fd.append('guarderiaId', data.guarderiaId);
      fd.append('file', f);
      const res = await uploadGuarderiaFotoStep(fd);
      if (res.error) {
        setFotosError(`${f.name}: ${res.error}`);
      } else if (res.url) {
        setFotos((prev) => [...prev, res.url!]);
      }
    }
    setSubiendo(null);
  };
  const setAllTimes = () => {
    // Pedimos apertura y cierre en un prompt mínimo. Simple y sin dependencias.
    const apertura = window.prompt('Hora de apertura para todos los días (HH:MM)', '09:00');
    if (!apertura) return;
    const cierre = window.prompt('Hora de cierre para todos los días (HH:MM)', '18:00');
    if (!cierre) return;
    DIAS.forEach((d) => {
      onChangeHorario(d, 'apertura', apertura);
      onChangeHorario(d, 'cierre', cierre);
    });
  };

  return (
    <>
      <StepHeader
        title="Detalles de tu guardería"
        subtitle="Agregá descripción, horarios detallados y fotos"
      />
      <FieldGroup>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold" style={{ color: '#175861' }}>
              Horarios detallados
            </p>
            <button
              type="button"
              className="text-xs underline"
              style={{ color: '#669E9D' }}
              onClick={setAllTimes}
            >
              Cambiar todos los horarios juntos
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {DIAS.map((dia) => {
              const h = data.horarios[dia];
              return (
                <div
                  key={dia}
                  className="flex items-center gap-2 rounded-[10px] border border-gray-200 p-2"
                >
                  <span
                    className="w-20 shrink-0 text-xs font-semibold"
                    style={{ color: '#175861' }}
                  >
                    {DIAS_LABELS[dia]}
                  </span>
                  <input
                    type="time"
                    value={h.apertura}
                    disabled={!h.activo}
                    onChange={(e) => onChangeHorario(dia, 'apertura', e.target.value)}
                    className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <span className="text-xs text-gray-400">-</span>
                  <input
                    type="time"
                    value={h.cierre}
                    disabled={!h.activo}
                    onChange={(e) => onChangeHorario(dia, 'cierre', e.target.value)}
                    className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => onChangeHorario(dia, 'activo', !h.activo)}
                    title={h.activo ? 'Marcar cerrado' : 'Marcar abierto'}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold transition ${h.activo ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                  >
                    {h.activo ? 'Abierto' : 'Cerrado'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 font-semibold" style={{ color: '#175861' }}>
            Fotos de tu guardería
          </p>
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-gray-300 text-sm text-gray-500 transition hover:border-[#175861] hover:text-[#175861]">
            <span>Click para subir fotos</span>
            <span className="text-xs text-gray-400">JPG, PNG — podés elegir varias</span>
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          {subiendo && <p className="mt-1 text-xs text-[#669E9D]">Subiendo {subiendo}…</p>}
          {fotosError && <p className="mt-1 text-xs text-red-600">{fotosError}</p>}
          {fotos.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {fotos.map((url, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={idx}
                  src={url}
                  alt={`Foto ${idx + 1}`}
                  className="h-20 w-full rounded-[8px] border border-gray-200 object-cover"
                />
              ))}
            </div>
          )}
        </div>

        <Field label="Descripción de tu guardería">
          <Textarea
            placeholder="Contanos sobre tu guardería: servicios, ubicación, historia..."
            className="min-h-24 rounded-[10px] border-gray-200 text-sm"
            value={data.descripcion}
            onChange={(e) => onChangeDesc(e.target.value)}
          />
        </Field>

        <NavButtons onBack={onBack} onNext={onNext} />
      </FieldGroup>
    </>
  );
}

function Step4({
  data,
  onAddMember,
  onRemoveMember,
  onChangeMember,
  onNext,
  onBack,
  onSkip,
}: {
  data: Data;
  onAddMember: () => void;
  onRemoveMember: (i: number) => void;
  onChangeMember: (i: number, k: keyof TeamMember, v: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <StepHeader
        title="Armá tu equipo de trabajo"
        subtitle={
          <>
            Invitá a <span style={{ color: '#669E9D' }}>operarios</span>,{' '}
            <span style={{ color: '#669E9D' }}>administradores</span> y responsables
          </>
        }
      />

      {data.equipo.length === 0 ? (
        <div className="mb-4 flex flex-col items-center gap-2 rounded-2xl border border-gray-200 py-8 text-gray-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="opacity-40"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p className="text-sm">Aún no has agregado miembros al equipo</p>
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          {data.equipo.map((m, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-[10px] border border-gray-200 p-2"
            >
              <Input
                className="h-8 flex-1 rounded-[10px] border-gray-200 px-2 text-xs"
                placeholder="Nombre"
                value={m.nombre}
                onChange={(e) => onChangeMember(i, 'nombre', e.target.value)}
              />
              <Input
                className="h-8 flex-1 rounded-[10px] border-gray-200 px-2 text-xs"
                placeholder="Apellido"
                value={m.apellido}
                onChange={(e) => onChangeMember(i, 'apellido', e.target.value)}
              />
              <Input
                className="h-8 flex-1 rounded-[10px] border-gray-200 px-2 text-xs"
                placeholder="email@ej"
                value={m.email}
                onChange={(e) => onChangeMember(i, 'email', e.target.value)}
              />
              <select
                className="h-8 rounded-[10px] border border-gray-200 px-1 text-xs"
                value={m.rol}
                onChange={(e) => onChangeMember(i, 'rol', e.target.value)}
              >
                <option value="">Rol</option>
                <option value="administrador_general">Admin</option>
                <option value="operario">Operario</option>
                <option value="contable">Contable</option>
                <option value="mantenimiento">Mantenimiento</option>
              </select>
              <Input
                className="h-8 w-24 rounded-[10px] border-gray-200 px-2 text-xs"
                placeholder="+54 11..."
                value={m.telefono}
                onChange={(e) => onChangeMember(i, 'telefono', e.target.value)}
              />
              <button
                type="button"
                onClick={() => onRemoveMember(i)}
                className="rounded-[10px] p-1.5 text-red-400 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAddMember}
        className="mb-4 flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        style={{ background: '#175861' }}
      >
        <Plus className="h-4 w-4" /> Agregar miembro del equipo
      </button>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-3 text-sm font-medium text-[#364153] hover:bg-gray-50"
        >
          Atras
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 rounded-[10px] border py-3 text-sm font-medium transition hover:bg-gray-50"
          style={{ borderColor: '#669E9D', color: '#669E9D' }}
        >
          Lo configuro más tarde
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex flex-1 items-center justify-center gap-2 rounded-[10px] py-3 text-sm font-semibold text-white hover:opacity-90"
          style={{ background: '#175861' }}
        >
          Continuar <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

function Step5({
  data,
  onChange,
  onNext,
  onBack,
}: {
  data: Data;
  onChange: (k: 'cantidadNaves' | 'cantidadPeines', v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <StepHeader
        title="Configuración de espacios"
        subtitle={
          <>
            Define la estructura de <span style={{ color: '#669E9D' }}>naves</span> y peines de tu
            guardería
          </>
        }
      />
      <div className="mb-6 rounded-2xl p-5" style={{ background: '#FEF3E8' }}>
        <p className="mb-4 font-semibold" style={{ color: '#175861' }}>
          Paso 1: Cantidad de naves y peines
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="¿Cuántas naves tenés?">
            <Input
              className={inputCls}
              type="number"
              placeholder="3"
              value={data.cantidadNaves}
              onChange={(e) => onChange('cantidadNaves', e.target.value)}
            />
          </Field>
          <Field label="¿Cuántos peines tenés?">
            <Input
              className={inputCls}
              type="number"
              placeholder="2"
              value={data.cantidadPeines}
              onChange={(e) => onChange('cantidadPeines', e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            className="rounded-[10px] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: '#175861' }}
          >
            Generar naves
          </button>
          <button
            type="button"
            className="rounded-[10px] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: '#175861' }}
          >
            Generar peines
          </button>
        </div>
      </div>
      <NavButtons onBack={onBack} onNext={onNext} />
    </>
  );
}

function Step6({
  data,
  onToggle,
  onNext,
  onBack,
}: {
  data: Data;
  onToggle: (k: keyof Data, v: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const features: { key: keyof Data; label: string; desc: string }[] = [
    {
      key: 'activarNotificaciones',
      label: 'Activar notificaciones a socios',
      desc: 'Enviá alertas automáticas por email y SMS',
    },
    {
      key: 'activarClimaYMareas',
      label: 'Activar clima y mareas',
      desc: 'Mostrá información meteorológica en tiempo real',
    },
    {
      key: 'activarReservasOnline',
      label: 'Activar reservas online',
      desc: 'Permitir que socios reserven espacios y servicios',
    },
    {
      key: 'activarPagosOnline',
      label: 'Activar pagos online',
      desc: 'Integrá con Mercado Pago y otros medios de pago',
    },
    {
      key: 'activarMenuGastronomico',
      label: 'Activar menú gastronómico',
      desc: 'Gestioná pedidos del buffet o restaurante',
    },
  ];

  return (
    <>
      <StepHeader
        title="Últimos ajustes"
        subtitle={
          <>
            Configurá las <span style={{ color: '#669E9D' }}>funcionalidades</span> que necesitás
          </>
        }
      />
      <div className="mb-6 space-y-3">
        {features.map((f) => (
          <div
            key={f.key}
            className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-4"
          >
            <div>
              <p className="text-sm font-bold" style={{ color: '#175861' }}>
                {f.label}
              </p>
              <p className="text-xs" style={{ color: '#669E9D' }}>
                {f.desc}
              </p>
            </div>
            <Switch
              checked={data[f.key] as boolean}
              onCheckedChange={(v) => onToggle(f.key, v)}
              style={
                (data[f.key] as boolean)
                  ? ({ '--switch-bg': '#175861' } as React.CSSProperties)
                  : undefined
              }
            />
          </div>
        ))}
      </div>
      <NavButtons onBack={onBack} onNext={onNext} />
    </>
  );
}

function Step7({
  data,
  onSelect,
  onBack,
}: {
  data: Data;
  onSelect: (plan: 'classic' | 'plus' | 'platinum') => void;
  onBack: () => void;
}) {
  const plans = ['classic', 'plus', 'platinum'] as const;

  return (
    <>
      <StepHeader
        title="Elegí tu plan de NauticApp"
        subtitle={
          <>
            Seleccioná el plan que mejor se adapte a <span style={{ color: '#669E9D' }}>tu</span>{' '}
            guardería
          </>
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        {plans.map((p) => {
          const info = PLAN_INFO[p];
          const selected = data.plan === p;
          return (
            <div
              key={p}
              className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 transition"
              style={selected ? { boxShadow: '0 0 0 2px #175861' } : undefined}
            >
              <div
                className="px-4 py-4 text-center"
                style={{ background: selected ? '#175861' : '#9CA3AF' }}
              >
                <p className="text-sm font-bold text-white">{info.label}</p>
                <p className="mt-1 text-xs text-white/80">{info.precio}</p>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <ul className="mb-4 flex-1 space-y-2">
                  {info.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-1.5">
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        style={{ color: selected ? '#669E9D' : '#9CA3AF' }}
                      />
                      <span className="text-xs" style={{ color: selected ? '#175861' : '#9CA3AF' }}>
                        {feat}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className="w-full rounded-[10px] py-2.5 text-xs font-semibold text-white transition hover:opacity-90"
                  style={{ background: selected ? '#175861' : '#9CA3AF' }}
                >
                  Seleccionar Plan
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onBack}
        className="w-full rounded-[10px] border border-[#d1d5dc] bg-white py-3 text-sm font-medium text-[#364153] hover:bg-gray-50"
      >
        Atras
      </button>
    </>
  );
}

function Step8({ data, onNext, onBack }: { data: Data; onNext: () => void; onBack: () => void }) {
  const info = PLAN_INFO[data.plan];
  return (
    <>
      <StepHeader
        title="Información de pago"
        subtitle={
          <>
            Completá los datos para finalizar tu{' '}
            <span style={{ color: '#669E9D' }}>suscripción</span>
          </>
        }
      />
      <div className="mb-6">
        <p className="mb-3 font-semibold" style={{ color: '#175861' }}>
          Resumen del plan
        </p>
        <div
          className="flex items-center justify-between rounded-[10px] px-4 py-3"
          style={{ background: '#FEF3E8' }}
        >
          <span className="text-sm" style={{ color: '#669E9D' }}>
            {info.label}
          </span>
          <span className="font-semibold" style={{ color: '#175861' }}>
            {info.precio}
          </span>
        </div>
        <p className="mt-4 text-center text-xs text-gray-400">
          La integración de pagos estará disponible próximamente.
        </p>
      </div>
      <NavButtons onBack={onBack} onNext={onNext} />
    </>
  );
}

function Step9({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <>
      <StepHeader
        title="Agendar llamada de demo"
        subtitle="Coordiná una videollamada con nuestro equipo"
      />
      <div
        className="calendly-inline-widget mb-6 rounded-2xl border border-gray-200"
        data-url="https://calendly.com/marcosienragarre/nauticapp"
        style={{ minWidth: '320px', height: '700px' }}
      />
      <Script
        src="https://assets.calendly.com/assets/external/widget.js"
        strategy="afterInteractive"
      />
      <NavButtons onBack={onBack} onNext={onNext} />
    </>
  );
}

function Step10() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <Logo size={48} />
      <div
        className="mt-2 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: '#E6F9F0' }}
      >
        <Check className="h-8 w-8" style={{ color: '#1B9A5A' }} />
      </div>
      <h1 className="text-2xl font-bold" style={{ color: '#175861' }}>
        ¡Bienvenido a NauticApp!
      </h1>
      <p className="text-sm" style={{ color: '#101828' }}>
        Tu cuenta está lista. Es momento de comenzar a gestionar tu guardería náutica.
      </p>
      <button
        type="button"
        onClick={() => router.push('/dashboard')}
        className="mt-2 flex items-center gap-2 rounded-[10px] px-8 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        style={{ background: '#175861' }}
      >
        Ir al Dashboard <ChevronRight className="h-4 w-4" />
      </button>
      <p className="mt-2 text-xs text-gray-400">
        ¿Necesitás ayuda? Contactanos en{' '}
        <a href="mailto:soporte@nauticapp.com" style={{ color: '#669E9D' }} className="underline">
          soporte@nauticapp.com
        </a>
      </p>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const [data, setData] = useState<Data>({
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    password: '',
    guarderiaId: '',
    guarderiaName: '',
    cuit: '',
    tipo: '',
    direccion: '',
    ciudad: '',
    provincia: '',
    codigoPostal: '',
    telefonoOperativo: '',
    emailOperativo: '',
    instagram: '',
    facebook: '',
    descripcion: '',
    horarios: DEFAULT_HORARIOS,
    equipo: [],
    cantidadNaves: '',
    cantidadPeines: '',
    activarNotificaciones: true,
    activarClimaYMareas: true,
    activarReservasOnline: true,
    activarPagosOnline: true,
    activarMenuGastronomico: false,
    plan: 'classic',
  });

  function set(k: keyof Data, v: unknown) {
    setData((prev) => ({ ...prev, [k]: v }));
  }

  function next() {
    setStep((s) => s + 1);
    setError(undefined);
  }
  function back() {
    setStep((s) => s - 1);
    setError(undefined);
  }

  function handleStep1() {
    if (!data.nombre || !data.apellido || !data.email || !data.password || !data.telefono) {
      setError('Completá todos los campos obligatorios');
      return;
    }
    startTransition(async () => {
      const res = await signUpStep({
        nombre: data.nombre,
        apellido: data.apellido,
        email: data.email,
        telefono: data.telefono,
        password: data.password,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      next();
    });
  }

  function handleStep2() {
    if (!data.guarderiaName || !data.direccion || !data.ciudad) {
      setError('Completá los campos obligatorios');
      return;
    }
    startTransition(async () => {
      const res = await createGuarderiaStep({
        nombre: data.guarderiaName,
        cuit: data.cuit,
        tipo: data.tipo,
        direccion: data.direccion,
        ciudad: data.ciudad,
        provincia: data.provincia,
        codigoPostal: data.codigoPostal,
        telefono: data.telefonoOperativo,
        email: data.emailOperativo,
        instagram: data.instagram,
        facebook: data.facebook,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      set('guarderiaId', res.guarderiaId!);
      next();
    });
  }

  async function handleStep3() {
    if (data.guarderiaId) {
      await updateDetallesStep(data.guarderiaId, {
        descripcion: data.descripcion,
        horarios: data.horarios,
      });
    }
    next();
  }

  async function handleStep4() {
    // Filtrar miembros vacíos (nombre + email requeridos).
    const miembros = data.equipo.filter((m) => m.nombre.trim() && m.email.trim());
    if (data.guarderiaId && miembros.length > 0) {
      const res = await inviteTeamMembersStep(data.guarderiaId, miembros);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.errores && res.errores.length > 0) {
        setError(`Algunos miembros fallaron: ${res.errores.join(' · ')}`);
        // Igual avanzamos — los que se crearon ya están y si reintenta va a duplicar
      }
    }
    next();
  }

  async function handleStep6() {
    if (data.guarderiaId) {
      await updateFeaturesStep(data.guarderiaId, {
        activarNotificaciones: data.activarNotificaciones,
        activarClimaYMareas: data.activarClimaYMareas,
        activarReservasOnline: data.activarReservasOnline,
        activarPagosOnline: data.activarPagosOnline,
        activarMenuGastronomico: data.activarMenuGastronomico,
      });
    }
    next();
  }

  async function handleSelectPlan(plan: 'classic' | 'plus' | 'platinum') {
    set('plan', plan);
    if (data.guarderiaId) {
      await selectPlanStep(data.guarderiaId, plan);
    }
    next();
  }

  return (
    <Shell step={step}>
      {step === 1 && (
        <Step1
          data={data}
          onChange={(k, v) => set(k, v)}
          onNext={handleStep1}
          error={error}
          pending={pending}
        />
      )}
      {step === 2 && (
        <Step2
          data={data}
          onChange={(k, v) => set(k, v)}
          onNext={handleStep2}
          onBack={back}
          error={error}
          pending={pending}
        />
      )}
      {step === 3 && (
        <Step3
          data={data}
          onChangeHorario={(dia, field, val) =>
            setData((prev) => ({
              ...prev,
              horarios: {
                ...prev.horarios,
                [dia]: { ...prev.horarios[dia], [field]: val },
              },
            }))
          }
          onChangeDesc={(v) => set('descripcion', v)}
          onNext={handleStep3}
          onBack={back}
        />
      )}
      {step === 4 && (
        <Step4
          data={data}
          onAddMember={() =>
            setData((prev) => ({
              ...prev,
              equipo: [
                ...prev.equipo,
                { nombre: '', apellido: '', email: '', rol: '', telefono: '', sede: '' },
              ],
            }))
          }
          onRemoveMember={(i) =>
            setData((prev) => ({ ...prev, equipo: prev.equipo.filter((_, idx) => idx !== i) }))
          }
          onChangeMember={(i, k, v) =>
            setData((prev) => {
              const equipo = [...prev.equipo];
              equipo[i] = { ...equipo[i], [k]: v };
              return { ...prev, equipo };
            })
          }
          onNext={() => {
            startTransition(handleStep4);
          }}
          onBack={back}
          onSkip={next}
        />
      )}
      {step === 5 && (
        <Step5 data={data} onChange={(k, v) => set(k, v)} onNext={next} onBack={back} />
      )}
      {step === 6 && (
        <Step6 data={data} onToggle={(k, v) => set(k, v)} onNext={handleStep6} onBack={back} />
      )}
      {step === 7 && <Step7 data={data} onSelect={handleSelectPlan} onBack={back} />}
      {step === 8 && <Step8 data={data} onNext={next} onBack={back} />}
      {step === 9 && <Step9 onNext={next} onBack={back} />}
      {step === 10 && <Step10 />}
    </Shell>
  );
}
