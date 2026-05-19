import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchMareasSHN, type MareasMes } from '@/lib/shn';
import { PUERTOS_SHN } from '@/lib/shn-puertos';

export const dynamic = 'force-dynamic';

// Cache TTL: el SHN publica predicciones para el ano en curso y no las
// modifica, asi que un dia de TTL es ultraconservador. Si una marea ya quedo
// en cache, mientras el (puerto, anio, mes) no cambie, devolvemos lo
// cacheado y no le pegamos al SHN.
const CACHE_TTL_HOURS = 24;

const querySchema = z.object({
  puerto: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[A-Z]+$/, 'Codigo de puerto invalido (letras mayusculas).'),
  anio: z.coerce.number().int().min(2020).max(2099).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
});

type CacheRow = {
  puerto: string;
  anio: number;
  mes: number;
  payload: MareasMes;
  fetched_at: string;
};

function defaultAnioMes(): { anio: number; mes: number } {
  const d = new Date();
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

function cacheStale(fetchedAt: string): boolean {
  const ts = Date.parse(fetchedAt);
  if (!Number.isFinite(ts)) return true;
  const ageHours = (Date.now() - ts) / (1000 * 60 * 60);
  return ageHours > CACHE_TTL_HOURS;
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    puerto: searchParams.get('puerto'),
    anio: searchParams.get('anio') ?? undefined,
    mes: searchParams.get('mes') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Parametros invalidos.' },
      { status: 400 },
    );
  }

  const { puerto } = parsed.data;
  if (!PUERTOS_SHN.find((p) => p.id === puerto)) {
    return NextResponse.json({ error: `Puerto desconocido: ${puerto}` }, { status: 400 });
  }

  const { anio: defAnio, mes: defMes } = defaultAnioMes();
  const anio = parsed.data.anio ?? defAnio;
  const mes = parsed.data.mes ?? defMes;

  const admin = createAdminClient();

  // 1) Ver si tenemos cache fresco.
  const { data: existing, error: selErr } = await admin
    .from('mareas_cache')
    .select('puerto, anio, mes, payload, fetched_at')
    .eq('puerto', puerto)
    .eq('anio', anio)
    .eq('mes', mes)
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

  // 2) Miss / stale → pegarle al SHN.
  let mareas: MareasMes;
  try {
    mareas = await fetchMareasSHN(puerto, anio, mes);
  } catch (err) {
    // Si tenemos cache stale, devolvemos eso antes que romper la pantalla.
    if (existing) {
      return NextResponse.json({
        ...existing.payload,
        fromCache: true,
        stale: true,
        fetched_at: existing.fetched_at,
      });
    }
    const msg = err instanceof Error ? err.message : 'Error desconocido en SHN.';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  // 3) Upsert en cache.
  const { error: upErr } = await admin
    .from('mareas_cache')
    .upsert(
      { puerto, anio, mes, payload: mareas, fetched_at: new Date().toISOString() },
      { onConflict: 'puerto,anio,mes' },
    );
  if (upErr) {
    // No bloquea la respuesta — solo loggeamos.
    console.warn('[mareas] no se pudo guardar cache:', upErr.message);
  }

  return NextResponse.json({ ...mareas, fromCache: false });
}
