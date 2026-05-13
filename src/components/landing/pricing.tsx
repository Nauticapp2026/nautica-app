import { getPricingConfig } from '@/lib/pricing/config';
import { PricingClient, type PricingPlanView } from './pricing-client';

// Fallback si la DB todavía no tiene seed o hay un fallo de lectura — la home
// no debería romper por una landing dinámica.
const FALLBACK_PLANS: PricingPlanView[] = [
  { slug: 'esencial', name: 'ESENCIAL', rate: 900 },
  { slug: 'club', name: 'CLUB', rate: 1200 },
  { slug: 'elite', name: 'ÉLITE', rate: 1500 },
];
const FALLBACK_CAPACITIES = [200, 500, 700, 1000, 1500, 2000, 3000, 4000];

export async function Pricing() {
  let plans: PricingPlanView[] = FALLBACK_PLANS;
  let capacities: number[] = FALLBACK_CAPACITIES;

  try {
    const config = await getPricingConfig();
    if (config.plans.length > 0) {
      plans = config.plans.map((p) => ({ slug: p.slug, name: p.name, rate: p.rate }));
    }
    if (config.capacities.length >= 2) {
      capacities = config.capacities;
    }
  } catch {
    // dejamos los fallbacks; la landing es pública y no queremos romperla.
  }

  return <PricingClient plans={plans} capacities={capacities} />;
}
