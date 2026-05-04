'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordReset, type ActionResult } from '@/app/actions/auth';
import { Logo } from '@/components/shared/logo';

const inputCls =
  'w-full rounded-[10px] border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#175861] focus:ring-1 focus:ring-[#175861]';

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    requestPasswordReset,
    null,
  );

  const sent = state !== null && !state.error && !state.fieldErrors;

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
      <div className="mb-6 flex justify-center">
        <Logo size={52} />
      </div>

      {sent ? (
        <div className="space-y-4 text-center">
          <h1 className="text-lg font-semibold" style={{ color: '#101828' }}>
            Revisá tu mail
          </h1>
          <p className="text-sm text-gray-500">
            Si existe una cuenta con ese email, te enviamos un link para elegir una nueva
            contraseña.
          </p>
          <Link
            href="/login"
            className="inline-block text-sm font-medium underline"
            style={{ color: '#669E9D' }}
          >
            Volver al login
          </Link>
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5 text-center">
            <h1 className="text-lg font-semibold" style={{ color: '#101828' }}>
              Restablecé tu contraseña
            </h1>
            <p className="text-sm text-gray-500">
              Ingresá tu email y te mandamos un link para elegir una nueva.
            </p>
          </div>

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

          {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 w-full rounded-[10px] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: '#175861' }}
          >
            {pending ? 'Enviando...' : 'Enviar link'}
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
      )}
    </div>
  );
}
