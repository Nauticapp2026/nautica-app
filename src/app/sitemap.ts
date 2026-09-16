import type { MetadataRoute } from 'next';

import { APP_URL } from '@/lib/seo';

/** `/sitemap.xml`: solo lo público. La app en sí no se indexa. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${APP_URL}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${APP_URL}/terminos`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${APP_URL}/privacidad`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${APP_URL}/eliminar-cuenta`, changeFrequency: 'yearly', priority: 0.1 },
  ];
}
