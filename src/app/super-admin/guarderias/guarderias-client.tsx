'use client';

import { useMemo, useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  deleteGuarderiaAction,
  setGuarderiaActivaAction,
} from '@/app/actions/super-admin/guarderias';

export type GuarderiaRow = {
  id: string;
  nombre: string;
  slug: string;
  ciudad: string | null;
  provincia: string | null;
  plan: 'esencial' | 'club' | 'elite' | null;
  activa: boolean;
  createdAt: string;
  usuarios: number;
  espacios: number;
  embarcaciones: number;
};

const TZ_AR = 'America/Argentina/Buenos_Aires';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    timeZone: TZ_AR,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function GuarderiasClient({ guarderias }: { guarderias: GuarderiaRow[] }) {
  const [query, setQuery] = useState('');
  const [globalError, setGlobalError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guarderias;
    return guarderias.filter((g) => {
      const haystack = `${g.nombre} ${g.slug} ${g.ciudad ?? ''} ${g.provincia ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [guarderias, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          placeholder="Buscar por nombre, slug o ciudad..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <p className="text-muted-foreground text-xs">
          {filtered.length} de {guarderias.length} guarderías
        </p>
      </div>

      {globalError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {globalError}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="text-muted-foreground bg-gray-50 text-left text-xs font-semibold tracking-wider uppercase">
              <tr>
                <th className="px-4 py-3">Guardería</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Usuarios</th>
                <th className="px-4 py-3 text-right">Espacios</th>
                <th className="px-4 py-3 text-right">Embarcaciones</th>
                <th className="px-4 py-3">Fecha de creación</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-muted-foreground px-4 py-6 text-center text-sm">
                    Sin resultados.
                  </td>
                </tr>
              ) : (
                filtered.map((g) => (
                  <GuarderiaFila key={g.id} guarderia={g} onError={setGlobalError} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function GuarderiaFila({
  guarderia,
  onError,
}: {
  guarderia: GuarderiaRow;
  onError: (msg: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [toggling, startToggle] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `¿Eliminar la guardería "${guarderia.nombre}"?\n\nSe borran ${guarderia.usuarios} memberships, ${guarderia.espacios} espacios y ${guarderia.embarcaciones} embarcaciones, además de su facturación, comunicaciones y configuración. Las cuentas de los usuarios NO se borran.\n\nEsta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    onError(null);
    startTransition(async () => {
      const res = await deleteGuarderiaAction(guarderia.id);
      if (res.error) onError(res.error);
    });
  }

  function handleToggleActiva() {
    const nuevaActiva = !guarderia.activa;
    const verbo = nuevaActiva ? 'activar' : 'desactivar';
    if (
      !confirm(
        nuevaActiva
          ? `¿Activar la guardería "${guarderia.nombre}"?\n\nSus usuarios van a poder ingresar al dashboard.`
          : `¿Desactivar la guardería "${guarderia.nombre}"?\n\nSus usuarios no van a poder ingresar al dashboard hasta que la vuelvas a activar.`,
      )
    ) {
      return;
    }
    onError(null);
    startToggle(async () => {
      const res = await setGuarderiaActivaAction({
        guarderiaId: guarderia.id,
        activa: nuevaActiva,
      });
      if (res.error) onError(`No se pudo ${verbo}: ${res.error}`);
    });
  }

  const ubicacion = [guarderia.ciudad, guarderia.provincia].filter(Boolean).join(', ');
  const filaPending = pending || toggling;

  return (
    <tr className={filaPending ? 'opacity-50' : ''}>
      <td className="px-4 py-3">
        <div className="font-semibold text-[#175861]">{guarderia.nombre}</div>
        <div className="text-muted-foreground text-xs">/{guarderia.slug}</div>
      </td>
      <td className="text-muted-foreground px-4 py-3 text-xs">{ubicacion || '—'}</td>
      <td className="px-4 py-3">
        <PlanBadge plan={guarderia.plan} />
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={handleToggleActiva}
          disabled={filaPending}
          title={guarderia.activa ? 'Click para desactivar' : 'Click para activar'}
          className={
            guarderia.activa
              ? 'inline-flex items-center gap-1 rounded-full bg-[#D9EBE9] px-2 py-0.5 text-xs font-semibold text-[#175861] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50'
              : 'inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50'
          }
        >
          <span
            className={
              guarderia.activa
                ? 'h-1.5 w-1.5 rounded-full bg-[#175861]'
                : 'h-1.5 w-1.5 rounded-full bg-amber-600'
            }
          />
          {guarderia.activa ? 'Activa' : 'Pendiente'}
        </button>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{guarderia.usuarios}</td>
      <td className="px-4 py-3 text-right tabular-nums">{guarderia.espacios}</td>
      <td className="px-4 py-3 text-right tabular-nums">{guarderia.embarcaciones}</td>
      <td className="text-muted-foreground px-4 py-3 text-xs">{formatDate(guarderia.createdAt)}</td>
      <td className="px-4 py-3 text-right">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={handleDelete}
          disabled={filaPending}
          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 />
          Eliminar
        </Button>
      </td>
    </tr>
  );
}

function PlanBadge({ plan }: { plan: GuarderiaRow['plan'] }) {
  if (!plan) return <span className="text-muted-foreground text-xs">—</span>;
  const styles: Record<string, string> = {
    esencial: 'bg-gray-100 text-gray-700',
    club: 'bg-[#669E9D]/15 text-[#669E9D]',
    elite: 'bg-[#ABC2B3]/30 text-[#175861]',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${styles[plan] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {plan}
    </span>
  );
}
