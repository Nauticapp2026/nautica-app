'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { useState } from 'react';

// Presentación por plan (keyed por slug). Lo que cambia desde el panel super
// admin (name, rate) viene por props; lo que es decisión de marketing/diseño
// (colores, features, plan destacado) vive acá.
const PLAN_PRESENTATION: Record<
  string,
  {
    headerColor: string;
    buttonColor: string;
    iconColor: string;
    iconBg: string;
    highlighted?: boolean;
    features: string[];
  }
> = {
  classic: {
    headerColor: '#677B85',
    buttonColor: '#677B85',
    iconColor: '#677B85',
    iconBg: 'rgba(103, 123, 133, 0.10)',
    features: [
      'Sistema de gestión',
      'Sistema de ingreso',
      '1 Comunicación a clientes en circuito cerrado',
    ],
  },
  plus: {
    headerColor: '#669E9D',
    buttonColor: '#669E9D',
    iconColor: '#669E9D',
    iconBg: 'rgba(102, 158, 157, 0.10)',
    highlighted: true,
    features: [
      'Sistema de gestión',
      'Sistema de ingreso',
      '5 Comunicaciones a clientes en circuito cerrado',
      'Primeras posiciones en búsqueda',
      '2 publicaciones de espacios de guarda',
    ],
  },
  platinum: {
    headerColor: '#ABC2B3',
    buttonColor: '#ABC2B3',
    iconColor: '#ABC2B3',
    iconBg: 'rgba(171, 194, 179, 0.10)',
    features: [
      'Sistema de gestión',
      'Sistema de ingreso',
      '5 Comunicaciones a clientes en circuito cerrado',
      'Primeras posiciones en búsqueda',
      '5 publicaciones de espacios de guarda',
      '5 Comunicaciones a toda la comunidad NauticApp',
      'Blindaje de competidores',
      'Shop integrado',
    ],
  },
};

export type PricingPlanView = {
  slug: string;
  name: string;
  rate: number;
};

type Props = {
  plans: PricingPlanView[];
  capacities: number[];
};

function formatNumber(value: number) {
  return value.toLocaleString('es-AR');
}

export function PricingClient({ plans, capacities }: Props) {
  const sorted = [...capacities].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const STEP = 10;
  const defaultValue = sorted.length > 1 ? sorted[1] : (sorted[0] ?? 0);
  const [capacity, setCapacity] = useState<number>(defaultValue);
  const [inputValue, setInputValue] = useState<string>(String(defaultValue));

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  const handleSlider = (v: number) => {
    setCapacity(v);
    setInputValue(String(v));
  };

  const handleInputChange = (raw: string) => {
    setInputValue(raw);
    const n = Number(raw);
    if (Number.isFinite(n)) setCapacity(clamp(Math.round(n)));
  };

  const handleInputBlur = () => {
    const n = Number(inputValue);
    const final = Number.isFinite(n) ? clamp(Math.round(n)) : defaultValue;
    setCapacity(final);
    setInputValue(String(final));
  };

  const handlePercent = max > min ? ((capacity - min) / (max - min)) * 100 : 0;

  return (
    <section id="planes" className="bg-[#F3F4F6] py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center">
          <h2 className="text-3xl leading-tight font-bold text-[#175861] md:text-4xl">
            ¿Cuántos lugares de guarda tiene tu club entre amarras y camas?
          </h2>
          <p className="mt-3 text-xl font-semibold text-[#175861]">
            Planes autogestionables exclusivos para Clubes Náuticos
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-4xl">
          <div className="relative h-3.5 rounded-full bg-gradient-to-r from-white via-[#669E9D]/40 to-[#175861] ring-2 ring-gray-200">
            <div
              className="pointer-events-none absolute inset-y-0 left-0 rounded-l-full bg-gradient-to-r from-[#175861] to-[#669E9D]"
              style={{ width: `${handlePercent}%` }}
            />
            <div
              className="pointer-events-none absolute -top-1 size-6 -translate-x-1/2 rounded-full border-2 border-white bg-[#175861] shadow-md"
              style={{ left: `${handlePercent}%` }}
            />
            <input
              type="range"
              min={min}
              max={max}
              step={STEP}
              value={capacity}
              onChange={(e) => handleSlider(Number(e.target.value))}
              aria-label="Cantidad de lugares"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm font-bold text-[#677B85]">
            <span>{formatNumber(min)}</span>
            <input
              type="number"
              min={min}
              max={max}
              step={STEP}
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onBlur={handleInputBlur}
              aria-label="Cantidad de lugares"
              className="h-11 w-32 rounded-[10px] border border-gray-200 bg-white px-3 text-center text-base font-bold text-[#175861] focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
            />
            <span>{formatNumber(max)}</span>
          </div>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3 md:items-stretch">
          {plans.map((plan) => (
            <PlanCard key={plan.slug} plan={plan} capacity={capacity} />
          ))}
        </div>

        <div className="mt-12 space-y-1 text-center text-sm font-bold text-[#677B85]">
          <p>
            Las novedades y publicaciones del plan elegido no son acumulables y se renovarán de
            manera mensual.
          </p>
          <p>
            La contratación es anual, puede abonarse en un solo pago o en hasta 12 cuotas con
            interés.
          </p>
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan, capacity }: { plan: PricingPlanView; capacity: number }) {
  const presentation = PLAN_PRESENTATION[plan.slug] ?? PLAN_PRESENTATION.classic;
  const price = `$${formatNumber(plan.rate * capacity)}`;
  const capacityLabel = formatNumber(capacity);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl bg-white shadow-md ${
        presentation.highlighted
          ? 'shadow-2xl ring-2 ring-[#669E9D] md:-my-4'
          : 'ring-1 ring-gray-200'
      }`}
    >
      <div
        className="px-6 py-7 text-center text-white"
        style={{ backgroundColor: presentation.headerColor }}
      >
        <p className="text-2xl font-semibold tracking-wider md:text-3xl">
          {plan.name} <span className="font-bold">{capacityLabel}</span>
        </p>
        <p className="mt-2 text-base">
          <span className="font-semibold">{price}</span> <span className="font-bold">/MES</span>
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-6 p-8">
        <ul className="flex-1 space-y-4">
          {presentation.features.map((feature) => (
            <li key={feature} className="flex items-start gap-3">
              <span
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: presentation.iconBg }}
              >
                <Check
                  className="size-3"
                  style={{ color: presentation.iconColor }}
                  strokeWidth={3}
                />
              </span>
              <span className="text-base font-bold text-[#175861]">{feature}</span>
            </li>
          ))}
        </ul>

        <Link
          href="/onboarding"
          className="block rounded-[10px] px-4 py-3 text-center text-base font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: presentation.buttonColor }}
        >
          Seleccionar plan
        </Link>
      </div>
    </div>
  );
}
