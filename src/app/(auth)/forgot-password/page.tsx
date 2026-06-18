'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const inputCls =
  'w-full rounded-[10px] border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#175861] focus:ring-1 focus:ring-[#175861]';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const { error: supabaseError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (supabaseError) {
        setError('No se pudo enviar el email. Intentá de nuevo.');
        return;
      }

      setSent(true);
    });
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
      <div className="mb-6 flex justify-center">
        <Image src="/logo-nauticapp.png" alt="NauticApp" width={174} height={60} priority />
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
        <form onSubmit={handleSubmit} className="space-y-4">
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
              type="email"
              placeholder="tu@email.com"
              required
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 w-full rounded-[10px] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: '#175861' }}
          >
            {isPending ? 'Enviando...' : 'Enviar link'}
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
