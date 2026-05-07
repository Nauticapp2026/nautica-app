// =============================================================================
// Geocoding con Nominatim (OpenStreetMap).
//
// Para la pantalla de Clima en la app móvil (Open-Meteo + mapa Windy)
// necesitamos lat/long de cada guardería. En lugar de pedirle al admin que
// las cargue a mano, las derivamos automáticamente a partir de los campos
// que ya completa al editar la configuración: direccion + ciudad + provincia.
//
// Nominatim es gratis, sin API key, rate-limit 1 req/seg. Para nuestro caso
// (un puñado de clubs en Argentina) sobra. La política de uso exige un
// User-Agent identificable y se respeta acá.
//
// Si la consulta falla (red, sin matches, JSON inválido) devuelve null y el
// caller deja `latitud`/`longitud` sin tocar.
// =============================================================================

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export type Coords = { lat: number; lng: number };

export async function geocodeAddress(opts: {
  direccion: string | null;
  ciudad: string | null;
  provincia: string | null;
}): Promise<Coords | null> {
  const parts = [opts.direccion, opts.ciudad, opts.provincia, 'Argentina']
    .filter((p): p is string => !!p && p.trim().length > 0)
    .map((p) => p.trim());

  if (parts.length === 0) return null;

  const query = parts.join(', ');
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ar`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NauticaApp/1.0 (https://nautica-app.vercel.app)',
        Accept: 'application/json',
      },
      // Nominatim no es crítico — si tarda demasiado, no bloqueamos el save.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const arr = (await res.json()) as { lat?: string; lon?: string }[];
    if (!Array.isArray(arr) || arr.length === 0) return null;

    const first = arr[0];
    if (!first?.lat || !first?.lon) return null;

    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}
