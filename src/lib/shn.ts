// Scraper del SHN (Servicio de Hidrografia Naval) para tablas de marea.
//
// Endpoint publico: POST a `RE_TablasDeMarea.asp` con campos `FAnio`, `FMes`,
// `Localidad`. Devuelve HTML con una tabla `<tr><td>dia</td><td>hora</td><td>altura</td></tr>`.
// El primer evento de cada dia trae el numero del dia en el primer td; los
// siguientes 3 eventos del mismo dia tienen el primer td vacio.
//
// El SHN NO etiqueta pleamar / bajamar — inferimos comparando la altura con
// el evento anterior (sube = pleamar, baja = bajamar). Patron tipico: 2P+2B
// alternados por dia.

const SHN_URL = 'https://www.hidro.gob.ar/oceanografia/Tmareas/RE_TablasDeMarea.asp';

export type TipoMarea = 'pleamar' | 'bajamar';

export type EventoMarea = {
  /** Dia del mes (1-31). */
  dia: number;
  /** Hora local en formato "HH:MM". */
  hora: string;
  /** Altura en metros sobre el plano de reduccion. */
  altura: number;
  /** Tipo inferido por comparacion con el evento anterior. */
  tipo: TipoMarea;
};

export type MareasMes = {
  puerto: string;
  anio: number;
  mes: number;
  eventos: EventoMarea[];
};

export class ShnError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ShnError';
  }
}

/**
 * Hace el POST al SHN y devuelve los eventos parseados.
 * Lanza `ShnError` si la respuesta no es OK o no se puede parsear.
 */
export async function fetchMareasSHN(
  puerto: string,
  anio: number,
  mes: number,
): Promise<MareasMes> {
  const body = new URLSearchParams({
    FAnio: String(anio),
    FMes: String(mes).padStart(2, '0'),
    Localidad: puerto,
    B1: 'Ejecutar consulta',
  }).toString();

  let res: Response;
  try {
    res = await fetch(SHN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; NauticAppBot/1.0; +https://www.nauticapp.club)',
      },
      body,
      // 20s — el SHN suele responder en <5s pero a veces tarda.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new ShnError(
      `No se pudo contactar al SHN: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    throw new ShnError(`SHN devolvio HTTP ${res.status}`, res.status);
  }

  const html = await res.text();
  const eventos = parseEventosFromHtml(html);
  if (eventos.length === 0) {
    throw new ShnError(
      `SHN devolvio 0 eventos para ${puerto} ${anio}-${mes}. Capaz cambiaron el HTML.`,
    );
  }

  return { puerto, anio, mes, eventos };
}

/**
 * Extrae los eventos del HTML del SHN. Exportado para tests.
 */
export function parseEventosFromHtml(html: string): EventoMarea[] {
  // Buscamos filas con tres `<td>`:
  //  1ro con class="text-primary" y contenido = dia o vacio
  //  2do con hora "HH:MM"
  //  3ro con altura "X,XX"
  // El SHN usa espacios y saltos de linea entre los <td>, asi que usamos /s.
  const filaRegex =
    /<td\s+CLASS="text-primary">\s*([^<]*?)\s*<\/td>\s*<td>\s*(\d{2}):(\d{2})\s*<\/td>\s*<td>\s*([\d,]+)\s*<\/td>/g;

  const eventos: EventoMarea[] = [];
  let diaActual: number | null = null;
  let alturaPrev: number | null = null;
  let m: RegExpExecArray | null;

  while ((m = filaRegex.exec(html)) !== null) {
    const diaStr = m[1].trim();
    const hh = m[2];
    const mm = m[3];
    const alturaStr = m[4].replace(',', '.');
    const altura = parseFloat(alturaStr);
    if (!Number.isFinite(altura)) continue;

    if (diaStr) {
      const d = parseInt(diaStr, 10);
      if (Number.isFinite(d) && d >= 1 && d <= 31) diaActual = d;
    }
    if (diaActual === null) continue;

    // Inferir tipo: si subio respecto al evento anterior = pleamar; sino bajamar.
    let tipo: TipoMarea;
    if (alturaPrev === null) {
      // El primer evento del mes: marcamos por defecto como bajamar si esta
      // por debajo de 1m, pleamar si esta por encima. Es un fallback flojo
      // pero el resto se calcula bien con la cadena de comparaciones.
      tipo = altura >= 1 ? 'pleamar' : 'bajamar';
    } else {
      tipo = altura > alturaPrev ? 'pleamar' : 'bajamar';
    }

    eventos.push({
      dia: diaActual,
      hora: `${hh}:${mm}`,
      altura,
      tipo,
    });
    alturaPrev = altura;
  }

  return eventos;
}
