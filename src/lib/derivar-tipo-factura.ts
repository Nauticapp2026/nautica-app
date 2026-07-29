/**
 * Deriva el tipo de factura según las condiciones IVA del emisor (guardería) y
 * del receptor (socio). Devuelve null si no hay información suficiente para
 * determinarlo con certeza (el caller cae en un fallback).
 *
 * Lógica AFIP (cuadro del cliente, 2026-07-29):
 *  - Guardería Monotributo → siempre Factura C (sin IVA discriminado).
 *  - Guardería RI + Socio RI o Monotributista → Factura A (discrimina IVA;
 *    a los monotributistas les corresponde A desde la RG 2021).
 *  - Guardería RI + cualquier otro (Exento, Consumidor Final) → Factura B.
 */
export function derivarTipoFactura(
  guardCondicionIva: string | null,
  socioCondicionIva: string | null,
): 'factura_a' | 'factura_b' | 'factura_c' | null {
  if (guardCondicionIva === 'monotributo') return 'factura_c';
  if (guardCondicionIva === 'responsable_inscripto') {
    return socioCondicionIva === 'responsable_inscripto' || socioCondicionIva === 'monotributo'
      ? 'factura_a'
      : 'factura_b';
  }
  return null;
}
