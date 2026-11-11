/**
 * Listas fijas del módulo Bienes de uso. Las listas que el club puede ampliar (tipo, rubro,
 * subrubro, marca, ubicación, aseguradora, tipos de intervención, falla, insumo e inspección…)
 * están en `lib/catalogos-club.ts`. Módulo plano (sin 'use server').
 */

import type { Opcion } from '@/lib/catalogos-club';

export const ESTADOS_BIEN: (Opcion & { clase: string })[] = [
  { value: 'activo', label: 'Activo', clase: 'bg-teal-50 text-[#175861]' },
  { value: 'inactivo', label: 'Inactivo', clase: 'bg-gray-100 text-gray-600' },
  { value: 'en_reparacion', label: 'En reparación', clase: 'bg-amber-50 text-amber-700' },
  { value: 'otro', label: 'Otro', clase: 'bg-sky-50 text-sky-700' },
];

export const FORMAS_ADQUISICION: Opcion[] = [
  { value: 'propia', label: 'Propia' },
  { value: 'alquilado', label: 'Alquilado' },
  { value: 'leasing', label: 'Leasing' },
  { value: 'donacion', label: 'Donación' },
  { value: 'otro', label: 'Otro' },
];

/** Años de vida útil que se ofrecen en el desplegable. */
export const VIDAS_UTILES: Opcion[] = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 50].map(
  (n) => ({ value: String(n), label: n === 1 ? '1 año' : `${n} años` }),
);

export const FRECUENCIAS: Opcion[] = [
  { value: 'dias', label: 'Días' },
  { value: 'meses', label: 'Meses' },
  { value: 'horas', label: 'Horas de uso' },
];

export const RESULTADOS_INSPECCION: (Opcion & { clase: string })[] = [
  { value: 'ok', label: 'Sin observaciones', clase: 'bg-teal-50 text-[#175861]' },
  { value: 'observado', label: 'Con observaciones', clase: 'bg-amber-50 text-amber-700' },
  { value: 'no_apto', label: 'No apto para operar', clase: 'bg-red-50 text-red-700' },
];

export const ROLES_EMPLEADO_BIEN = ['autorizado', 'mantenimiento'] as const;
export type RolEmpleadoBien = (typeof ROLES_EMPLEADO_BIEN)[number];

/** 1 = lunes … 7 = domingo (mismo orden que el legajo). */
export const DIAS_SEMANA: Opcion[] = [
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '7', label: 'Domingo' },
];
