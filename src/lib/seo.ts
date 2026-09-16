import type { Metadata } from 'next';

/** Dominio canónico (con www — ver project_dominio_canonico). */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.nauticapp.club').replace(
  /\/$/,
  '',
);

/**
 * Prefijos de la app que no deben aparecer en buscadores. Se usan en
 * `robots.txt` (Disallow) y, además, cada uno de estos árboles exporta
 * `NOINDEX` desde su layout: el meta es la señal que Google respeta aunque
 * llegue a la página por un link, el robots.txt solo le pide no recorrerla.
 *
 * Público a propósito (indexable): `/`, `/terminos`, `/privacidad`,
 * `/eliminar-cuenta` (Apple/Google exigen que esa página sea accesible).
 */
export const RUTAS_PRIVADAS = [
  // (auth)
  '/login',
  '/signup',
  '/crear-cuenta',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
  // callbacks de Supabase
  '/auth/',
  '/api/',
  // (dashboard)
  '/dashboard',
  '/usuarios',
  '/ventas',
  '/cobranzas',
  '/facturacion',
  '/espacios',
  '/tarifario',
  '/comunicaciones',
  '/publicaciones',
  '/solicitudes-socio',
  '/configuracion',
  '/tareas',
  // plataforma y otros
  '/super-admin',
  '/onboarding',
  '/no-access',
  '/qr/',
] as const;

/** `export const metadata = NOINDEX` en el layout de cada árbol privado. */
export const NOINDEX: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};
