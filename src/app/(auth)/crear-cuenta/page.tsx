'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Smartphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getPostSignupAccess } from '@/app/actions/auth';

const inputCls =
  'h-12 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

type DoneState = null | 'mobile' | 'no_membership';

export default function CrearCuentaPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<DoneState>(null);

  // Para roles que no usan la web (mobile / sin membership), cerramos la sesión
  // web en cuanto llegamos a la pantalla final. Así no queda una sesión colgada
  // que les permita navegar a /dashboard u otras rutas. El gate server-side
  // (DashboardLayout → /no-access) sigue siendo la línea de defensa real.
  useEffect(() => {
    if (done === 'mobile' || done === 'no_membership') {
      const supabase = createClient();
      supabase.auth.signOut().catch(() => null);
    }
  }, [done]);

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

    // Decidimos a dónde mandarlo según su rol/membership.
    const access = await getPostSignupAccess();
    setLoading(false);
    if (access.kind === 'web') {
      router.replace(access.redirectTo);
      router.refresh();
      return;
    }
    if (access.kind === 'mobile') {
      setDone('mobile');
      return;
    }
    if (access.kind === 'no_membership') {
      setDone('no_membership');
      return;
    }
    // no_session: algo raro, redirigimos a login
    router.replace('/login');
  }

  if (done === 'mobile') {
    return (
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: '#E6F4F1' }}
          >
            <Smartphone className="h-8 w-8" style={{ color: '#175861' }} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#101828' }}>
            ¡Listo!
          </h1>
          <p className="text-sm text-gray-600">
            Descargá la app <strong>NauticApp</strong> en tu celular y entrá con tu email y la
            contraseña que acabás de crear.
          </p>
          <p className="text-xs text-gray-400">
            Esta versión web está reservada para el equipo administrativo de la guardería.
          </p>
        </div>
      </div>
    );
  }

  if (done === 'no_membership') {
    return (
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: '#E6F4F1' }}
          >
            <CheckCircle className="h-8 w-8" style={{ color: '#175861' }} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#101828' }}>
            ¡Contraseña configurada!
          </h1>
          <p className="text-sm text-gray-600">
            Tu cuenta está lista. En cuanto un administrador te agregue a su guardería vas a poder
            ingresar.
          </p>
        </div>
      </div>
    );
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
