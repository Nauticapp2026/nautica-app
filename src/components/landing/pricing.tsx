import Link from 'next/link';
import { Check } from 'lucide-react';

const capacities = ['200', '500', '700', '1.000', '1.500', '2.000', '3.000', '4.000'];

type Plan = {
  name: string;
  price: string;
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
    price: '$450.000',
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
    price: '$600.000',
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
    price: '$750.000',
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

export function Pricing() {
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

        {/* Slider visual estático */}
        <div className="mx-auto mt-12 max-w-4xl">
          <div className="relative h-3.5 rounded-full bg-gradient-to-r from-white via-[#669E9D]/40 to-[#175861] ring-2 ring-gray-200">
            {/* tramo activo (hasta "500") */}
            <div className="absolute inset-y-0 left-0 w-[15%] rounded-l-full bg-gradient-to-r from-[#175861] to-[#669E9D]" />
            {/* handle en "500" */}
            <div className="absolute -top-1 left-[15%] size-6 -translate-x-1/2 rounded-full border-2 border-white bg-[#175861] shadow-md" />
          </div>
          <div className="mt-3 flex justify-between text-sm font-bold text-[#175861]">
            {capacities.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>

        {/* Planes */}
        <div className="mt-16 grid gap-6 md:grid-cols-3 md:items-stretch">
          {plans.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
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

function PlanCard({ plan }: { plan: Plan }) {
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
          {plan.name} <span className="font-bold">500</span>
        </p>
        <p className="mt-2 text-base">
          <span className="font-semibold">{plan.price}</span>{' '}
          <span className="font-bold">/MES</span>
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
          href="/signup"
          className="block rounded-[10px] px-4 py-3 text-center text-base font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: plan.buttonColor }}
        >
          Seleccionar plan
        </Link>
      </div>
    </div>
  );
}
