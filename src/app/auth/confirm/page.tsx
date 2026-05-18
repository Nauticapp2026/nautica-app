'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Página puente entre el mail de confirmación de Supabase y la app mobile.
//
// Flujo:
//   1. La app mobile pasa emailRedirectTo = `${ADMIN_URL}/auth/confirm` al
//      llamar a supabase.auth.signUp.
//   2. Supabase manda mail con link a su /auth/v1/verify, que ya marca el
//      email como confirmado y 302 redirige a esta URL con los tokens en el
//      #fragment (flow implicit) o code en query (flow PKCE).
//   3. En mobile: armamos un deep link al custom scheme nauticaappmobile://
//      confirm#<tokens> y lo disparamos (auto + botón con user gesture,
//      porque Chrome 90+ bloquea el auto-redirect a custom schemes).
//   4. En desktop: el custom scheme no abre nada, pero el email ya quedó
//      confirmado en el paso 2 — mostramos un cartel de éxito invitando a
//      loguearse desde el celular.

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

function detectIsMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function ConfirmContent() {
  // Calculado lazy: en server da '' (no hay window), en cliente el valor real
  // se mantiene en este state desde el primer render post-hidratación.
  const [deepLink] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return buildDeepLink();
  });
  const [isMobile] = useState<boolean>(() => detectIsMobile());
  // Si después de unos segundos el user sigue acá, sugerimos que la app no
  // está instalada o que toque el botón manualmente.
  const [showFallback, setShowFallback] = useState(false);

  // El URLSearchParams del lado server (sin hash) — solo para detectar errors.
  const search = useSearchParams();
  const supabaseError = search.get('error');
  const supabaseErrorDesc = search.get('error_description');

  useEffect(() => {
    if (!deepLink || supabaseError || !isMobile) return;
    // Auto-intento al montar. Puede fallar silenciosamente en Chrome moderno
    // sin user gesture — por eso siempre mostramos el botón abajo.
    window.location.href = deepLink;
    const timer = window.setTimeout(() => setShowFallback(true), 1500);
    return () => window.clearTimeout(timer);
  }, [deepLink, supabaseError, isMobile]);

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

  if (!isMobile) {
    // Llegó al link desde la compu: el email ya se confirmó al pasar por
    // /auth/v1/verify, pero el custom scheme no abre nada acá. Mostramos
    // éxito explícito para que no quede mirando un spinner que no avanza.
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <CheckIcon />
        </div>
        <h1 className="mt-4 text-lg font-bold text-green-800">¡Email confirmado!</h1>
        <p className="mt-2 text-sm text-green-700">
          Tu cuenta quedó verificada. Abrí la app NauticApp en tu celular e iniciá sesión con tu
          mail y contraseña.
        </p>
        <p className="mt-4 text-xs text-gray-500">Ya podés cerrar esta pestaña.</p>
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

function CheckIcon() {
  return (
    <svg
      className="h-6 w-6 text-green-600"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
