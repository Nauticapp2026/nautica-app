'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Página puente entre el mail de confirmación de Supabase y la app mobile.
//
// Flujo:
//   1. La app mobile pasa emailRedirectTo = `${ADMIN_URL}/auth/confirm` al
//      llamar a supabase.auth.signUp.
//   2. Supabase manda mail con link a su /auth/v1/verify, que 302 redirige
//      a esta URL con los tokens en el #fragment (flow implicit) o code en
//      query (flow PKCE).
//   3. Acá reconstruimos los tokens y armamos un deep link al custom scheme
//      de la app: nauticaappmobile://confirm#<tokens>.
//   4. Auto-disparamos window.location.href con ese deep link al montar.
//      Chrome 90+ bloquea redirects automáticos a custom schemes sin user
//      gesture, así que también ofrecemos un botón "Abrir NauticApp" que el
//      user toca manualmente — ahí sí hay user gesture y el OS abre la app.

const APP_SCHEME = 'nauticaappmobile';
const APP_DEEP_LINK_PATH = 'confirm';

function buildDeepLink(): string {
  // Implicit flow: tokens en el hash. Lo pasamos tal cual al deep link.
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash.replace(/^#/, '');
  if (hash) return `${APP_SCHEME}://${APP_DEEP_LINK_PATH}#${hash}`;
  // PKCE / OTP flow: code (o token_hash) en query. La app lo procesa también.
  const query = window.location.search.replace(/^\?/, '');
  if (query) return `${APP_SCHEME}://${APP_DEEP_LINK_PATH}?${query}`;
  return '';
}

function ConfirmContent() {
  // Calculado lazy: en server da '' (no hay window), en cliente el valor real
  // se mantiene en este state desde el primer render post-hidratación.
  const [deepLink] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return buildDeepLink();
  });
  // Si después de unos segundos el user sigue acá, sugerimos que la app no
  // está instalada o que toque el botón manualmente.
  const [showFallback, setShowFallback] = useState(false);

  // El URLSearchParams del lado server (sin hash) — solo para detectar errors.
  const search = useSearchParams();
  const supabaseError = search.get('error');
  const supabaseErrorDesc = search.get('error_description');

  useEffect(() => {
    if (!deepLink || supabaseError) return;
    // Auto-intento al montar. Puede fallar silenciosamente en Chrome moderno
    // sin user gesture — por eso siempre mostramos el botón abajo.
    window.location.href = deepLink;
    const timer = window.setTimeout(() => setShowFallback(true), 1500);
    return () => window.clearTimeout(timer);
  }, [deepLink, supabaseError]);

  if (supabaseError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <h1 className="text-lg font-bold text-red-700">No pudimos confirmar tu email</h1>
        <p className="mt-2 text-sm text-red-700">
          {supabaseErrorDesc?.replaceAll('+', ' ') ?? supabaseError}
        </p>
        <p className="mt-4 text-xs text-gray-500">
          Probá registrarte de nuevo desde la app NauticApp.
        </p>
      </div>
    );
  }

  if (!deepLink) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
        <h1 className="text-lg font-bold text-[#101828]">Link inválido</h1>
        <p className="mt-2 text-sm text-gray-600">
          Este link no parece ser un mail de confirmación válido. Probá registrarte de nuevo desde
          la app NauticApp.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F0F0]">
        <Spinner />
      </div>
      <h1 className="mt-4 text-lg font-bold text-[#101828]">Abriendo NauticApp</h1>
      <p className="mt-2 text-sm text-gray-600">
        Si la app no se abrió automáticamente, tocá el botón.
      </p>

      <a
        href={deepLink}
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#175861] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#124850]"
      >
        Abrir NauticApp
      </a>

      {showFallback ? (
        <p className="mt-4 text-xs text-gray-400">
          ¿No tenés la app instalada? Pedila al equipo de NauticApp para descargarla.
        </p>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-6 w-6 animate-spin text-[#175861]"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ConfirmPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F9FAFB] px-4 py-10">
      <div className="w-full max-w-md">
        <Suspense fallback={<p className="text-center text-sm text-gray-500">Cargando…</p>}>
          <ConfirmContent />
        </Suspense>
      </div>
    </main>
  );
}
