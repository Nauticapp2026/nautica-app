import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { type AlturasPayload, fetchAlturasArcGIS } from '@/lib/arcgis-alturas';

export const dynamic = 'force-dynamic';

// Prefectura publica una medicion por hora. 30 min de TTL nos deja al dia sin
// pegarle a ArcGIS en cada apertura de la pantalla Clima > Alturas.
const CACHE_TTL_MINUTES = 30;

// La capa cubre todo el pais en una sola query, asi que el cache es una unica
// fila. La clave existe solo para que el upsert tenga sobre que conflictuar.
const CACHE_KEY = 'dsig_altura_rios';

type CacheRow = {
  clave: string;
  payload: AlturasPayload;
  fetched_at: string;
};

function cacheStale(fetchedAt: string): boolean {
  const ts = Date.parse(fetchedAt);
  if (!Number.isFinite(ts)) return true;
  return (Date.now() - ts) / (1000 * 60) > CACHE_TTL_MINUTES;
}

export async function GET(): Promise<Response> {
  const admin = createAdminClient();

  // 1) Cache fresco.
  const { data: existing, error: selErr } = await admin
    .from('alturas_cache')
    .select('clave, payload, fetched_at')
    .eq('clave', CACHE_KEY)
    .maybeSingle<CacheRow>();

  if (selErr) {
    return NextResponse.json(
      { error: `Error consultando cache: ${selErr.message}` },
      { status: 500 },
    );
  }

  if (existing && !cacheStale(existing.fetched_at)) {
    return NextResponse.json({
      ...existing.payload,
      fromCache: true,
      fetched_at: existing.fetched_at,
    });
  }

  // 2) Miss / stale → ArcGIS.
  let alturas: AlturasPayload;
  try {
    alturas = await fetchAlturasArcGIS();
  } catch (err) {
    // Antes que romper la pantalla, devolvemos el cache viejo marcado stale.
    if (existing) {
      return NextResponse.json({
        ...existing.payload,
        fromCache: true,
        stale: true,
        fetched_at: existing.fetched_at,
      });
    }
    const msg = err instanceof Error ? err.message : 'Error desconocido en ArcGIS.';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  // 3) Upsert.
  const { error: upErr } = await admin
    .from('alturas_cache')
    .upsert(
      { clave: CACHE_KEY, payload: alturas, fetched_at: new Date().toISOString() },
      { onConflict: 'clave' },
    );
  if (upErr) {
    // No bloquea la respuesta — solo loggeamos.
    console.warn('[alturas] no se pudo guardar cache:', upErr.message);
  }

  return NextResponse.json({ ...alturas, fromCache: false });
}
