// Scraper de la pagina publica de alturas de rios de Prefectura Naval.
//
// Fuente: https://contenidosweb.prefecturanaval.gob.ar/alturas/index.php
// Es la MISMA base que la capa ArcGIS "DSIG_Altura_Rios" (mismos cod_puerto,
// mismas columnas) pero la web se actualiza en vivo mientras que la capa
// ArcGIS quedo congelada el 5-ene-2026. Por eso esta es la fuente primaria
// y ArcGIS quedo como fallback en /api/alturas.
//
// La pagina es HTML server-rendered sin API JSON; cada celda viene etiquetada
// con data-label y el link al historico trae `id=<cod_puerto>`, asi que el
// parseo por regex es estable. Mismo patron que el scraper del SHN (shn.ts).

import { type AlturasPayload, type EstacionAltura, type EstadoAltura } from './arcgis-alturas';

const PNA_URL = 'https://contenidosweb.prefecturanaval.gob.ar/alturas/index.php';
const FETCH_TIMEOUT_MS = 15_000;

/** Si el parseo devuelve menos que esto, el HTML cambio de forma — mejor fallar. */
const MIN_FILAS = 50;

export class PnaError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'PnaError';
  }
}

// "26/AUG/26 - 0000" — dia/mes-en-ingles/anio-corto y hora HHmm, hora Argentina.
const MESES: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

function fechaIso(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/([A-Z]{3})\/(\d{2})\s*-\s*(\d{2})(\d{2})$/i);
  if (!m) return null;
  const mes = MESES[m[2].toUpperCase()];
  if (mes === undefined) return null;
  const anio = 2000 + parseInt(m[3], 10);
  // Argentina es UTC-3 fijo (sin DST): sumar 3h para llevar a UTC.
  const utc = Date.UTC(anio, mes, parseInt(m[1], 10), parseInt(m[4], 10) + 3, parseInt(m[5], 10));
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function num(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null; // "S/E", "-", vacio → null
}

/** 999.99 es el centinela de "sin umbral" (mismo criterio que en ArcGIS). */
function umbral(raw: string | undefined): number | null {
  const n = num(raw);
  return n === null || n >= 999 ? null : n;
}

function mapEstado(raw: string): EstadoAltura {
  const v = raw.toUpperCase();
  if (v.includes('CRECE')) return 'crece';
  if (v.includes('BAJA')) return 'baja';
  if (v.includes('ESTAC')) return 'estacionado'; // incluye "ALERTA ESTAC."
  return 'sin_dato'; // "S/E." y cualquier valor nuevo
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export async function fetchAlturasPNA(): Promise<AlturasPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(PNA_URL, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'NauticApp/1.0 (+https://www.nauticapp.club)' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error de red';
    throw new PnaError(`No se pudo contactar la web de Prefectura: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new PnaError(`Prefectura respondio HTTP ${res.status}`, res.status);
  const html = await res.text();

  const estaciones: EstacionAltura[] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = rowMatch[1];
    const cells: Record<string, string> = {};
    for (const c of row.matchAll(/<t[hd][^>]*data-label="([^"]+)"[^>]*>([\s\S]*?)<\/t[hd]>/g)) {
      cells[c[1].replace(/:$/, '')] = stripTags(c[2]);
    }
    if (!cells['Puerto']) continue;

    const codigoMatch = row.match(/id=(\d+)/);
    const estado = mapEstado(cells['Estado'] ?? '');
    estaciones.push({
      codigo: codigoMatch ? parseInt(codigoMatch[1], 10) : 0,
      puerto: cells['Puerto'],
      rio: cells['Río'] ?? cells['Rio'] ?? '',
      altura: estado === 'sin_dato' ? null : num(cells['Ultimo Registro']),
      estado,
      variacion: num(cells['Variacion'] ?? cells['Variación']),
      ventanaHoras: num(cells['Periodo']),
      media: null,
      alerta: umbral(cells['Alerta']),
      evacuacion: umbral(cells['Evacuación'] ?? cells['Evacuacion']),
      anterior: num(cells['Registro Anterior']),
      maxima: null,
      minima: null,
      latitud: null,
      longitud: null,
      fecha: fechaIso(cells['Fecha Hora'] ?? ''),
    });
  }

  if (estaciones.length < MIN_FILAS) {
    throw new PnaError(
      `Parseo sospechoso: solo ${estaciones.length} estaciones (¿cambio el HTML de Prefectura?).`,
    );
  }

  const actualizado = estaciones.reduce<string | null>((max, e) => {
    if (!e.fecha) return max;
    return max === null || e.fecha > max ? e.fecha : max;
  }, null);

  return { estaciones, actualizado };
}
