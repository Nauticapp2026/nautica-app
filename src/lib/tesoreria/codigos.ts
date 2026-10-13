/**
 * Código visible de un movimiento manual de Tesorería (pedido del cliente
 * 2026-10-13): MIC-0002 = Movimiento de Ingreso de Caja, MEC-0002 = Movimiento
 * de Egreso de Caja. Cada prefijo lleva su propia numeración correlativa por
 * club (mig 0162). Módulo plano, sin 'use server'.
 */

import type { TipoMovimientoTesoreria } from './instrumentos';

export const PREFIJO_MOVIMIENTO: Record<TipoMovimientoTesoreria, string> = {
  ingreso: 'MIC',
  egreso: 'MEC',
};

export function codigoMovimiento(tipo: TipoMovimientoTesoreria, numero: number): string {
  return `${PREFIJO_MOVIMIENTO[tipo]}-${String(numero).padStart(4, '0')}`;
}
