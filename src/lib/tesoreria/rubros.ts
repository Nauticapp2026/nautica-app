/**
 * Catálogo de rubros y subrubros de Tesorería para los movimientos manuales.
 *
 * Pedido del cliente (2026-10-13): rubro y subrubro se eligen de un
 * desplegable, nunca se escriben a mano, así los cierres de caja de todos los
 * clubes agrupan igual. El subrubro depende del rubro. Se guarda el texto
 * legible en `tesoreria_movimientos.rubro` / `subrubro` (es lo que se ve en la
 * tabla, el PDF y el Excel); el server action valida que el par exista acá.
 *
 * "Cobranzas" no está en la lista a propósito: ese rubro lo ponen solas las
 * líneas que salen de los recibos y sus anulaciones.
 *
 * Módulo plano, sin 'use server': lo importan el server action y el modal.
 */

export const RUBROS: { rubro: string; subrubros: string[] }[] = [
  {
    rubro: 'Ingresos varios',
    subrubros: ['Alquileres', 'Eventos', 'Venta de bienes', 'Intereses', 'Otros ingresos'],
  },
  {
    rubro: 'Sueldos y honorarios',
    subrubros: ['Sueldos', 'Cargas sociales', 'Honorarios', 'Viáticos'],
  },
  {
    rubro: 'Servicios',
    subrubros: ['Electricidad', 'Agua', 'Gas', 'Internet y telefonía', 'Seguridad', 'Limpieza'],
  },
  {
    rubro: 'Mantenimiento',
    subrubros: [
      'Muelles y marinas',
      'Naves y galpones',
      'Grúas y maquinaria',
      'Lanchas de servicio',
      'Edificio e instalaciones',
    ],
  },
  {
    rubro: 'Combustible',
    subrubros: ['Lanchas de servicio', 'Vehículos', 'Grúas y maquinaria'],
  },
  {
    rubro: 'Impuestos y tasas',
    subrubros: ['Municipales', 'Provinciales', 'Nacionales', 'Prefectura'],
  },
  {
    rubro: 'Proveedores',
    subrubros: ['Materiales', 'Repuestos', 'Insumos', 'Otros proveedores'],
  },
  {
    rubro: 'Bancos',
    subrubros: ['Depósito bancario', 'Extracción bancaria', 'Comisiones y gastos bancarios'],
  },
  {
    rubro: 'Seguros',
    subrubros: ['Responsabilidad civil', 'Embarcaciones', 'Edificio', 'Personal'],
  },
  {
    rubro: 'Caja',
    subrubros: ['Retiro de caja', 'Aporte de caja', 'Cambio de moneda', 'Ajuste de caja'],
  },
  {
    rubro: 'Otros',
    subrubros: ['Otros'],
  },
];

export function subrubrosDe(rubro: string): string[] {
  return RUBROS.find((r) => r.rubro === rubro)?.subrubros ?? [];
}

/** true si el par rubro/subrubro existe en el catálogo. */
export function esRubroValido(rubro: string, subrubro: string): boolean {
  return subrubrosDe(rubro).includes(subrubro);
}
