import { getPricingConfig } from '@/lib/pricing/config';
import { PricingEditor } from './pricing-editor';

export const dynamic = 'force-dynamic';

export default async function SuperAdminPricingPage() {
  const { plans, capacities } = await getPricingConfig();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#175861]">Pricing de la landing</h1>
        <p className="mt-1 text-sm text-[#677B85]">
          El precio que se muestra en la landing es{' '}
          <code className="rounded bg-gray-100 px-1 font-mono text-xs">rate × capacidad</code>. La
          capacidad la elige el visitante con el slider.
        </p>
      </div>

      <PricingEditor plans={plans} capacities={capacities} />
    </div>
  );
}
