import { redirect } from 'next/navigation';
import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  alertas,
  comunicaciones,
  embarcaciones,
  facturacion,
  memberships,
  porteria,
  profiles,
} from '@/lib/db/schema';
import { and, asc, count, desc, eq, gte, lte, sum } from 'drizzle-orm';

import { AlertasOperativasList, type AlertaOperativa } from './alertas-operativas';
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate() {
  const now = new Date();
  const weekday = now.toLocaleDateString('es-AR', { weekday: 'long' });
  const day = now.getDate();
  const month = now.toLocaleDateString('es-AR', { month: 'long' });
  const year = now.getFullYear();
  return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${day} ${month[0].toUpperCase()}${month.slice(1)} ${year}`;
}

function formatCurrency(value: string | null): string {
  const n = parseFloat(value ?? '0');
  if (n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatShortDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-gray-400">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
        {icon}
      </div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

const TIPO_LABEL: Record<string, string> = {
  socios: 'Socios',
  publica: 'Pública',
};

const TIPO_CLS: Record<string, string> = {
  socios: 'bg-purple-100 text-purple-700',
  publica: 'bg-blue-100 text-blue-700',
};

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

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  // Operarios no tienen vista de dashboard: van directo a Tareas.
  if (!ctx.profile.isSuperAdmin && ctx.activeMembership.rol === 'operario') {
    redirect('/tareas');
  }

  const gId = ctx.activeMembership.guarderiaId;
  const rolLabel = ROL_LABELS[ctx.activeMembership.rol] ?? ctx.activeMembership.rol;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [
    [{ totalEmbarcaciones }],
    [{ totalSocios }],
    [{ totalIngresos }],
    [{ totalAlertas }],
    operariosList,
    comunicacionesList,
    alertasOperativasRows,
  ] = await Promise.all([
    db
      .select({ totalEmbarcaciones: count() })
      .from(embarcaciones)
      .where(eq(embarcaciones.guarderiaId, gId)),

    db
      .select({ totalSocios: count() })
      .from(memberships)
      .where(
        and(
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
          eq(memberships.status, 'active'),
        ),
      ),

    db
      .select({ totalIngresos: sum(facturacion.importe) })
      .from(facturacion)
      .where(
        and(
          eq(facturacion.guarderiaId, gId),
          eq(facturacion.estado, 'pagada'),
          gte(facturacion.emision, startOfMonth),
          lte(facturacion.emision, endOfMonth),
        ),
      ),

    db
      .select({ totalAlertas: count() })
      .from(facturacion)
      .where(and(eq(facturacion.guarderiaId, gId), eq(facturacion.estado, 'vencida'))),

    db
      .select({
        id: memberships.id,
        nombre: profiles.nombre,
        apellido: profiles.apellido,
        email: profiles.email,
      })
      .from(memberships)
      .innerJoin(profiles, eq(profiles.id, memberships.userId))
      .where(
        and(
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'operario'),
          eq(memberships.status, 'active'),
        ),
      ),

    db
      .select({
        id: comunicaciones.id,
        titulo: comunicaciones.titulo,
        tipo: comunicaciones.tipo,
        fecha: comunicaciones.fecha,
      })
      .from(comunicaciones)
      .where(and(eq(comunicaciones.guarderiaId, gId), eq(comunicaciones.publicar, true)))
      .orderBy(desc(comunicaciones.createdAt))
      .limit(3),

    db
      .select({
        id: alertas.id,
        tipo: alertas.tipo,
        estado: alertas.estado,
        mensaje: alertas.mensaje,
        createdAt: alertas.createdAt,
        porteriaId: alertas.porteriaId,
        socioId: alertas.socioId,
        socioNombre: profiles.nombre,
        socioApellido: profiles.apellido,
        socioEmail: profiles.email,
        socioTelefono: profiles.telefono,
        desde: porteria.desde,
        hasta: porteria.hasta,
        arribadaEn: porteria.arribadaEn,
        embarcacionNombre: embarcaciones.nombre,
        embarcacionMatricula: embarcaciones.matricula,
      })
      .from(alertas)
      .leftJoin(porteria, eq(porteria.id, alertas.porteriaId))
      .leftJoin(profiles, eq(profiles.id, alertas.socioId))
      .leftJoin(embarcaciones, eq(embarcaciones.id, porteria.embarcacionId))
      .where(and(eq(alertas.guarderiaId, gId), eq(alertas.estado, 'pendiente')))
      .orderBy(asc(alertas.tipo), desc(alertas.createdAt))
      .limit(500),
  ]);

  const alertasOperativas: AlertaOperativa[] = alertasOperativasRows.map((r) => ({
    id: r.id,
    tipo: r.tipo as 'retorno_proximo' | 'sin_respuesta',
    mensaje: r.mensaje,
    createdAt: r.createdAt.toISOString(),
    porteriaId: r.porteriaId,
    socioNombre:
      [r.socioNombre, r.socioApellido].filter(Boolean).join(' ') || r.socioEmail || 'Sin socio',
    socioTelefono: r.socioTelefono,
    desde: r.desde ? r.desde.toISOString() : null,
    hasta: r.hasta ? r.hasta.toISOString() : null,
    arribadaEn: r.arribadaEn ? r.arribadaEn.toISOString() : null,
    embarcacion: r.embarcacionMatricula
      ? `${r.embarcacionNombre ?? ''} (${r.embarcacionMatricula})`.trim()
      : r.embarcacionNombre,
  }));

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Bienvenido, {rolLabel}</h1>
        <p className="page-subtitle mt-1">{formatDate()}</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          icon={<Ship className="h-5 w-5 text-white" />}
          iconBg="#175861"
          value={String(totalEmbarcaciones)}
          label="Embarcaciones en guardería"
        />
        <MetricCard
          icon={<Users className="h-5 w-5 text-white" />}
          iconBg="#669E9D"
          value={String(totalSocios)}
          label="Socios activos"
        />
        <MetricCard
          icon={<TrendingUp className="h-5 w-5 text-white" />}
          iconBg="#ABC2B3"
          value={formatCurrency(totalIngresos)}
          label="Ingresos del mes"
        />
        <MetricCard
          icon={<AlertTriangle className="h-5 w-5 text-white" />}
          iconBg="#4B5563"
          value={String(totalAlertas)}
          label="Alertas pendientes"
        />
      </div>

      {/* Alertas + Operarios */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Alertas operativas — monitoreo de retorno de embarcaciones */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-4 w-4" style={{ color: '#175861' }} />
            <h2 className="text-base font-semibold" style={{ color: '#101828' }}>
              Alertas
            </h2>
          </div>
          <AlertasOperativasList alertas={alertasOperativas} />
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
          {operariosList.length === 0 ? (
            <EmptyState
              icon={<Ship className="h-7 w-7 opacity-40" />}
              text="No hay operarios cargados."
            />
          ) : (
            <div className="space-y-2">
              {operariosList.map((o) => {
                const nombre = [o.nombre, o.apellido].filter(Boolean).join(' ') || o.email;
                const inicial = (o.nombre?.[0] ?? o.email?.[0] ?? '?').toUpperCase();
                return (
                  <div
                    key={o.id}
                    className="flex items-center gap-3 rounded-[10px] border border-gray-100 bg-gray-50 px-4 py-3"
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: '#669E9D' }}
                    >
                      {inicial}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" style={{ color: '#101828' }}>
                        {nombre}
                      </p>
                      <p className="truncate text-xs text-gray-400">{o.email}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
        {comunicacionesList.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-7 w-7 opacity-40" />}
            text="No hay comunicaciones publicadas aún."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {comunicacionesList.map((c) => {
              const tipoKey = c.tipo ?? 'socios';
              return (
                <div
                  key={c.id}
                  className="rounded-[10px] border border-gray-100 bg-gray-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: '#101828' }}>
                        {c.titulo}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">{formatShortDate(c.fecha)}</p>
                    </div>
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        TIPO_CLS[tipoKey] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {TIPO_LABEL[tipoKey] ?? tipoKey}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
