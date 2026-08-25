// Cliente del Feature Service "DSIG_Altura_Rios" de Prefectura Naval Argentina.
//
// Item: af05ec8b076e4fb09eb988c34a055eb5 en prefectura.maps.arcgis.com.
// El servicio NO es publico: un GET anonimo devuelve
// {"error":{"code":499,"message":"Token Required"}}. El item esta compartido
// solo con el grupo "NAUTICAPP", asi que hace falta un usuario de ArcGIS que
// pertenezca a ese grupo. Las credenciales viven server-side y la app mobile
// consume /api/alturas, nunca ArcGIS directo.
//
// Auth soportada, en orden de preferencia:
//   1. OAuth2 client_credentials  → ARCGIS_CLIENT_ID + ARCGIS_CLIENT_SECRET
//   2. Named user (generateToken) → ARCGIS_USERNAME + ARCGIS_PASSWORD

const DEFAULT_LAYER_URL =
  'https://services.arcgis.com/Y0KX4hdfebAc6slH/arcgis/rest/services/DSIG_Altura_Rios/FeatureServer/0';

const LAYER_URL = process.env.ARCGIS_ALTURAS_LAYER_URL ?? DEFAULT_LAYER_URL;
const OAUTH_TOKEN_URL = 'https://www.arcgis.com/sharing/rest/oauth2/token';
const GENERATE_TOKEN_URL = 'https://www.arcgis.com/sharing/rest/generateToken';

/** Los tokens de ArcGIS duran hasta 2 semanas; pedimos 60 min y renovamos. */
const TOKEN_TTL_MINUTES = 60;
/** Margen para no usar un token que expira mientras viaja el request. */
const TOKEN_SKEW_MS = 60_000;

const FETCH_TIMEOUT_MS = 15_000;

export class ArcGisError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ArcGisError';
  }
}

// ---------------------------------------------------------------------------
// Tipos que consume la app mobile (lib/alturas.ts es el espejo de esto).
// ---------------------------------------------------------------------------

export type EstadoAltura = 'crece' | 'baja' | 'estacionado' | 'sin_dato';

export type EstacionAltura = {
  codigo: number;
  puerto: string;
  rio: string;
  altura: number | null;
  estado: EstadoAltura;
  variacion: number | null;
  ventanaHoras: number | null;
  media: number | null;
  alerta: number | null;
  evacuacion: number | null;
  anterior: number | null;
  maxima: number | null;
  minima: number | null;
  latitud: number | null;
  longitud: number | null;
  fecha: string | null;
};

export type AlturasPayload = {
  estaciones: EstacionAltura[];
  actualizado: string | null;
};

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Expone el reset para tests y para forzar renovacion tras un 498/499. */
export function resetArcGisToken(): void {
  cachedToken = null;
}

