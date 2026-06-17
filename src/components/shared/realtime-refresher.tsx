'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function RealtimeRefresher({ guarderiaId }: { guarderiaId: string }) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => router.refresh(), 500);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`dashboard-${guarderiaId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alertas',
          filter: `guarderia_id=eq.${guarderiaId}`,
        },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tareas', filter: `guarderia_id=eq.${guarderiaId}` },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'porteria',
          filter: `guarderia_id=eq.${guarderiaId}`,
        },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [guarderiaId, scheduleRefresh]);

  return null;
}
