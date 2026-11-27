'use client';

import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Reveal } from './motion';

// Presentación por plan (keyed por slug). Lo que cambia desde el panel super
// admin (name, rate, features) viene por props; lo que es decisión de
// marketing/diseño (colores, plan destacado) vive acá.
const PLAN_PRESENTATION: Record<
  string,
  {
    headerColor: string;
    buttonColor: string;
    iconColor: string;
    iconBg: string;
    highlighted?: boolean;
  }
> = {
  esencial: {
    headerColor: '#2A6F77',
    buttonColor: '#2A6F77',
    iconColor: '#ffffff',
    iconBg: '#2A6F77',
  },
  premium: {
    headerColor: '#175861',
    buttonColor: '#175861',
    iconColor: '#ffffff',
    iconBg: '#175861',
    highlighted: true,
  },
  elite: {
    headerColor: '#0b2f35',
    buttonColor: '#0b2f35',
    iconColor: '#ffffff',
    iconBg: '#0b2f35',
  },
};

export type PricingPlanView = {
  slug: string;
  name: string;
  rate: number;
};

type PlanFeatureLine = { text: string; bold: boolean };

type Props = {
  plans: PricingPlanView[];
  capacities: number[];
  featuresByPlan: Record<'esencial' | 'premium' | 'elite', PlanFeatureLine[]>;
};

function formatNumber(value: number) {
  return value.toLocaleString('es-AR');
}

