'use server';

import ExcelJS from 'exceljs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getActiveMarina } from '@/lib/auth/session';
import { createAreaAction, type CreateAreaInput } from '@/app/actions/espacios';
import type {
  AreaParsed,
  ImportAreaPreview,
  ImportAreaRaw,
  ImportAreaStatus,
  PreviewAreasResumen,
} from '@/app/(dashboard)/(admin)/espacios/bulk-import-areas-types';

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo'
  );
}

function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return '';
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && 'text' in v && typeof v.text === 'string') return v.text;
  if (typeof v === 'object' && 'richText' in v && Array.isArray(v.richText)) {
    return v.richText.map((rt) => rt.text).join('');
  }
  return String(v);
}

function rowIsEmpty(raw: ImportAreaRaw): boolean {
  return Object.values(raw).every((v) => v === '');
}

// Convierte "3; 3" → [3, 3]. Acepta ; o , como separador.
function splitNumberList(text: string): number[] {
  if (!text) return [];
  return text
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s) => Number(s.replace(',', '.')));
}

function splitStringList(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

// =============================================================================
// Esquema base de validación (lo que sí o sí tiene que cumplir cualquier fila)
// =============================================================================
const baseSchema = z.object({
  tipo: z
    .string()
    .trim()
    .refine((v) => v === 'Marina' || v === 'Nave', 'Tipo debe ser "Marina" o "Nave"'),
  nombre: z.string().trim().min(1, 'Falta el nombre del área'),
  peines: z.string().trim().optional().default(''),
  amarrasTotales: z.string().trim().optional().default(''),
  lados: z.string().trim().optional().default(''),
  pisosPorLado: z.string().trim().optional().default(''),
  camasPorLado: z.string().trim().optional().default(''),
});

// Toma la fila parseada por baseSchema y devuelve un AreaParsed o lista de errores.
function parseArea(raw: z.infer<typeof baseSchema>): { parsed?: AreaParsed; errores?: string[] } {
  const errores: string[] = [];

  if (raw.tipo === 'Marina') {
    if (!raw.peines) errores.push('Falta la cantidad de peines');
    if (!raw.amarrasTotales) errores.push('Falta la cantidad de amarras');
    if (errores.length > 0) return { errores };

    const peines = Number(raw.peines);
    const amarras = Number(raw.amarrasTotales);
    if (!Number.isInteger(peines) || peines < 1) {
      errores.push('peines tiene que ser un entero ≥ 1');
    }
    if (!Number.isInteger(amarras) || amarras < 0) {
      errores.push('amarras_totales tiene que ser un entero ≥ 0');
    }
    if (errores.length > 0) return { errores };

    return {
      parsed: {
        tipo: 'marina',
        nombre: raw.nombre,
        cantidadPeines: peines,
        cantidadAmarras: amarras,
      },
    };
  }

  // Nave
  if (!raw.lados) errores.push('Falta la lista de lados');
  if (!raw.pisosPorLado) errores.push('Falta la lista de pisos_por_lado');
  if (!raw.camasPorLado) errores.push('Falta la lista de camas_por_lado');
  if (errores.length > 0) return { errores };

  const nombresLados = splitStringList(raw.lados);
  const pisosLista = splitNumberList(raw.pisosPorLado);
  const camasLista = splitNumberList(raw.camasPorLado);

  if (nombresLados.length === 0) {
    errores.push('lados tiene que tener al menos un nombre');
  }
  if (nombresLados.length !== pisosLista.length) {
    errores.push(
      `lados tiene ${nombresLados.length} valor(es) pero pisos_por_lado tiene ${pisosLista.length}. Tienen que coincidir.`,
    );
  }
  if (nombresLados.length !== camasLista.length) {
    errores.push(
      `lados tiene ${nombresLados.length} valor(es) pero camas_por_lado tiene ${camasLista.length}. Tienen que coincidir.`,
    );
  }
  if (errores.length > 0) return { errores };

  const lados: { nombre: string; cantidadPisos: number; cantidadCamas: number }[] = [];
  for (let i = 0; i < nombresLados.length; i++) {
    const pisos = pisosLista[i];
    const camas = camasLista[i];
    if (!Number.isInteger(pisos) || pisos < 1) {
      errores.push(`El lado "${nombresLados[i]}" tiene pisos inválido (debe ser entero ≥ 1)`);
      continue;
    }
    if (!Number.isInteger(camas) || camas < 0) {
      errores.push(`El lado "${nombresLados[i]}" tiene camas inválido (debe ser entero ≥ 0)`);
      continue;
    }
    lados.push({ nombre: nombresLados[i], cantidadPisos: pisos, cantidadCamas: camas });
  }
  if (errores.length > 0) return { errores };

  return { parsed: { tipo: 'nave', nombre: raw.nombre, lados } };
}

function calcularEspacios(parsed: AreaParsed): number {
  if (parsed.tipo === 'marina') return parsed.cantidadAmarras;
  return parsed.lados.reduce((acc, l) => acc + l.cantidadCamas, 0);
}

// =============================================================================
// PREVIEW
// =============================================================================
export async function previewImportAreasAction(formData: FormData): Promise<{
  error?: string;
  rows?: ImportAreaPreview[];
  resumen?: PreviewAreasResumen;
}> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página.' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden importar áreas.' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'No llegó el archivo.' };
  if (file.size === 0) return { error: 'El archivo está vacío.' };
  if (file.size > 10 * 1024 * 1024) return { error: 'El archivo supera los 10 MB.' };

  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);
  } catch {
    return { error: 'No pudimos leer el archivo. Asegurate que sea un .xlsx válido.' };
  }

  const ws =
    workbook.getWorksheet('Datos') ?? workbook.worksheets.find((w) => w.name !== 'Instrucciones');
  if (!ws) return { error: 'No encontramos la hoja "Datos" en el archivo.' };

  const headerRow = ws.getRow(1);
  const headerMap: Record<string, number> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const name = cellText(cell)
      .replace(/\s*\*\s*$/, '')
      .trim()
      .toLowerCase();
    if (name) headerMap[name] = col;
  });

  for (const h of ['tipo', 'nombre']) {
    if (!(h in headerMap)) {
      return { error: `Falta la columna "${h}" en el archivo. ¿Es la plantilla correcta?` };
    }
  }

  function readCell(row: ExcelJS.Row, header: string): string {
    const col = headerMap[header];
    if (!col) return '';
    return cellText(row.getCell(col));
  }

  const rawRows: { rowIndex: number; raw: ImportAreaRaw }[] = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw: ImportAreaRaw = {
      tipo: readCell(row, 'tipo'),
      nombre: readCell(row, 'nombre'),
      peines: readCell(row, 'peines'),
      amarrasTotales: readCell(row, 'amarras_totales'),
      lados: readCell(row, 'lados'),
      pisosPorLado: readCell(row, 'pisos_por_lado'),
      camasPorLado: readCell(row, 'camas_por_lado'),
    };
    if (rowIsEmpty(raw)) continue;
    rawRows.push({ rowIndex: r, raw });
  }

  if (rawRows.length === 0) {
    return { error: 'No encontramos filas con datos. ¿Las cargaste a partir de la fila 3?' };
  }

  const preview: ImportAreaPreview[] = rawRows.map(({ rowIndex, raw }) => {
    const baseResult = baseSchema.safeParse(raw);
    if (!baseResult.success) {
      return {
        rowIndex,
        raw,
        status: 'error_validacion' as ImportAreaStatus,
        mensaje: baseResult.error.issues.map((i) => i.message).join('. '),
      };
    }

    const { parsed, errores } = parseArea(baseResult.data);
    if (errores || !parsed) {
      return {
        rowIndex,
        raw,
        status: 'error_validacion',
        mensaje: (errores ?? ['Datos inválidos']).join('. '),
      };
    }

    const total = calcularEspacios(parsed);
    return {
      rowIndex,
      raw,
      status: 'nuevo',
      mensaje:
        parsed.tipo === 'marina'
          ? `Se creará "${parsed.nombre}" con ${parsed.cantidadPeines} peine(s) y ${total} amarra(s).`
          : `Se creará "${parsed.nombre}" con ${parsed.lados.length} lado(s) y ${total} cama(s).`,
      parsed,
      totalEspacios: total,
    };
  });

  const resumen: PreviewAreasResumen = {
    total: preview.length,
    aCrear: preview.filter((r) => r.status === 'nuevo').length,
    conError: preview.filter((r) => r.status === 'error_validacion').length,
    totalEspaciosACrear: preview.reduce((acc, r) => acc + (r.totalEspacios ?? 0), 0),
  };

  return { rows: preview, resumen };
}

// =============================================================================
// CONFIRM
// Reusa createAreaAction (ya tiene su propia validación y maneja toda la
// jerarquía area → peines/lados → pisos → espacios).
// =============================================================================
export type ConfirmAreasInput = { rows: ImportAreaPreview[] };

export type ConfirmAreasResult = {
  error?: string;
  resumen?: {
    creadas: number;
    saltadas: number;
    falladas: { fila: number; nombre: string; mensaje: string }[];
  };
};

export async function confirmImportAreasAction(
  input: ConfirmAreasInput,
): Promise<ConfirmAreasResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página.' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden importar áreas.' };

  let creadas = 0;
  let saltadas = 0;
  const falladas: { fila: number; nombre: string; mensaje: string }[] = [];

  for (const row of input.rows) {
    if (row.status !== 'nuevo' || !row.parsed) {
      saltadas++;
      continue;
    }
    const payload: CreateAreaInput = row.parsed;
    const res = await createAreaAction(payload);
    if (res.error) {
      falladas.push({ fila: row.rowIndex, nombre: row.parsed.nombre, mensaje: res.error });
      continue;
    }
    creadas++;
  }

  revalidatePath('/espacios');

  return { resumen: { creadas, saltadas, falladas } };
}
