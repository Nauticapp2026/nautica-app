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
    let channel = supabase.channel(`dashboard-${guarderiaId}`);

    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `guarderia_id=eq.${guarderiaId}` },
        scheduleRefresh,
      );
    }

    channel.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
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

  return null;
}
