'use client';

import { Suspense, useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Página puente entre el mail de confirmación/recovery de Supabase y la app mobile.
//
// Flujo signup:
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
//
// Flujo recovery (type=recovery en el hash):
//   No redirigimos a la app — mostramos un formulario "Nueva contraseña"
//   en el browser para que el usuario cambie su contraseña.

const APP_SCHEME = 'nauticaappmobile';
const APP_DEEP_LINK_PATH = 'confirm';

function parseHashParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return {};
  return Object.fromEntries(new URLSearchParams(hash));
}

function buildDeepLink(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash.replace(/^#/, '');
  if (hash) return `${APP_SCHEME}://${APP_DEEP_LINK_PATH}#${hash}`;
  const query = window.location.search.replace(/^\?/, '');
  if (query) return `${APP_SCHEME}://${APP_DEEP_LINK_PATH}?${query}`;
  return '';
}

function detectIsMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// ─── Formulario de nueva contraseña (solo para type=recovery) ────────────────

function RecoveryForm({
  accessToken,
  refreshToken,
}: {
  accessToken: string;
  refreshToken: string;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    startTransition(async () => {
      const supabase = createClient();

      // Establecer sesión con los tokens del hash para poder llamar updateUser.
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        setError('El link expiró o ya fue usado. Pedí un nuevo link desde la app.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      // Cerrar sesión para que el usuario vuelva a loguearse desde la app.
      await supabase.auth.signOut();
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <CheckIcon />
        </div>
        <h1 className="mt-4 text-lg font-bold text-green-800">¡Contraseña actualizada!</h1>
        <p className="mt-2 text-sm text-green-700">
          Ya podés volver a la app NauticApp e iniciar sesión con tu nueva contraseña.
        </p>
        <p className="mt-4 text-xs text-gray-500">Ya podés cerrar esta pestaña.</p>
      </div>
    );
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-bold text-[#101828]">Nueva contraseña</h1>
      <p className="mt-1 text-sm text-gray-500">
        Ingresá tu nueva contraseña para acceder a NauticApp.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#101828]">Nueva contraseña</label>
          <input
            type="password"
            className={inputCls}
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-[#101828]">Confirmá la contraseña</label>
          <input
            type="password"
            className={inputCls}
            placeholder="Repetí la contraseña"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 h-12 w-full rounded-xl bg-[#175861] text-sm font-semibold text-white transition-colors hover:bg-[#124850] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </form>
    </div>
  );
}

// ─── Contenido principal ──────────────────────────────────────────────────────

function ConfirmContent() {
  const hashParams = useState<Record<string, string>>(() => parseHashParams())[0];
  const isRecovery = hashParams['type'] === 'recovery';

  const [deepLink] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return buildDeepLink();
  });
  const [isMobile] = useState<boolean>(() => detectIsMobile());
  const [showFallback, setShowFallback] = useState(false);

  const search = useSearchParams();
  const supabaseError = search.get('error');
  const supabaseErrorDesc = search.get('error_description');

  useEffect(() => {
    if (isRecovery) return; // recovery no redirige a la app
    if (!deepLink || supabaseError || !isMobile) return;
    window.location.href = deepLink;
    const timer = window.setTimeout(() => setShowFallback(true), 1500);
    return () => window.clearTimeout(timer);
  }, [deepLink, supabaseError, isMobile, isRecovery]);

  // ── Error de Supabase (link inválido, expirado, etc.) ──
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

  // ── Flujo recovery: mostrar formulario de nueva contraseña ──
  if (isRecovery) {
    const accessToken = hashParams['access_token'] ?? '';
    const refreshToken = hashParams['refresh_token'] ?? '';

    if (!accessToken || !refreshToken) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <h1 className="text-lg font-bold text-red-700">Link inválido</h1>
          <p className="mt-2 text-sm text-red-700">
            El link de recuperación no es válido. Pedí uno nuevo desde la app NauticApp.
          </p>
        </div>
      );
    }

    return <RecoveryForm accessToken={accessToken} refreshToken={refreshToken} />;
  }

  // ── Flujo signup / otros: deep link a la app ──

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

// ─── Íconos ───────────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

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
