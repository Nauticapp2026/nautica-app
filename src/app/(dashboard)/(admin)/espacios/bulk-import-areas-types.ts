// Tipos compartidos entre el server action y la UI cliente.
// No es 'use server' (ver CLAUDE.md sección 5.1).

export type ImportAreaStatus = 'nuevo' | 'error_validacion';

export type ImportAreaRaw = {
  tipo: string; // "Marina" | "Nave"
  nombre: string;
  peines: string;
  amarrasTotales: string;
  lados: string;
  pisosPorLado: string;
  camasPorLado: string;
};

// Datos parseados de un área lista para insertar.
// La estructura mira a `createAreaAction` en src/app/actions/espacios.ts.
export type AreaParsed =
  | {
      tipo: 'marina';
      nombre: string;
      cantidadPeines: number;
      cantidadAmarras: number;
    }
  | {
      tipo: 'nave';
      nombre: string;
      lados: { nombre: string; cantidadPisos: number; cantidadCamas: number }[];
    };

export type ImportAreaPreview = {
  rowIndex: number;
  raw: ImportAreaRaw;
  status: ImportAreaStatus;
  mensaje: string; // texto humano
  parsed?: AreaParsed; // presente solo si status='nuevo'
  totalEspacios?: number; // cuántos espacios genera (para mostrar en preview)
};

export type PreviewAreasResumen = {
  total: number;
  aCrear: number;
  conError: number;
  totalEspaciosACrear: number;
};

export const STATUS_LABEL: Record<ImportAreaStatus, string> = {
  nuevo: 'Se va a crear',
  error_validacion: 'Datos inválidos',
};

export const STATUS_TONE: Record<ImportAreaStatus, 'ok' | 'error'> = {
  nuevo: 'ok',
  error_validacion: 'error',
};
