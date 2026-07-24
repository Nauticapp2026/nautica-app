'use client';

import { Suspense, useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/shared/logo';
import { PasswordChecks, PasswordInput } from '@/components/shared/password-input';
import { createClient } from '@/lib/supabase/client';

const inputCls =
  'w-full rounded-[10px] border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#175861] focus:ring-1 focus:ring-[#175861]';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [sessionReady, setSessionReady] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function setupSession() {
      // Supabase o el callback redirigen con ?error=... cuando el link expiró
      const supabaseError = searchParams.get('error_code') ?? searchParams.get('error');
      if (supabaseError) {
        if (supabaseError === 'otp_expired') {
          setSetupError('El link expiró. Los links de recuperación son válidos por 1 hora.');
        } else {
          setSetupError('El link es inválido o ya fue usado. Pedí uno nuevo.');
        }
        return;
      }

      const supabase = createClient();

      // Camino principal: el Route Handler /api/auth/callback ya hizo el exchange
      // y estableció la sesión en cookies antes de redirigir aquí.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
        return;
      }

      // Fallback implicit flow: tokens en el #fragment (access_token + type=recovery)
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setFormError('Las contraseñas no coinciden.');
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setFormError('No se pudo actualizar la contraseña. ' + error.message);
        return;
      }
      await supabase.auth.signOut();
      setDone(true);
    });
  }

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

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-lg font-semibold" style={{ color: '#101828' }}>
          ¡Contraseña actualizada!
        </h1>
        <p className="text-sm text-gray-500">Ya podés iniciar sesión con tu nueva contraseña.</p>
        <Link
          href="/login"
          className="inline-block text-sm font-medium underline"
          style={{ color: '#669E9D' }}
        >
          Ir al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        <PasswordInput
          placeholder="••••••••"
          required
          minLength={8}
          className={inputCls}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold" style={{ color: '#101828' }}>
          Confirmar contraseña
        </label>
        <PasswordInput
          placeholder="••••••••"
          required
          minLength={8}
          className={inputCls}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <PasswordChecks password={password} confirm={confirm} />

      {formError && <p className="text-sm text-red-500">{formError}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 w-full rounded-[10px] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        style={{ background: '#175861' }}
      >
        {isPending ? 'Guardando...' : 'Guardar contraseña'}
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
