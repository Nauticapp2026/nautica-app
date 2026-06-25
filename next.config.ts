import type { NextConfig } from 'next';

// Headers de seguridad "blandos": hardening de bajo riesgo que no afecta el
// runtime de la app. NO incluye Content-Security-Policy a propósito — una CSP
// estricta rompería el SDK de Payway (decidir.js), el widget de Calendly del
// onboarding, los estilos inline y Supabase realtime. La CSP se evaluará aparte
// en modo Report-Only antes de endurecerla.
const securityHeaders = [
  // Forzar HTTPS en navegadores. Sin `preload` para no comprometer subdominios
  // de forma irreversible.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Evitar MIME sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Anti-clickjacking: permitir framing solo del mismo origen.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // No filtrar la URL completa al navegar a otro origen.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Deshabilitar APIs sensibles del navegador que la web no usa.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
