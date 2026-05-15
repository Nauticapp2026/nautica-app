// Tipos compartidos entre el server action `bulk-import-embarcaciones.ts` y la
// UI. No es 'use server' (ver CLAUDE.md sección 5.1).

export type ImportEmbarcacionStatus =
  | 'nuevo' // se va a crear
  | 'matricula_duplicada' // matrícula ya existe en DB para este club; se salta
  | 'ya_existe_para_socio' // sin matrícula, ya hay un barco con mismo nombre + dueño; se salta
  | 'socio_no_encontrado' // el email_socio no es socio activo de este club; se bloquea
  | 'matricula_duplicada_archivo' // dos filas del Excel con misma matrícula
  | 'error_validacion'; // datos inválidos del Excel

export type ImportEmbarcacionRaw = {
  nombre: string;
  emailSocio: string;
  matricula: string;
  modelo: string;
  seguro: string;
};

export type ImportEmbarcacionPreview = {
  rowIndex: number;
  raw: ImportEmbarcacionRaw;
  status: ImportEmbarcacionStatus;
  mensaje: string;
};

export type PreviewEmbarcacionesResumen = {
  total: number;
  aCrear: number;
  saltados: number;
  conError: number;
};

export const STATUS_LABEL: Record<ImportEmbarcacionStatus, string> = {
  nuevo: 'Se va a crear',
  matricula_duplicada: 'Matrícula ya existe (se salta)',
  ya_existe_para_socio: 'Ya existe para este socio (se salta)',
  socio_no_encontrado: 'Socio no encontrado',
  matricula_duplicada_archivo: 'Matrícula duplicada en el archivo',
  error_validacion: 'Datos inválidos',
};

export const STATUS_TONE: Record<ImportEmbarcacionStatus, 'ok' | 'warn' | 'error'> = {
  nuevo: 'ok',
  matricula_duplicada: 'warn',
  ya_existe_para_socio: 'warn',
  socio_no_encontrado: 'error',
  matricula_duplicada_archivo: 'error',
  error_validacion: 'error',
};
