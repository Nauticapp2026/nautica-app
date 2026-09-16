import type { MetadataRoute } from 'next';

import { APP_URL, RUTAS_PRIVADAS } from '@/lib/seo';

/**
 * `/robots.txt`. Hasta el 2026-09-16 no hacía falta: toda la web estaba detrás
 * del pre-launch gate (Basic Auth) y ningún buscador podía verla. Ahora que es
 * pública, se indexa la landing y las páginas legales; las pantallas de la app
 * (login, dashboard, super admin, QR de portería, callbacks) se excluyen — no
 * tienen contenido para nadie que busque, y además llevan `noindex` en sus
 * layouts (ver lib/seo.ts).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [...RUTAS_PRIVADAS],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
