import { getPricingConfig, getPricingFeaturesGrid } from '@/lib/pricing/config';
import { PricingEditor } from './pricing-editor';

export const dynamic = 'force-dynamic';

export default async function SuperAdminPricingPage() {
  const [{ plans, capacities }, featuresGrid] = await Promise.all([
    getPricingConfig(),
    getPricingFeaturesGrid(),
  ]);

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div>
        <h1 className="page-title">Pricing de la landing</h1>
        <p className="page-subtitle mt-1">
          El precio que se muestra en la landing es{' '}
          <code className="rounded bg-gray-100 px-1 font-mono text-xs">rate × capacidad</code>. La
          capacidad la elige el visitante con el slider.
        </p>
      </div>

      <PricingEditor plans={plans} capacities={capacities} featuresGrid={featuresGrid} />
    </div>
  );
}
