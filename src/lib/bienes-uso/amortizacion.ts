/**
 * Amortización lineal de un bien de uso. Función pura, sin acceso a la base.
 *
 * Es un cálculo de gestión (cuánto del valor ya se "gastó" y cuánto queda), no una liquidación
 * impositiva: reparte `valor de origen − valor residual` en cuotas MENSUALES iguales a lo largo
 * de la vida útil. La amortización arranca en el mes de la fecha de inicio (se cuenta el mes
 * completo) y se frena al llegar a la vida útil o en el mes de la baja, lo que ocurra primero.
 */

export type EntradaAmortizacion = {
  valorOrigen: number | null;
  valorResidual: number;
  vidaUtilAnios: number | null;
  /** 'YYYY-MM-DD'. Si falta, el cálculo no es posible. */
  inicio: string | null;
  /** 'YYYY-MM-DD' o null. Con baja, la amortización no sigue después. */
  baja: string | null;
  /** 'YYYY-MM-DD': hoy en horario argentino. */
  hoy: string;
};

export type FilaCronograma = { anio: number; meses: number; cuota: number; acumulada: number };

export type ResultadoAmortizacion =
  | { calculable: false; faltan: string[] }
  | {
      calculable: true;
      baseAmortizable: number;
      mesesVidaUtil: number;
      cuotaMensual: number;
      cuotaAnual: number;
      /** Meses amortizados hasta hoy (o hasta la baja). */
      mesesAmortizados: number;
      acumulada: number;
      /** Valor de origen menos lo amortizado hasta hoy. */
      valorContable: number;
      porcentajeAmortizado: number;
      /** 'YYYY-MM' del último mes de amortización. */
      mesFin: string;
      totalmenteAmortizado: boolean;
      /** Cuota que corresponde a cada año calendario. */
      cronograma: FilaCronograma[];
    };

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Meses calendario entre dos fechas 'YYYY-MM-DD', contando el mes de inicio completo. */
function mesesContados(desde: string, hasta: string): number {
  const d = Number(desde.slice(0, 4)) * 12 + Number(desde.slice(5, 7));
  const h = Number(hasta.slice(0, 4)) * 12 + Number(hasta.slice(5, 7));
  return h - d + 1;
}

export function calcularAmortizacion(e: EntradaAmortizacion): ResultadoAmortizacion {
  const faltan: string[] = [];
  if (e.valorOrigen === null || e.valorOrigen <= 0) faltan.push('el valor de origen');
  if (!e.vidaUtilAnios || e.vidaUtilAnios < 1) faltan.push('la vida útil');
  if (!e.inicio) faltan.push('la fecha de inicio de la amortización');
  if (faltan.length > 0 || e.valorOrigen === null || !e.vidaUtilAnios || !e.inicio) {
    return { calculable: false, faltan };
  }

  const base = Math.max(0, e.valorOrigen - e.valorResidual);
  const mesesVida = e.vidaUtilAnios * 12;
  const cuotaMensual = base / mesesVida;

  // Hasta cuándo cuenta: hoy, o la baja si fue antes.
  const corte = e.baja && e.baja < e.hoy ? e.baja : e.hoy;
  const transcurridos = corte < e.inicio ? 0 : mesesContados(e.inicio, corte);
  const mesesAmortizados = Math.min(Math.max(transcurridos, 0), mesesVida);

  const acumulada = redondear(Math.min(cuotaMensual * mesesAmortizados, base));
  const valorContable = redondear(e.valorOrigen - acumulada);

  // Último mes de amortización.
  const [yi, mi] = [Number(e.inicio.slice(0, 4)), Number(e.inicio.slice(5, 7))];
  const idxFin = yi * 12 + (mi - 1) + mesesVida - 1;
  const mesFin = `${Math.floor(idxFin / 12)}-${String((idxFin % 12) + 1).padStart(2, '0')}`;

  // Cronograma por año calendario (con el tope de la baja, si hubo).
  const mesesActivos = e.baja
    ? Math.min(mesesVida, Math.max(mesesContados(e.inicio, e.baja), 0))
    : mesesVida;
  const cronograma: FilaCronograma[] = [];
  let restantes = mesesActivos;
  let anio = yi;
  let mesDelAnio = mi; // primer mes del año en el que se amortiza
  let acumuladaCron = 0;
  while (restantes > 0) {
    const delAnio = Math.min(restantes, 13 - mesDelAnio);
    const cuota = redondear(cuotaMensual * delAnio);
    acumuladaCron = redondear(acumuladaCron + cuota);
    cronograma.push({ anio, meses: delAnio, cuota, acumulada: acumuladaCron });
    restantes -= delAnio;
    anio += 1;
    mesDelAnio = 1;
  }

  return {
    calculable: true,
    baseAmortizable: redondear(base),
    mesesVidaUtil: mesesVida,
    cuotaMensual: redondear(cuotaMensual),
    cuotaAnual: redondear(cuotaMensual * 12),
    mesesAmortizados,
    acumulada,
    valorContable,
    porcentajeAmortizado: base === 0 ? 100 : Math.round((acumulada / base) * 1000) / 10,
    mesFin,
    totalmenteAmortizado: mesesAmortizados >= mesesVida || (e.valorOrigen > 0 && base === 0),
    cronograma,
  };
}
