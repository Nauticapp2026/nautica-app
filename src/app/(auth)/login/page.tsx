'use client';

import { useActionState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { login, type ActionResult } from '@/app/actions/auth';

const inputCls =
  'w-full rounded-[10px] border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#175861] focus:ring-1 focus:ring-[#175861]';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(login, null);

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
      <div className="mb-6 flex justify-center">
        <Image src="/logo-nauticapp.png" alt="NauticApp" width={174} height={60} priority />
      </div>

      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold" style={{ color: '#101828' }}>
            Email
          </label>
          <input
            name="email"
            type="email"
            placeholder="tu@email.com"
            required
            className={inputCls}
          />
          {state?.fieldErrors?.email && (
            <p className="text-sm text-red-500">{state.fieldErrors.email[0]}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold" style={{ color: '#101828' }}>
            Contraseña
          </label>
          <input
            name="password"
            type="password"
            placeholder="••••••••"
            required
            className={inputCls}
          />
          {state?.fieldErrors?.password && (
            <p className="text-sm text-red-500">{state.fieldErrors.password[0]}</p>
          )}
        </div>

        {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 w-full rounded-[10px] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ background: '#175861' }}
        >
          {pending ? 'Ingresando...' : 'Ingresar'}
        </button>

        <div className="space-y-1 pt-1 text-center">
          <p className="text-sm">
            <span className="text-gray-500">¿No tienes cuenta? </span>
            <Link
              href="/onboarding"
              className="font-medium underline transition hover:opacity-80"
              style={{ color: '#669E9D' }}
            >
              Regístrese
            </Link>
          </p>
          <p className="text-sm">
            <Link
              href="/forgot-password"
              className="underline transition hover:opacity-80"
              style={{ color: '#669E9D' }}
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
