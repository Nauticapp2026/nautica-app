import { Building2, Users, Ship, Anchor, ShieldCheck } from 'lucide-react';
import { count, eq } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { guarderias, profiles, embarcaciones, espacios } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const TZ_AR = 'America/Argentina/Buenos_Aires';

function formatNumber(n: number): string {
  return n.toLocaleString('es-AR');
}

function formatDate(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString('es-AR', { timeZone: TZ_AR, weekday: 'long' });
  const day = now.toLocaleDateString('es-AR', { timeZone: TZ_AR, day: 'numeric' });
  const month = now.toLocaleDateString('es-AR', { timeZone: TZ_AR, month: 'long' });
  const year = now.toLocaleDateString('es-AR', { timeZone: TZ_AR, year: 'numeric' });
  return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${day} ${month[0].toUpperCase()}${month.slice(1)} ${year}`;
}

async function loadMetrics() {
  const [
    [{ value: guarderiasCount }],
    [{ value: profilesCount }],
    [{ value: superAdminsCount }],
    [{ value: embarcacionesCount }],
    [{ value: espaciosCount }],
  ] = await Promise.all([
    db.select({ value: count() }).from(guarderias),
    db.select({ value: count() }).from(profiles),
    db.select({ value: count() }).from(profiles).where(eq(profiles.isSuperAdmin, true)),
    db.select({ value: count() }).from(embarcaciones),
    db.select({ value: count() }).from(espacios),
  ]);

  return {
    guarderiasCount,
    profilesCount,
    superAdminsCount,
    embarcacionesCount,
    espaciosCount,
  };
}

export default async function SuperAdminHomePage() {
  await requireSuperAdmin();
  const metrics = await loadMetrics();

  const cards = [
    {
      icon: <Building2 className="h-5 w-5 text-white" />,
      iconBg: '#175861',
      value: formatNumber(metrics.guarderiasCount),
      label: 'Guarderías activas',
    },
    {
      icon: <Users className="h-5 w-5 text-white" />,
      iconBg: '#669E9D',
      value: formatNumber(metrics.profilesCount),
      label: 'Cuentas',
    },
    {
      icon: <ShieldCheck className="h-5 w-5 text-white" />,
      iconBg: '#ABC2B3',
      value: formatNumber(metrics.superAdminsCount),
      label: 'Super admins',
    },
    {
      icon: <Anchor className="h-5 w-5 text-white" />,
      iconBg: '#677B85',
      value: formatNumber(metrics.espaciosCount),
      label: 'Espacios totales',
    },
    {
      icon: <Ship className="h-5 w-5 text-white" />,
      iconBg: '#175861',
      value: formatNumber(metrics.embarcacionesCount),
      label: 'Embarcaciones',
    },
  ];

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="page-title">Panel de plataforma</h1>
        <p className="page-subtitle mt-1">{formatDate()}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => (
          <MetricCard key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
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
