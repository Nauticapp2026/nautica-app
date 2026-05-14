'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  updatePlanFeatureAction,
  updatePricingPlanAction,
  updatePricingCapacitiesAction,
  type UpdatePlanInput,
} from '@/app/actions/super-admin/pricing';
import type { PricingPlan } from '@/lib/db/schema';
import type { PricingFeatureRow } from '@/lib/pricing/config';

type PlanSlug = 'esencial' | 'club' | 'elite';

type Props = {
  plans: PricingPlan[];
  capacities: number[];
  featuresGrid: PricingFeatureRow[];
};

export function PricingEditor({ plans, capacities, featuresGrid }: Props) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#101828]">Planes</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            El <strong>rate</strong> es el precio por lugar de guarda. Ej: rate 900 con capacidad
            500 ⇒ $450.000.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard key={plan.slug} plan={plan} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#101828]">Capacidades del slider</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Lista de números (lugares de guarda) que aparecen como pasos en el slider de la landing.
            Mínimo 2.
          </p>
        </div>
        <CapacitiesEditor capacities={capacities} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#101828]">Features por plan</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Lo que cada plan incluye. Dejá la celda <strong>vacía</strong> para marcar que el plan
            no la incluye. Usá <strong>✓</strong> para indicar incluido sin detalle, o escribí un
            texto libre (ej <em>2 / mes</em>, <em>30 días gratis</em>) que va a mostrarse al lado
            del nombre de la feature en landing, onboarding y panel del club.
          </p>
        </div>
        <FeaturesGridEditor rows={featuresGrid} />
      </section>
    </div>
  );
}

function PlanCard({ plan }: { plan: PricingPlan }) {
  const [name, setName] = useState(plan.name);
  const [rate, setRate] = useState<string>(String(plan.rate));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const dirty = name !== plan.name || Number(rate) !== plan.rate;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const rateNumber = Number(rate);
    if (!Number.isFinite(rateNumber) || rateNumber <= 0) {
      setMessage({ type: 'error', text: 'Rate inválido.' });
      return;
    }
    const input: UpdatePlanInput = { slug: plan.slug, name: name.trim(), rate: rateNumber };
    startTransition(async () => {
      const res = await updatePricingPlanAction(input);
      if (res.error) {
        setMessage({ type: 'error', text: res.error });
        return;
      }
      setMessage({ type: 'ok', text: 'Guardado.' });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-xs tracking-wider uppercase">
          {plan.slug}
        </CardTitle>
        <CardDescription className="sr-only">Editar nombre y rate de {plan.slug}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${plan.slug}`}>Nombre visible</Label>
            <Input
              id={`name-${plan.slug}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`rate-${plan.slug}`}>Rate (ARS por lugar)</Label>
            <Input
              id={`rate-${plan.slug}`}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={!dirty || pending} className="w-full">
            {pending ? 'Guardando...' : 'Guardar'}
          </Button>
          {message && (
            <p
              className={`text-xs font-medium ${
                message.type === 'ok' ? 'text-[#669E9D]' : 'text-destructive'
              }`}
            >
              {message.text}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function CapacitiesEditor({ capacities }: { capacities: number[] }) {
  const [text, setText] = useState(capacities.join(', '));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const parsed = text
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (parsed.length < 2) {
      setMessage({ type: 'error', text: 'Ingresá al menos 2 números separados por coma.' });
      return;
    }
    if (parsed.some((n) => !Number.isInteger(n) || n <= 0)) {
      setMessage({ type: 'error', text: 'Solo enteros positivos.' });
      return;
    }
    startTransition(async () => {
      const res = await updatePricingCapacitiesAction(parsed);
      if (res.error) {
        setMessage({ type: 'error', text: res.error });
        return;
      }
      setMessage({ type: 'ok', text: 'Guardado.' });
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="200, 500, 700, 1000, 1500, 2000, 3000, 4000"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando...' : 'Guardar capacidades'}
        </Button>
        {message && (
          <p
            className={`text-xs font-medium ${
              message.type === 'ok' ? 'text-[#669E9D]' : 'text-destructive'
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}

const PLAN_COLS: { slug: PlanSlug; label: string }[] = [
  { slug: 'esencial', label: 'Esencial' },
  { slug: 'club', label: 'Club' },
  { slug: 'elite', label: 'Élite' },
];

function FeaturesGridEditor({ rows }: { rows: PricingFeatureRow[] }) {
  const grouped = rows.reduce<{ group: string; items: PricingFeatureRow[] }[]>((acc, row) => {
    const last = acc[acc.length - 1];
    if (last && last.group === row.groupLabel) {
      last.items.push(row);
    } else {
      acc.push({ group: row.groupLabel, items: [row] });
    }
    return acc;
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-gray-600 uppercase">
              Feature
            </th>
            {PLAN_COLS.map((p) => (
              <th
                key={p.slug}
                className="w-[180px] px-3 py-2 text-left text-xs font-semibold tracking-wider text-gray-600 uppercase"
              >
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grouped.map((g) => (
            <FeaturesGridGroup key={g.group} group={g.group} items={g.items} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeaturesGridGroup({ group, items }: { group: string; items: PricingFeatureRow[] }) {
  return (
    <>
      <tr className="border-t border-b border-gray-200 bg-gray-100">
        <td colSpan={4} className="px-4 py-1.5 text-xs font-bold tracking-wider text-[#175861]">
          {group}
        </td>
      </tr>
      {items.map((row, idx) => (
        <tr key={row.id} className={idx > 0 ? 'border-t border-gray-100' : undefined}>
          <td className="px-4 py-2 text-gray-800">{row.label}</td>
          {PLAN_COLS.map((p) => (
            <td key={p.slug} className="px-3 py-2 align-top">
              <FeatureCell featureId={row.id} planSlug={p.slug} initialValue={row.values[p.slug]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function FeatureCell({
  featureId,
  planSlug,
  initialValue,
}: {
  featureId: string;
  planSlug: PlanSlug;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== saved;

  function persist(next: string) {
    setError(null);
    startTransition(async () => {
      const res = await updatePlanFeatureAction({ planSlug, featureId, value: next });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSaved(next);
    });
  }

  function quickSet(next: string) {
    setValue(next);
    persist(next);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-stretch gap-1">
        <Input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (dirty) persist(value);
          }}
          placeholder="—"
          disabled={pending}
          className="h-8 text-sm"
        />
        <button
          type="button"
          onClick={() => quickSet('✓')}
          disabled={pending}
          aria-label="Incluido"
          className="rounded-md border border-gray-200 bg-white px-2 text-sm text-[#175861] hover:bg-gray-50 disabled:opacity-50"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => quickSet('')}
          disabled={pending}
          aria-label="No incluido"
          className="rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50"
        >
          —
        </button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
