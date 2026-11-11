/**
 * Legajo del personal: valores fijos, listas desplegables y catálogo de documentos.
 *
 * Módulo plano (sin 'use server' ni 'use client'): lo importan los server actions, las
 * páginas del servidor y las pantallas del navegador. Los valores que son ENUM en la
 * base (estado, género, tipo de cuenta…) viven acá con su etiqueta; los de las listas
 * desplegables abiertas (puestos, áreas, sedes…) tienen un mínimo de sugerencias y el
 * club agrega las suyas (tabla `legajo_catalogo`).
 */

import type { Opcion } from '@/lib/catalogos-club';

export type { Opcion };

// ── Datos personales ────────────────────────────────────────────────────────

export const TIPOS_DOCUMENTO_PERSONA: Opcion[] = [
  { value: 'dni', label: 'DNI' },
  { value: 'pasaporte', label: 'Pasaporte' },
  { value: 'cedula', label: 'Cédula' },
];

export const GENEROS: Opcion[] = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'no_binario_otro', label: 'No binario / Otro' },
];

// ── Laboral ─────────────────────────────────────────────────────────────────

export const ESTADOS_EMPLEADO: (Opcion & { clase: string })[] = [
  { value: 'activo', label: 'Activo', clase: 'bg-teal-50 text-[#175861]' },
  { value: 'licencia', label: 'Licencia', clase: 'bg-amber-50 text-amber-700' },
  { value: 'suspendido', label: 'Suspendido', clase: 'bg-orange-50 text-orange-700' },
  { value: 'baja', label: 'Baja', clase: 'bg-gray-100 text-gray-600' },
];

// ── Seguridad social y financieros ──────────────────────────────────────────

export const TIPOS_CUENTA: Opcion[] = [
  { value: 'caja_ahorro_sueldo', label: 'Caja de ahorro sueldo' },
  { value: 'caja_ahorro_comun', label: 'Caja de ahorro común' },
  { value: 'cuenta_corriente', label: 'Cuenta corriente' },
];

// ── Educación y familia ─────────────────────────────────────────────────────

export const NIVELES_EDUCATIVOS: Opcion[] = [
  { value: 'secundario', label: 'Secundario' },
  { value: 'terciario', label: 'Terciario' },
  { value: 'universitario', label: 'Universitario' },
  { value: 'posgrado', label: 'Posgrado' },
];

export const ESTADOS_EDUCATIVOS: Opcion[] = [
  { value: 'completo', label: 'Completo' },
  { value: 'incompleto', label: 'Incompleto' },
];

export const ESTADOS_CIVILES: Opcion[] = [
  { value: 'soltero', label: 'Soltero/a' },
  { value: 'casado', label: 'Casado/a' },
  { value: 'divorciado', label: 'Divorciado/a' },
  { value: 'viudo', label: 'Viudo/a' },
  { value: 'union_convivencial', label: 'Unión convivencial' },
];

export const PARENTESCOS: Opcion[] = [
  { value: 'hijo', label: 'Hijo/a' },
  { value: 'conyuge', label: 'Cónyuge' },
  { value: 'conviviente', label: 'Conviviente' },
  { value: 'otro', label: 'Otro' },
];

// ── Horarios y horas ────────────────────────────────────────────────────────

/** 1 = lunes … 7 = domingo (mismo orden que usa la planilla de turnos). */
export const DIAS_SEMANA: Opcion[] = [
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '7', label: 'Domingo' },
];

export const TIPOS_HORA: Opcion[] = [
  { value: 'normal', label: 'Normales' },
  { value: 'extra_50', label: 'Extras al 50%' },
  { value: 'extra_100', label: 'Extras al 100%' },
  { value: 'adicional', label: 'Adicionales' },
  { value: 'nocturna', label: 'Nocturnas' },
  { value: 'feriado', label: 'Feriado trabajado' },
];

export const NOVEDADES_HORA: (Opcion & { clase: string })[] = [
  { value: 'trabajado', label: 'Trabajado', clase: 'bg-teal-50 text-[#175861]' },
  { value: 'enfermedad', label: 'Enfermedad', clase: 'bg-red-50 text-red-700' },
  { value: 'licencia', label: 'Licencia', clase: 'bg-amber-50 text-amber-700' },
  { value: 'vacaciones', label: 'Vacaciones', clase: 'bg-sky-50 text-sky-700' },
  { value: 'ausencia', label: 'Ausencia', clase: 'bg-orange-50 text-orange-700' },
  { value: 'feriado', label: 'Feriado', clase: 'bg-gray-100 text-gray-600' },
];

export function labelDe(opciones: Opcion[], value: string | null | undefined): string {
  if (!value) return '';
  return opciones.find((o) => o.value === value)?.label ?? value;
}

// ── Documentación del legajo ────────────────────────────────────────────────

