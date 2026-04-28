'use client';

import { useState, useTransition } from 'react';
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
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-bold text-[#175861]">Planes</h2>
        <p className="mt-1 text-sm text-[#677B85]">
          El <strong>rate</strong> es el precio por lugar de guarda. Ej: rate 900 con capacidad 500
          ⇒ $450.000.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard key={plan.slug} plan={plan} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#175861]">Capacidades del slider</h2>
        <p className="mt-1 text-sm text-[#677B85]">
          Lista de números (lugares de guarda) que aparecen como pasos en el slider de la landing.
          Mínimo 2.
        </p>
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
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="text-xs font-semibold tracking-wider text-[#677B85] uppercase">
        {plan.slug}
      </div>

      <label className="block text-sm">
        <span className="font-semibold text-[#175861]">Nombre visible</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#669E9D] focus:outline-none"
          maxLength={40}
        />
      </label>

      <label className="block text-sm">
        <span className="font-semibold text-[#175861]">Rate (ARS por lugar)</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#669E9D] focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={!dirty || pending}
        className="mt-2 rounded-md bg-[#175861] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#669E9D] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Guardar'}
      </button>

      {message && (
        <p
          className={`text-xs font-semibold ${
            message.type === 'ok' ? 'text-[#669E9D]' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
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
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#669E9D] focus:outline-none"
        placeholder="200, 500, 700, 1000, 1500, 2000, 3000, 4000"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[#175861] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#669E9D] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Guardando...' : 'Guardar capacidades'}
        </button>
        {message && (
          <p
            className={`text-xs font-semibold ${
              message.type === 'ok' ? 'text-[#669E9D]' : 'text-red-600'
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
