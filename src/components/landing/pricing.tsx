'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { useState } from 'react';

const capacities = [200, 500, 700, 1000, 1500, 2000, 3000, 4000] as const;
const DEFAULT_INDEX = 1;

type Plan = {
  name: string;
  rate: number;
  headerColor: string;
  buttonColor: string;
  iconColor: string;
  iconBg: string;
  features: string[];
  highlighted?: boolean;
};

const plans: Plan[] = [
  {
    name: 'CLASSIC',
    rate: 900,
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
  {
    name: 'PLUS',
    rate: 1200,
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
  {
    name: 'PLATINIUM',
    rate: 1500,
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
];

function formatNumber(value: number) {
  return value.toLocaleString('es-AR');
}

export function Pricing() {
  const [index, setIndex] = useState<number>(DEFAULT_INDEX);
  const capacity = capacities[index];
  const handlePercent = (index / (capacities.length - 1)) * 100;

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

        {/* Slider interactivo */}
        <div className="mx-auto mt-12 max-w-4xl">
          <div className="relative h-3.5 rounded-full bg-gradient-to-r from-white via-[#669E9D]/40 to-[#175861] ring-2 ring-gray-200">
            <div
              className="absolute inset-y-0 left-0 rounded-l-full bg-gradient-to-r from-[#175861] to-[#669E9D] transition-[width] duration-200"
              style={{ width: `${handlePercent}%` }}
            />
            <div
              className="absolute -top-1 size-6 -translate-x-1/2 rounded-full border-2 border-white bg-[#175861] shadow-md transition-[left] duration-200"
              style={{ left: `${handlePercent}%` }}
            />
          </div>
          <div className="mt-3 flex justify-between text-sm font-bold">
            {capacities.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
                className={`cursor-pointer transition ${
                  i === index ? 'text-[#175861]' : 'text-[#677B85] hover:text-[#175861]'
                }`}
              >
                {formatNumber(c)}
              </button>
            ))}
          </div>
        </div>

        {/* Planes */}
        <div className="mt-16 grid gap-6 md:grid-cols-3 md:items-stretch">
          {plans.map((plan) => (
            <PlanCard key={plan.name} plan={plan} capacity={capacity} />
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

function PlanCard({ plan, capacity }: { plan: Plan; capacity: number }) {
  const price = `$${formatNumber(plan.rate * capacity)}`;
  const capacityLabel = formatNumber(capacity);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl bg-white shadow-md ${
        plan.highlighted ? 'shadow-2xl ring-2 ring-[#669E9D] md:-my-4' : 'ring-1 ring-gray-200'
      }`}
    >
      <div
        className="px-6 py-7 text-center text-white"
        style={{ backgroundColor: plan.headerColor }}
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
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-3">
              <span
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: plan.iconBg }}
              >
                <Check className="size-3" style={{ color: plan.iconColor }} strokeWidth={3} />
              </span>
              <span className="text-base font-bold text-[#175861]">{feature}</span>
            </li>
          ))}
        </ul>

        <Link
          href="/onboarding"
          className="block rounded-[10px] px-4 py-3 text-center text-base font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: plan.buttonColor }}
        >
          Seleccionar plan
        </Link>
      </div>
    </div>
  );
}
