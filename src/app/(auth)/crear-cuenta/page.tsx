'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const inputCls =
  'h-12 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

export default function CrearCuentaPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = password.length >= 6 && password === confirm;

  async function handleSubmit() {
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError('No se pudo configurar la contraseña. El enlace puede haber expirado.');
      return;
    }
    // Redirigimos al dashboard: si el usuario tiene rol con acceso web
    // (admin/operario/super_admin) entra directo; si no, el gate lo manda a
    // /no-access con el mensaje de "usá la app mobile".
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
      <h1 className="mb-1 text-xl font-bold" style={{ color: '#101828' }}>
        Configurá tu contraseña
      </h1>
      <p className="mb-6 text-sm text-gray-400">Elegí una contraseña para acceder a NauticApp.</p>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
            Nueva contraseña
          </label>
          <input
            type="password"
            className={inputCls}
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
            Confirmar contraseña
          </label>
          <input
            type="password"
            className={inputCls}
            placeholder="Repetí la contraseña"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!isValid || loading}
          className="mt-2 h-12 w-full rounded-[10px] text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: '#175861' }}
        >
          {loading ? 'Guardando...' : 'Confirmar contraseña'}
        </button>
      </div>
    </div>
  );
}