/** Anima un número hacia su nuevo valor (sin animación si el usuario pidió menos movimiento). */
function useTween(target: number) {
  const [value, setValue] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ms = reduce ? 0 : 550;
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = ms === 0 ? 1 : Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = origin + (target - origin) * eased;
      from.current = current;
      setValue(current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return Math.round(value);
}

export function PricingClient({ plans, capacities, featuresByPlan }: Props) {
  const STEP = 10;
  const [markers, setMarkers] = useState<number[]>(() => capacities);

  const sorted = [...markers].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;

  const defaultValue = markers[1] ?? markers[0] ?? 0;
  const [capacity, setCapacity] = useState<number>(defaultValue);

  const clampedCapacity = Math.max(min, Math.min(max, capacity));
  const handlePercent = max > min ? ((clampedCapacity - min) / (max - min)) * 100 : 0;

  const handleSlider = (v: number) => setCapacity(v);

  const handleMarkerChange = (i: number, raw: string) => {
    if (raw === '') {
      setMarkers((prev) => {
        const next = [...prev];
        next[i] = 0;
        return next;
      });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    const rounded = Math.round(n);
    setMarkers((prev) => {
      const next = [...prev];
      next[i] = rounded;
      return next;
    });
    setCapacity(rounded);
  };

  const handleMarkerSelect = (i: number) => setCapacity(markers[i]);

  return (
    <section id="planes" className="bg-[#F3F4F6] py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center">
          <h2 className="text-3xl leading-tight font-normal text-[#175861] md:text-4xl">
            ¿Cuántos espacios de guarda tiene tu club
            <br />
            <span className="font-bold">entre amarras y camas?</span>
          </h2>
          <p className="mt-3 text-xl font-semibold text-[#175861]">
            Planes autogestionables exclusivos para Clubes Náuticos
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-4xl rounded-3xl bg-white px-6 pt-20 pb-6 shadow-sm md:px-10">
          <div className="relative h-3.5 rounded-full bg-gradient-to-r from-white via-[#669E9D]/40 to-[#175861] ring-2 ring-gray-200">
            <div
              className="pointer-events-none absolute inset-y-0 left-0 rounded-l-full bg-gradient-to-r from-[#175861] to-[#669E9D]"
              style={{ width: `${handlePercent}%` }}
            />
            <div
              className="pointer-events-none absolute -top-12 -translate-x-1/2 rounded-md bg-[#175861] px-2.5 py-1 text-xs font-bold whitespace-nowrap text-white shadow-md after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-[#175861] after:content-['']"
              style={{ left: `${handlePercent}%` }}
              aria-hidden
            >
              {formatNumber(clampedCapacity)} espacios
            </div>
            <div
              className="v2-pulse pointer-events-none absolute -top-1 size-6 -translate-x-1/2 rounded-full border-2 border-white bg-[#175861] shadow-md"
              style={{ left: `${handlePercent}%` }}
            />
            <input
              type="range"
              min={min}
              max={max}
              step={STEP}
              value={clampedCapacity}
              onChange={(e) => handleSlider(Number(e.target.value))}
              aria-label="Cantidad de espacios"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-x-2 gap-y-1 text-sm font-bold">
            {markers.map((m, i) => {
              const activo = m === capacity;
              return (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={m}
                  onChange={(e) => handleMarkerChange(i, e.target.value.replace(/[^0-9]/g, ''))}
                  onFocus={(e) => {
                    handleMarkerSelect(i);
                    e.currentTarget.select();
                  }}
                  aria-label={`Marcador ${i + 1}`}
                  className={`w-12 cursor-pointer rounded bg-transparent text-center transition-colors hover:text-[#175861] focus:bg-white focus:text-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none ${
                    activo ? 'text-[#175861]' : 'text-[#677B85]'
                  }`}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3 md:items-stretch">
          {plans.map((plan, i) => (
            <Reveal key={plan.slug} delay={i * 130} direction="zoom" className="flex">
              <PlanCard
                plan={plan}
                capacity={capacity}
                features={featuresByPlan[plan.slug as 'esencial' | 'premium' | 'elite'] ?? []}
              />
            </Reveal>
          ))}
        </div>

        <div className="mt-12 space-y-1 text-center text-sm font-medium text-[#677B85]">
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

function PlanCard({
  plan,
  capacity,
  features,
}: {
  plan: PricingPlanView;
  capacity: number;
  features: PlanFeatureLine[];
}) {
  const presentation = PLAN_PRESENTATION[plan.slug] ?? PLAN_PRESENTATION.esencial;
  const price = `$${formatNumber(useTween(plan.rate * capacity))}`;

  return (
    <div
      className={`group flex w-full flex-col overflow-hidden rounded-[2rem] bg-white transition-all duration-500 ease-out hover:-translate-y-2 hover:shadow-[0_40px_60px_-30px_rgb(11_47_53/0.55)] ${
        presentation.highlighted
          ? 'shadow-[0_30px_60px_-30px_rgb(11_47_53/0.5)] ring-2 ring-[#669E9D] md:-my-4'
          : 'shadow-md ring-1 ring-gray-200'
      }`}
    >
      <div
        className="relative px-6 py-8 text-center text-white"
        style={{ backgroundColor: presentation.headerColor }}
      >
        <p className="text-xl font-semibold tracking-[0.2em] md:text-2xl">{plan.name}</p>
        <p className="mt-4 flex items-baseline justify-center gap-1.5">
          <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums md:text-3xl">
            {price}
          </span>
          <span className="text-sm font-bold tracking-wide opacity-80">/MES</span>
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-6 p-6 md:p-7">
        <ul className="flex-1 space-y-2.5">
          {features.map((feature) => (
            <li key={feature.text} className="flex items-start gap-2.5">
              <span
                className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full transition-transform duration-500 group-hover:scale-110"
                style={{ backgroundColor: presentation.iconBg }}
              >
                <Check
                  className="size-3"
                  style={{ color: presentation.iconColor }}
                  strokeWidth={3}
                />
              </span>
              <span
                className={`text-sm leading-snug text-[#175861] ${feature.bold ? 'font-bold' : 'font-normal'}`}
              >
                {feature.text}
              </span>
            </li>
          ))}
        </ul>

        <Link
          href="/onboarding"
          className="v2-btn w-full justify-center text-white hover:opacity-95"
          style={{ backgroundColor: presentation.buttonColor }}
        >
          Seleccionar plan
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
