// Tipos y constantes compartidos entre el server action `bulk-import-socios.ts`
// y la UI cliente. No se ponen en el archivo 'use server' porque Next.js 15
// solo permite exports async desde ahí (ver CLAUDE.md sección 5.1).

export type ImportRowStatus =
  | 'nuevo' // no existe, se va a crear el usuario + perfil + membership
  | 'otra_guarderia' // existe en otra guardería; se agrega solo el membership
  | 'ya_es_socio' // ya es socio en esta guardería; se salta
  | 'bloqueado' // existe en esta guardería con otro rol; se salta
  | 'error_validacion' // datos del Excel mal cargados
  | 'email_duplicado'; // dos filas del Excel con el mismo email

export type ImportRowRaw = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion: string;
  tipoDocumento: string;
  numeroDocumento: string;
  razonSocial: string;
  condicionIva: string;
};

export type ImportRowPreview = {
  rowIndex: number; // número de fila visible en el Excel (3, 4, 5, ...)
  raw: ImportRowRaw;
  status: ImportRowStatus;
  mensaje: string; // texto humano para mostrar al cliente
};

export type PreviewResumen = {
  total: number;
  aCrear: number;
  aVincular: number; // existentes en otra guardería que se vinculan acá
  saltados: number;
  conError: number;
};

export const STATUS_LABEL: Record<ImportRowStatus, string> = {
  nuevo: 'Se va a crear',
  otra_guarderia: 'Se vincula a este club',
  ya_es_socio: 'Ya es socio (se salta)',
  bloqueado: 'Otro rol en este club (se salta)',
  error_validacion: 'Datos inválidos',
  email_duplicado: 'Email duplicado en el archivo',
};

export const STATUS_TONE: Record<ImportRowStatus, 'ok' | 'warn' | 'error'> = {
  nuevo: 'ok',
  otra_guarderia: 'ok',
  ya_es_socio: 'warn',
  bloqueado: 'error',
  error_validacion: 'error',
  email_duplicado: 'error',
};

// Mapeos de Excel → enum de DB
export const TIPO_DOCUMENTO_MAP: Record<string, string> = {
  DNI: 'dni',
  CUIT: 'cuit',
  CUIL: 'cuil',
  Pasaporte: 'pasaporte',
  CDI: 'cdi',
};

export const CONDICION_IVA_MAP: Record<string, string> = {
  'Consumidor Final': 'consumidor_final',
  'Responsable Inscripto': 'responsable_inscripto',
  Monotributo: 'monotributo',
  Exento: 'exento',
  'Cliente Exterior': 'cliente_exterior',
  'IVA No Alcanzado': 'iva_no_alcanzado',
  'Proveedor Exterior': 'proveedor_exterior',
};