export type GrupoDocumento =
  | 'personal'
  | 'laboral'
  | 'salud'
  | 'financiero'
  | 'operativa'
  | 'nautica';

export type DocumentoLegajoDef = {
  tipo: string;
  label: string;
  grupo: GrupoDocumento;
  /** Se muestra la casilla "Posee" (la documentación que depende del puesto). */
  conCheck: boolean;
  /** Tiene fecha de vencimiento opcional (licencias, brevet, apto médico…). */
  conVencimiento: boolean;
  /** Cuenta como obligatoria para decir que el legajo está completo. */
  obligatorio: boolean;
};

export const GRUPOS_DOCUMENTO: { grupo: GrupoDocumento; titulo: string; descripcion: string }[] = [
  { grupo: 'personal', titulo: 'Identidad', descripcion: 'Copia del documento de identidad.' },
  { grupo: 'laboral', titulo: 'Contratación', descripcion: 'Respaldo del alta en ARCA.' },
  { grupo: 'salud', titulo: 'Salud ocupacional', descripcion: 'Examen preocupacional.' },
  {
    grupo: 'financiero',
    titulo: 'Datos bancarios',
    descripcion: 'Constancia de la cuenta de cobro.',
  },
  {
    grupo: 'operativa',
    titulo: 'Documentación operativa',
    descripcion: 'Obligatoria para operar tractores, autoelevadores y plumas.',
  },
  {
    grupo: 'nautica',
    titulo: 'Documentación náutica y marítima',
    descripcion: 'Para el personal de agua y maniobra.',
  },
];

export const DOCUMENTOS_LEGAJO: DocumentoLegajoDef[] = [
  {
    tipo: 'documento_identidad',
    label: 'Copia del documento de identidad',
    grupo: 'personal',
    conCheck: false,
    conVencimiento: false,
    obligatorio: true,
  },
  {
    tipo: 'alta_arca',
    label: 'Alta temprana ARCA',
    grupo: 'laboral',
    conCheck: false,
    conVencimiento: false,
    obligatorio: false,
  },
  {
    tipo: 'apto_medico',
    label: 'Apto médico preocupacional',
    grupo: 'salud',
    conCheck: false,
    conVencimiento: true,
    obligatorio: false,
  },
  {
    tipo: 'copia_cbu',
    label: 'Constancia de CBU / CVU',
    grupo: 'financiero',
    conCheck: false,
    conVencimiento: false,
    obligatorio: false,
  },
  {
    tipo: 'licencia_conducir',
    label: 'Licencia de conducir nacional',
    grupo: 'operativa',
    conCheck: true,
    conVencimiento: true,
    obligatorio: false,
  },
  {
    tipo: 'cert_autoelevadores',
    label: 'Certificado de capacitación para operación de autoelevadores',
    grupo: 'operativa',
    conCheck: true,
    conVencimiento: true,
    obligatorio: false,
  },
  {
    tipo: 'habilitacion_marina_mercante',
    label: 'Habilitación en el Registro de Personal Terrestre de la Marina Mercante',
    grupo: 'nautica',
    conCheck: true,
    conVencimiento: true,
    obligatorio: false,
  },
  {
    tipo: 'brevet_nautico',
    label: 'Brevet náutico deportivo (mínimo Conductor Náutico o Timonel)',
    grupo: 'nautica',
    conCheck: true,
    conVencimiento: true,
    obligatorio: false,
  },
  {
    tipo: 'libreta_embarco',
    label: 'Cédula o libreta de embarco (si aplica)',
    grupo: 'nautica',
    conCheck: true,
    conVencimiento: true,
    obligatorio: false,
  },
];

export const TIPOS_DOCUMENTO_LEGAJO = DOCUMENTOS_LEGAJO.map((d) => d.tipo);

// ── Vínculo con un usuario del sistema ──────────────────────────────────────

/**
 * Roles de membership que pueden ser personal del club y, por lo tanto, vincularse a un
 * legajo. Quedan afuera los socios, invitados y proveedores: no son empleados.
 */
export const ROLES_VINCULABLES = [
  'administrador_general',
  'administrativo',
  'contable',
  'operario',
  'marinero',
  'mantenimiento',
  'comunicaciones',
  'restaurantes',
  'seguridad',
] as const;

export const LABEL_ROL: Record<string, string> = {
  administrador_general: 'Administrador',
  administrativo: 'Administrativo',
  contable: 'Contable',
  operario: 'Operario',
  marinero: 'Marinero',
  mantenimiento: 'Mantenimiento',
  comunicaciones: 'Comunicaciones',
  restaurantes: 'Restaurantes',
  seguridad: 'Portería / Seguridad',
};

/** Administradores del club que pueden figurar como aprobadores de una licencia. */
export const ROLES_ADMIN_LICENCIA = [
  'administrador_general',
  'administrativo',
  'contable',
] as const;
