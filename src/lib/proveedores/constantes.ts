/**
 * Listas fijas del maestro de proveedores. Las listas que el club puede ampliar (área,
 * actividad, cuenta contable, condición y forma de pago, requisitos) están en
 * `lib/catalogos-club.ts`. Módulo plano (sin 'use server').
 */

import type { Opcion } from '@/lib/catalogos-club';

export const TIPOS_SUJETO: Opcion[] = [
  { value: 'persona_fisica', label: 'Persona física' },
  { value: 'srl', label: 'Sociedad SRL' },
  { value: 'sa', label: 'Sociedad SA' },
  { value: 'sas', label: 'Sociedad SAS' },
  { value: 'otro', label: 'Otro' },
];

export const ESTADOS_PROVEEDOR: (Opcion & { clase: string })[] = [
  { value: 'activo', label: 'Activo', clase: 'bg-teal-50 text-[#175861]' },
  { value: 'inactivo', label: 'Inactivo', clase: 'bg-gray-100 text-gray-600' },
];

// Mismas opciones (y mismo texto) que los Datos Impositivos del socio.
export const CONDICIONES_IVA: Opcion[] = [
  { value: 'responsable_inscripto', label: 'IVA Responsable Inscripto' },
  { value: 'exento', label: 'IVA Sujeto Exento' },
  { value: 'monotributo', label: 'Responsable Monotributo' },
  { value: 'consumidor_final', label: 'Consumidor Final' },
  { value: 'proveedor_exterior', label: 'Proveedor del Exterior' },
  { value: 'iva_no_alcanzado', label: 'IVA No Alcanzado' },
];

export const CONDICIONES_IIBB: Opcion[] = [
  { value: 'convenio_multilateral', label: 'Convenio Multilateral' },
  { value: 'local', label: 'Local' },
  { value: 'exento', label: 'Exento' },
  { value: 'no_gravado', label: 'No Gravado' },
  { value: 'no_corresponde', label: 'No Corresponde' },
];

/** Impuestos que se le pueden retener al proveedor al pagarle. Ninguno tildado = no se retiene. */
export const RETENCIONES: Opcion[] = [
  { value: 'iva', label: 'IVA' },
  { value: 'ganancias', label: 'Impuesto a las Ganancias' },
  { value: 'iibb', label: 'Ingresos Brutos' },
  { value: 'suss', label: 'SUSS (cargas sociales)' },
];

export const MONEDAS: Opcion[] = [
  { value: 'ARS', label: 'Peso argentino (ARS)' },
  { value: 'USD', label: 'Dólar estadounidense (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'BRL', label: 'Real brasileño (BRL)' },
  { value: 'UYU', label: 'Peso uruguayo (UYU)' },
  { value: 'CLP', label: 'Peso chileno (CLP)' },
  { value: 'PYG', label: 'Guaraní (PYG)' },
];

export const PROVINCIAS: Opcion[] = [
  'Buenos Aires',
  'Ciudad Autónoma de Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
].map((p) => ({ value: p, label: p }));

export const PAISES: Opcion[] = [
  'Argentina',
  'Bolivia',
  'Brasil',
  'Chile',
  'Colombia',
  'Paraguay',
  'Perú',
  'Uruguay',
  'Estados Unidos',
  'España',
  'Italia',
  'Alemania',
  'Francia',
  'Reino Unido',
  'China',
  'Otro',
].map((p) => ({ value: p, label: p }));

/** Adjuntos fijos de la pestaña fiscal (el resto de la tabla son requisitos para ingresar). */
export const CLAVES_DOCUMENTO_FIJO = ['legajo_impositivo', 'cert_retencion'] as const;
export type ClaveDocumentoFijo = (typeof CLAVES_DOCUMENTO_FIJO)[number];

export const ROTULO_DOCUMENTO_FIJO: Record<ClaveDocumentoFijo, string> = {
  legajo_impositivo: 'Legajo impositivo',
  cert_retencion: 'Certificado de exclusión de retenciones',
};

/** Prefijo del código visible del proveedor (editable): P-0001, P-0002… */
export const PREFIJO_CODIGO = 'P-';
export const codigoPorNumero = (n: number) => `${PREFIJO_CODIGO}${String(n).padStart(4, '0')}`;
