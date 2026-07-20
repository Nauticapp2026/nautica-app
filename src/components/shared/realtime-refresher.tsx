'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const REALTIME_TABLES = [
  'alertas',
  'tareas',
  'porteria',
  'actividad_porteria',
  'solicitudes_membership',
  'memberships',
  'embarcaciones',
  'espacios',
  'facturacion',
  'solicitudes_lavado',
] as const;

export function RealtimeRefresher({ guarderiaId }: { guarderiaId: string }) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => router.refresh(), 500);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function setup() {
      // CRÍTICO: Realtime respeta RLS, y todas las policies de estas tablas
      // dependen de auth.uid(). El canal DEBE autenticarse con el JWT del
      // usuario ANTES de suscribir; si se suscribe primero (como anon), RLS
      // bloquea TODOS los eventos postgres_changes y nada refresca al instante.
      // (Verificado: setAuth después de subscribe no entrega eventos.)
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      let ch = supabase.channel(`dashboard-${guarderiaId}`);
      for (const table of REALTIME_TABLES) {
        ch = ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `guarderia_id=eq.${guarderiaId}` },
          scheduleRefresh,
        );
      }
      ch.subscribe();
      channel = ch;
    }

    void setup();

    // Mantener el token fresco tras cada refresh (~1h) para no perder eventos.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [guarderiaId, scheduleRefresh]);

  // Refresh cuando el usuario vuelve a la pestaña (cubre tablas sin guarderia_id directo)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [scheduleRefresh]);

  // Red de seguridad por polling: si el socket de Realtime se corta en
  // silencio (proxy/red del club, laptop suspendida, etc.) y no reconecta,
  // el tablero quedaba viejo hasta que alguien recargaba a mano. Mismo patrón
  // "belt and suspenders" que ya usa el home del socio en mobile
  // (`refetchInterval: 30_000` además de su propia suscripción Realtime).
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    }, 20_000);
    return () => clearInterval(interval);
  }, [scheduleRefresh]);

  return null;
}
