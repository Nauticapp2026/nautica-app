'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { updatePassword, type ActionResult } from '@/app/actions/auth';
import { Logo } from '@/components/shared/logo';

const inputCls =
  'w-full rounded-[10px] border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#175861] focus:ring-1 focus:ring-[#175861]';

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updatePassword,
    null,
  );

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
      <div className="mb-6 flex justify-center">
        <Logo size={52} />
      </div>

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
    </div>
  );
}
