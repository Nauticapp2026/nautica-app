/**
 * Prefijos de los recibos de COBRANZA y el criterio para reconocerlos.
 *
 * Un recibo de cobranza documenta un pago recibido, no una deuda. Media docena
 * de lugares dependen de distinguirlo: Cobranzas excluye estos códigos de los
 * comprobantes cobrables, la Cuenta Corriente no les muestra estado, el PDF los
 * titula "Recibo" y el mail arma el desglose de lo cobrado. Si un lugar se
 * olvida del prefijo, ese recibo pasa a contarse como algo por cobrar.
 *
 * Estaba repetido como literales `'RC-'`/`'CI-'` en 8 archivos. Vive acá para
 * que agregar o renombrar un prefijo sea un solo cambio.
 *
 * Módulo plano: lo usan Server Components, server actions y componentes
 * cliente.
 */

/** Fiscal: la cobranza de comprobantes ARCA. */
export const PREFIJO_RECIBO_FISCAL = 'RC';

/**
 * Interno: la cobranza de comprobantes internos.
 *
 * Era `CI` ("Comprobante Interno"); el cliente pidió `RI` de **Recibo Interno**
 * (2026-09-02), que describe mejor lo que es. Los 11 CI- que existían se
 * renombraron a RI- en la mig 0153, así que hoy no debería quedar ninguno.
 */
export const PREFIJO_RECIBO_INTERNO = 'RI';

/**
 * Todos los prefijos que identifican un recibo de cobranza.
 *
 * `CI` estuvo acá como legacy (era la sigla vieja del recibo interno, renombrada
 * a RI- en la mig 0153) hasta el 2026-09-16: ese día el cliente pidió que el
 * **Comprobante interno manual** pase de CM- a **CI-** (mig 0157), así que CI-
 * ahora es DEUDA (un comprobante interno), no un recibo. Si quedara acá, los
 * comprobantes internos manuales desaparecerían de Cobranzas y de los saldos.
 * Se verificó antes de la mig que no existía ningún CI- viejo en la base.
 */
export const PREFIJOS_RECIBO_COBRANZA = [PREFIJO_RECIBO_FISCAL, PREFIJO_RECIBO_INTERNO] as const;

/** Patrones `LIKE` para las queries (`RC-%`, `RI-%`). */
export const PATRONES_RECIBO_COBRANZA = PREFIJOS_RECIBO_COBRANZA.map((p) => `${p}-%`);

/** ¿Este código es de un recibo de cobranza? */
export function esCodigoReciboCobranza(codigo: string | null | undefined): boolean {
  if (!codigo) return false;
  return PREFIJOS_RECIBO_COBRANZA.some((p) => codigo.startsWith(`${p}-`));
}

/** Prefijo que le toca a un recibo nuevo según el canal. */
export function prefijoReciboDeCanal(canal: 'fiscal' | 'interno'): string {
  return canal === 'interno' ? PREFIJO_RECIBO_INTERNO : PREFIJO_RECIBO_FISCAL;
}