async function postForm(url: string, params: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error de red';
    throw new ArcGisError(`No se pudo contactar a ArcGIS: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new ArcGisError(`ArcGIS respondio HTTP ${res.status}`, res.status);
  return res.json();
}

/**
 * ArcGIS devuelve HTTP 200 incluso en los errores — el fallo viene dentro del
 * body como `{ error: { code, message } }`. Hay que chequearlo a mano.
 */
function unwrapArcGisError(json: unknown): void {
  if (typeof json !== 'object' || json === null) return;
  const err = (json as { error?: { code?: number; message?: string } }).error;
  if (!err) return;
  throw new ArcGisError(err.message ?? 'Error desconocido de ArcGIS', err.code);
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_SKEW_MS) {
    return cachedToken.token;
  }

  const clientId = process.env.ARCGIS_CLIENT_ID;
  const clientSecret = process.env.ARCGIS_CLIENT_SECRET;
  const username = process.env.ARCGIS_USERNAME;
  const password = process.env.ARCGIS_PASSWORD;

  let token: string;
  let expiresAt: number;

  if (clientId && clientSecret) {
    const json = await postForm(OAUTH_TOKEN_URL, {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      expiration: String(TOKEN_TTL_MINUTES),
      f: 'json',
    });
    unwrapArcGisError(json);
    const { access_token: accessToken, expires_in: expiresIn } = json as {
      access_token?: string;
      expires_in?: number;
    };
    if (!accessToken) throw new ArcGisError('ArcGIS no devolvio access_token.');
    token = accessToken;
    expiresAt = Date.now() + (expiresIn ?? TOKEN_TTL_MINUTES * 60) * 1000;
  } else if (username && password) {
    const json = await postForm(GENERATE_TOKEN_URL, {
      username,
      password,
      // ArcGIS exige referer cuando el token es client-scoped por referer.
      referer: process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.nauticapp.club',
      expiration: String(TOKEN_TTL_MINUTES),
      f: 'json',
    });
    unwrapArcGisError(json);
    const { token: t, expires } = json as { token?: string; expires?: number };
    if (!t) throw new ArcGisError('ArcGIS no devolvio token.');
    token = t;
    // `expires` viene en epoch ms.
    expiresAt = typeof expires === 'number' ? expires : Date.now() + TOKEN_TTL_MINUTES * 60 * 1000;
  } else {
    throw new ArcGisError(
      'Faltan credenciales de ArcGIS. Setear ARCGIS_CLIENT_ID + ARCGIS_CLIENT_SECRET, o ARCGIS_USERNAME + ARCGIS_PASSWORD.',
    );
  }

  cachedToken = { token, expiresAt };
  return token;
}

// ---------------------------------------------------------------------------
// Query + normalizacion
// ---------------------------------------------------------------------------

type RawFeature = {
  attributes: Record<string, unknown>;
};

/**
 * Prefectura usa 999.99 como centinela de "no hay umbral definido" en ALERTA y
 * EVACUACION (4 de las 90 estaciones). Lo mapeamos a null para que la UI no
 * muestre un umbral falso ni dispare el semaforo de alerta.
 */
const SIN_UMBRAL = 999;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function umbral(v: unknown): number | null {
  const n = num(v);
  return n === null || n >= SIN_UMBRAL ? null : n;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Los campos Date de ArcGIS vienen como epoch en milisegundos. */
function fechaIso(v: unknown): string | null {
  const n = num(v);
  if (n === null || n <= 0) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapEstado(raw: string): EstadoAltura {
  const v = raw.toUpperCase().replace(/\./g, '').trim();
  if (v === 'CRECE') return 'crece';
  if (v === 'BAJA') return 'baja';
  if (v === 'ESTAC') return 'estacionado';
  return 'sin_dato'; // "S/E." y cualquier valor nuevo que agregue Prefectura
}

function mapFeature(f: RawFeature): EstacionAltura {
  const a = f.attributes;
  const estado = mapEstado(str(a.estado));
  return {
    codigo: num(a.cod_puerto) ?? num(a.objectid) ?? 0,
    puerto: str(a.puerto),
    rio: str(a.rio),
    // Cuando no hay medicion, Prefectura deja REGISTRO en null y ESTADO en "S/E.".
    altura: estado === 'sin_dato' ? null : num(a.registro),
    estado,
    variacion: num(a.variacion),
    ventanaHoras: num(a.tiempo),
    media: num(a.media),
    alerta: umbral(a.alerta),
    evacuacion: umbral(a.evacuacion),
    anterior: num(a.anterior),
    maxima: num(a.maxima),
    minima: num(a.minima),
    latitud: num(a.latitud),
    longitud: num(a.longitud),
    fecha: fechaIso(a.fecha_utc) ?? fechaIso(a.fecha),
  };
}

/**
 * Trae las 90 estaciones de la capa. `returnGeometry=false` porque ya tenemos
 * latitud/longitud como atributos y la geometria solo agrega peso.
 */
export async function fetchAlturasArcGIS(): Promise<AlturasPayload> {
  const token = await getToken();

  const run = async (tk: string): Promise<unknown> =>
    postForm(`${LAYER_URL}/query`, {
      where: '1=1',
      outFields: '*',
      returnGeometry: 'false',
      resultRecordCount: '1000',
      f: 'json',
      token: tk,
    });

  let json = await run(token);

  // 498 = token invalido, 499 = token requerido. Puede pasar si el token
  // cacheado se revoco del lado de ArcGIS antes de expirar: renovamos una vez.
  const code = (json as { error?: { code?: number } })?.error?.code;
  if (code === 498 || code === 499) {
    resetArcGisToken();
    json = await run(await getToken());
  }

  unwrapArcGisError(json);

  const features = (json as { features?: RawFeature[] }).features;
  if (!Array.isArray(features)) {
    throw new ArcGisError('Respuesta inesperada de ArcGIS: falta "features".');
  }

  const estaciones = features
    .map(mapFeature)
    .filter((e) => e.puerto.length > 0)
    .sort((a, b) => a.codigo - b.codigo);

  // La medicion mas reciente de todo el set — la mobile la muestra como
  // "ultima medicion" y avisa si quedo vieja.
  const actualizado = estaciones.reduce<string | null>((max, e) => {
    if (!e.fecha) return max;
    return max === null || e.fecha > max ? e.fecha : max;
  }, null);

  return { estaciones, actualizado };
}
