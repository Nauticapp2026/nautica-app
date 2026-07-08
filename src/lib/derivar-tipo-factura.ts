/**
 * Deriva el tipo de factura según las condiciones IVA del emisor (guardería) y
 * del receptor (socio). Devuelve null si no hay información suficiente para
 * determinarlo con certeza (el caller cae en un fallback).
 *
 * Lógica AFIP:
 *  - Guardería Monotributo → siempre Factura C (sin IVA discriminado).
 *  - Guardería RI + Socio RI → Factura A (B2B con IVA discriminado).
 *  - Guardería RI + cualquier otro → Factura B.
 */
export function derivarTipoFactura(
  guardCondicionIva: string | null,
  socioCondicionIva: string | null,
): 'factura_a' | 'factura_b' | 'factura_c' | null {
  if (guardCondicionIva === 'monotributo') return 'factura_c';
  if (guardCondicionIva === 'responsable_inscripto') {
    return socioCondicionIva === 'responsable_inscripto' ? 'factura_a' : 'factura_b';
  }
  return null;
}
