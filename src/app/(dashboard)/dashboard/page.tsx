import { getActiveMarina } from '@/lib/auth/session';
import {
  Ship,
  Users,
  TrendingUp,
  AlertTriangle,
  Bell,
  Anchor,
  Plus,
  MessageSquare,
} from 'lucide-react';

const ROL_LABELS: Record<string, string> = {
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

const ALERTS = [
  {
    id: 1,
    text: 'Pago vencido - Juan Pérez (Embarcación #234)',
    time: '2 horas',
    cls: 'border-amber-400 bg-amber-50 text-amber-900',
  },
  {
    id: 2,
    text: 'Nueva reserva de amarra - Sector B',
    time: '2 horas',
    cls: 'border-blue-400 bg-blue-50 text-blue-900',
  },
  {
    id: 3,
    text: 'Seguro vencido - Embarcación Sirena (Mat. 5678)',
    time: '2 horas',
    cls: 'border-red-400 bg-red-50 text-red-900',
  },
  {
    id: 4,
    text: 'Operario solicitó mantenimiento - Muelle C',
    time: '2 horas',
    cls: 'border-slate-300 bg-slate-50 text-slate-700',
  },
];

const COMUNICACIONES = [
  { id: 1, titulo: 'Test 3', fecha: '18 Feb', audiencia: 'Socios' },
  { id: 2, titulo: 'Test', fecha: '18 Feb', audiencia: 'Socios' },
  { id: 3, titulo: 'Test flor', fecha: '18 Feb', audiencia: 'Pública' },
];

const AUDIENCIA_CLS: Record<string, string> = {
  Socios: 'bg-purple-100 text-purple-700',
  Pública: 'bg-blue-100 text-blue-700',
};

function formatDate() {
  const now = new Date();
  const weekday = now.toLocaleDateString('es-AR', { weekday: 'long' });
  const day = now.getDate();
  const month = now.toLocaleDateString('es-AR', { month: 'long' });
  const year = now.getFullYear();
  return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${day} ${month[0].toUpperCase()}${month.slice(1)} ${year}`;
}

function MetricCard({
  icon,
  iconBg,
  value,
  label,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px]"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <p className="text-2xl font-bold" style={{ color: '#101828' }}>
        {value}
      </p>
      <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
        {label}
      </p>
    </div>
  );
}

export default async function DashboardPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const rolLabel = ROL_LABELS[ctx.activeMembership.rol] ?? ctx.activeMembership.rol;

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#101828' }}>
          Bienvenido, {rolLabel}
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
          {formatDate()}
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          icon={<Ship className="h-5 w-5 text-white" />}
          iconBg="#175861"
          value="8"
          label="Embarcaciones en guardería"
        />
        <MetricCard
          icon={<Users className="h-5 w-5 text-white" />}
          iconBg="#669E9D"
          value="7"
          label="Socios activos"
        />
        <MetricCard
          icon={<TrendingUp className="h-5 w-5 text-white" />}
          iconBg="#ABC2B3"
          value="$2.4M"
          label="Ingresos del mes"
        />
        <MetricCard
          icon={<AlertTriangle className="h-5 w-5 text-white" />}
          iconBg="#4B5563"
          value="8"
          label="Alertas pendientes"
        />
      </div>

      {/* Alertas + Operarios */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Alertas */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-4 w-4" style={{ color: '#175861' }} />
            <h2 className="text-base font-semibold" style={{ color: '#101828' }}>
              Alertas
            </h2>
          </div>
          <div className="space-y-3">
            {ALERTS.map((a) => (
              <div
                key={a.id}
                className={`flex items-center justify-between rounded-[10px] border px-4 py-3 ${a.cls}`}
              >
                <span className="text-sm font-medium">{a.text}</span>
                <span className="ml-3 shrink-0 text-xs opacity-60">{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Operarios */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Anchor className="h-4 w-4" style={{ color: '#175861' }} />
              <h2 className="text-base font-semibold" style={{ color: '#101828' }}>
                Operarios
              </h2>
            </div>
            <button
              className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#175861' }}
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo operario
            </button>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-gray-400">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <Ship className="h-7 w-7 opacity-40" />
            </div>
            <p className="text-sm">No hay operarios cargados.</p>
          </div>
        </div>
      </div>

      {/* Comunicaciones recientes */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare className="h-4 w-4" style={{ color: '#175861' }} />
          <h2 className="text-base font-semibold" style={{ color: '#101828' }}>
            Comunicaciones recientes
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {COMUNICACIONES.map((c) => (
            <div key={c.id} className="rounded-[10px] border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                    {c.titulo}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">{c.fecha}</p>
                </div>
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    AUDIENCIA_CLS[c.audiencia] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {c.audiencia}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
