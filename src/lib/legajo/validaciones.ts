/**
 * Validaciones y cálculos del legajo del personal. Funciones puras, sin acceso a la base:
 * las usan los server actions (que son la validación real) y las pantallas (para avisar
 * antes de guardar).
 */

export type ResultadoValidacion = { ok: true; valor: string } | { ok: false; error: string };

const soloDigitos = (s: string) => s.replace(/\D/g, '');

// ── CUIL / CUIT ─────────────────────────────────────────────────────────────

/** Prefijos válidos: personas (20, 23, 24, 25, 26, 27) y empresas (30, 33, 34). */
const PREFIJOS_CUIL = new Set(['20', '23', '24', '25', '26', '27', '30', '33', '34']);
const PESOS_CUIL = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Valida un CUIL/CUIT y lo devuelve con guiones (20-40123456-0). Acepta que lo escriban
 * con o sin guiones. Comprueba el prefijo y el dígito verificador (módulo 11).
 */
export function validarCuil(entrada: string): ResultadoValidacion {
  const d = soloDigitos(entrada);
  if (d.length !== 11) return { ok: false, error: 'El CUIL/CUIT tiene que tener 11 dígitos.' };
  if (!PREFIJOS_CUIL.has(d.slice(0, 2))) {
    return {
      ok: false,
      error: 'El CUIL/CUIT empieza con un prefijo que no existe (20, 23, 24, 27, 30, 33…).',
    };
  }
  const suma = PESOS_CUIL.reduce((acc, p, i) => acc + p * Number(d[i]), 0);
  const resto = suma % 11;
  let verificador = 11 - resto;
  if (verificador === 11) verificador = 0;
  // Con verificador 10 no existe un CUIL válido con ese prefijo: AFIP lo reasigna al 23.
  if (verificador === 10 || verificador !== Number(d[10])) {
    return {
      ok: false,
      error: 'El dígito verificador del CUIL/CUIT no coincide. Revisá el número.',
    };
  }
  return { ok: true, valor: `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` };
}

// ── CBU / CVU ───────────────────────────────────────────────────────────────

const PESOS_CBU_BLOQUE_1 = [7, 1, 3, 9, 7, 1, 3];
const PESOS_CBU_BLOQUE_2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];

function verificadorCbu(digitos: string, pesos: number[]): number {
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(digitos[i]), 0);
  return (10 - (suma % 10)) % 10;
}

/**
 * Valida un CBU/CVU: exactamente 22 dígitos y el dígito verificador de cada uno de sus
 * dos bloques (entidad + sucursal, y cuenta).
 */
export function validarCbu(entrada: string): ResultadoValidacion {
  const d = soloDigitos(entrada);
  if (d.length !== 22)
    return { ok: false, error: 'El CBU/CVU tiene que tener exactamente 22 dígitos.' };
  const bloque1 = d.slice(0, 8);
  const bloque2 = d.slice(8, 22);
  if (verificadorCbu(bloque1.slice(0, 7), PESOS_CBU_BLOQUE_1) !== Number(bloque1[7])) {
    return {
      ok: false,
      error: 'El CBU/CVU no es válido: falla el dígito verificador del primer bloque.',
    };
  }
  if (verificadorCbu(bloque2.slice(0, 13), PESOS_CBU_BLOQUE_2) !== Number(bloque2[13])) {
    return {
      ok: false,
      error: 'El CBU/CVU no es válido: falla el dígito verificador de la cuenta.',
    };
  }
  return { ok: true, valor: d };
}

// ── Documento de identidad ──────────────────────────────────────────────────

/** DNI: 6 a 9 dígitos, sin puntos ni espacios. Pasaporte y cédula: alfanumérico. */
export function validarDocumento(tipo: string, entrada: string): ResultadoValidacion {
  const limpio = entrada.replace(/[\s.\-]/g, '').toUpperCase();
  if (tipo === 'dni') {
    if (!/^\d{6,9}$/.test(limpio)) {
      return { ok: false, error: 'El DNI tiene entre 6 y 9 números, sin puntos ni espacios.' };
    }
    return { ok: true, valor: limpio };
  }
  if (!/^[A-Z0-9]{5,20}$/.test(limpio)) {
    return { ok: false, error: 'El número de documento no es válido (5 a 20 letras o números).' };
  }
  return { ok: true, valor: limpio };
}

export function esEmailValido(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

// ── Fechas y horas ──────────────────────────────────────────────────────────

/** 'HH:MM' o 'HH:MM:SS' → 'HH:MM:SS'. null si no es una hora válida. */
export function normalizarHora(s: string): string | null {
  const partes = s.trim().split(':');
  if (partes.length < 2 || partes.length > 3) return null;
  if (!/^\d{1,2}$/.test(partes[0]) || !partes.slice(1).every((p) => /^\d{2}$/.test(p))) {
    return null;
  }
  const h = Number(partes[0]);
  const mi = Number(partes[1]);
  const se = partes[2] ? Number(partes[2]) : 0;
  if (h > 23 || mi > 59 || se > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}`;
}

/** 'HH:MM[:SS]' → minutos desde la medianoche. */
function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Horas entre dos horarios, con dos decimales. Si "hasta" es igual o menor que "desde" se
 * entiende que el turno cruza la medianoche (22:00 → 06:00 = 8 h).
 */
export function calcularHoras(desde: string, hasta: string): number {
  let minutos = aMinutos(hasta) - aMinutos(desde);
  if (minutos <= 0) minutos += 24 * 60;
  return Math.round((minutos / 60) * 100) / 100;
}

/** Días entre dos fechas 'YYYY-MM-DD', ambas incluidas (calendario, como las vacaciones). */
export function diasCorridos(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T12:00:00.000Z`);
  const b = Date.parse(`${hasta}T12:00:00.000Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

/** 'HH:MM:SS' → 'HH:MM' para mostrar. */
export function horaCorta(h: string | null | undefined): string {
  return h ? h.slice(0, 5) : '';
}

/** Formatea horas decimales como "7,5 h". */
export function formatearHoras(h: number): string {
  return `${String(Math.round(h * 100) / 100).replace('.', ',')} h`;
}
