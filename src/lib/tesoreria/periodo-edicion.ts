/**
 * Hasta cuándo se puede anular o modificar un movimiento manual de Tesorería.
 * Pedido del cliente (2026-10-13): "misma lógica que la anulación de
 * recibos", así que se reusan las opciones y el cálculo de
 * lib/periodo-anulacion.ts (semana de lunes a domingo, mes en curso, mes
 * anterior, sin límite), con la fecha del movimiento como referencia.
 *
 * Módulo plano, sin 'use server'.
 */

import {
  PERIODO_ANULACION_OPCIONES,
  esPeriodoAnulacion,
  puedeAnularRecibo,
  type PeriodoAnulacion,
} from '@/lib/periodo-anulacion';

export type PeriodoEdicion = PeriodoAnulacion;
export const PERIODO_EDICION_DEFAULT: PeriodoEdicion = 'sin_limite';
export const PERIODO_EDICION_OPCIONES = PERIODO_ANULACION_OPCIONES;
export const esPeriodoEdicion = esPeriodoAnulacion;

/**
 * `fecha` es el `date` del movimiento ('YYYY-MM-DD'). Se evalúa al mediodía
 * UTC para que caiga en ese mismo día calendario argentino (new Date('YYYY-MM-DD')
 * es medianoche UTC = la noche anterior en Argentina y correría el límite).
 */
export function puedeEditarMovimiento(
  fecha: string,
  periodo: PeriodoEdicion,
  ahora: Date = new Date(),
): boolean {
  return puedeAnularRecibo(`${fecha}T12:00:00Z`, periodo, ahora);
}

export function motivoBloqueoEdicion(periodo: PeriodoEdicion): string {
  const opcion = PERIODO_EDICION_OPCIONES.find((o) => o.value === periodo);
  return `Este movimiento quedó fuera del período de modificación que configuró el club (${opcion?.label ?? periodo}). Se cambia en Mi perfil → Datos Impositivos.`;
}
