'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

// Esta página maneja los 3 flows posibles del mail/oauth de Supabase:
// - Implicit: tokens en el #fragment (default de Invite user con {{ .ConfirmationURL }})
// - OTP: ?token_hash=...&type=... (custom template con {{ .TokenHash }})
// - PKCE: ?code=...
// Es client-side porque el fragment NO llega al server.
export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const next = searchParams.get('next') ?? '/dashboard';

    async function handle() {
      // 1) Implicit flow — tokens en el fragment
      const hash = window.location.hash;
      if (hash && hash.length > 1) {
        const fragmentParams = new URLSearchParams(hash.slice(1));
        const accessToken = fragmentParams.get('access_token');
        const refreshToken = fragmentParams.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!error) {
            router.replace(next);
            return;
          }
          setErrorMsg(error.message);
          return;
        }
      }

      // 2) OTP flow — token_hash + type en query
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type') as EmailOtpType | null;
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (!error) {
          router.replace(next);
          return;
        }
        setErrorMsg(error.message);
        return;
      }

      // 3) PKCE flow — code en query
      const code = searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace(next);
          return;
        }
        setErrorMsg(error.message);
        return;
      }

      // Nada matcheó
      router.replace('/login?error=auth_callback_failed');
    }

    handle();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        {errorMsg ? (
          <>
            <p className="text-sm font-semibold text-red-600">No se pudo completar el ingreso</p>
            <p className="mt-2 text-xs text-gray-500">{errorMsg}</p>
          </>
        ) : (
          <p className="text-sm text-gray-500">Procesando autenticación…</p>
        )}
      </div>
    </div>
  );
}
