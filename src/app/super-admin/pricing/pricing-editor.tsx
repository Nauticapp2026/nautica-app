'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  updatePricingPlanAction,
  updatePricingCapacitiesAction,
  type UpdatePlanInput,
} from '@/app/actions/super-admin/pricing';
import type { PricingPlan } from '@/lib/db/schema';

type Props = {
  plans: PricingPlan[];
  capacities: number[];
};

export function PricingEditor({ plans, capacities }: Props) {
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
