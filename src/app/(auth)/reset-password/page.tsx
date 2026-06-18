'use client';

import { Suspense, useActionState, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { updatePassword, type ActionResult } from '@/app/actions/auth';
import { Logo } from '@/components/shared/logo';
import { createClient } from '@/lib/supabase/client';

const inputCls =
  'w-full rounded-[10px] border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#175861] focus:ring-1 focus:ring-[#175861]';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [sessionReady, setSessionReady] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updatePassword,
    null,
  );

  useEffect(() => {
    async function setupSession() {
      const supabase = createClient();

      // PKCE flow: Supabase redirige con ?code=...
      const code = searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setSetupError('El link expiró o ya fue usado. Pedí uno nuevo.');
        } else {
          setSessionReady(true);
        }
        return;
      }

      // Implicit flow: tokens en el #fragment (access_token + type=recovery)
      const hash = window.location.hash.replace(/^#/, '');
      if (hash) {
        const params = Object.fromEntries(new URLSearchParams(hash));
        const { access_token, refresh_token, type } = params;
        if (access_token && refresh_token && type === 'recovery') {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) {
            setSetupError('El link expiró o ya fue usado. Pedí uno nuevo.');
          } else {
            setSessionReady(true);
          }
          return;
        }
      }

      setSetupError('Link inválido. Pedí uno nuevo desde el inicio de sesión.');
    }

    setupSession();
  }, [searchParams]);

  if (setupError) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-red-500">{setupError}</p>
        <Link
          href="/forgot-password"
          className="inline-block text-sm underline"
          style={{ color: '#669E9D' }}
        >
          Pedir nuevo link
        </Link>
      </div>
    );
  }

  if (!sessionReady) {
    return <p className="text-center text-sm text-gray-500">Verificando link…</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5 text-center">
        <h1 className="text-lg font-semibold" style={{ color: '#101828' }}>
          Elegí una nueva contraseña
        </h1>
        <p className="text-sm text-gray-500">Mínimo 8 caracteres.</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold" style={{ color: '#101828' }}>
          Nueva contraseña
        </label>
        <input
          name="password"
          type="password"
          placeholder="••••••••"
          required
          minLength={8}
          className={inputCls}
        />
        {state?.fieldErrors?.password && (
          <p className="text-sm text-red-500">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold" style={{ color: '#101828' }}>
          Confirmar contraseña
        </label>
        <input
          name="confirmPassword"
          type="password"
          placeholder="••••••••"
          required
          minLength={8}
          className={inputCls}
        />
        {state?.fieldErrors?.confirmPassword && (
          <p className="text-sm text-red-500">{state.fieldErrors.confirmPassword[0]}</p>
        )}
      </div>

      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-full rounded-[10px] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        style={{ background: '#175861' }}
      >
        {pending ? 'Guardando...' : 'Guardar contraseña'}
      </button>

      <p className="text-center text-sm">
        <Link
          href="/login"
          className="underline transition hover:opacity-80"
          style={{ color: '#669E9D' }}
        >
          Volver al login
        </Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
      <div className="mb-6 flex justify-center">
        <Logo size={52} />
      </div>
      <Suspense fallback={<p className="text-center text-sm text-gray-500">Cargando…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
