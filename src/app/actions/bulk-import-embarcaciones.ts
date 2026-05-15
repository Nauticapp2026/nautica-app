'use server';

import ExcelJS from 'exceljs';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { embarcaciones, memberships, profiles } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import type {
  ImportEmbarcacionPreview,
  ImportEmbarcacionRaw,
  ImportEmbarcacionStatus,
  PreviewEmbarcacionesResumen,
} from '@/app/(dashboard)/(admin)/usuarios/bulk-import-embarcaciones-types';

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo'
  );
}

const rowSchema = z.object({
  nombre: z.string().trim().min(1, 'Falta el nombre del barco'),
  emailSocio: z.string().trim().toLowerCase().email('Email del socio inválido'),
  matricula: z.string().trim().optional().default(''),
  modelo: z.string().trim().optional().default(''),
  seguro: z.string().trim().optional().default(''),
});

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

function rowIsEmpty(raw: ImportEmbarcacionRaw): boolean {
  return Object.values(raw).every((v) => v === '');
}

// =============================================================================
// PREVIEW
// =============================================================================
export async function previewImportEmbarcacionesAction(formData: FormData): Promise<{
  error?: string;
  rows?: ImportEmbarcacionPreview[];
  resumen?: PreviewEmbarcacionesResumen;
}> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página.' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden importar embarcaciones.' };

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

  // Headers
  const headerRow = ws.getRow(1);
  const headerMap: Record<string, number> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const name = cellText(cell)
      .replace(/\s*\*\s*$/, '')
      .trim()
      .toLowerCase();
    if (name) headerMap[name] = col;
  });

  for (const h of ['nombre', 'email_socio']) {
    if (!(h in headerMap)) {
      return { error: `Falta la columna "${h}" en el archivo. ¿Es la plantilla correcta?` };
    }
  }

  function readCell(row: ExcelJS.Row, header: string): string {
    const col = headerMap[header];
    if (!col) return '';
    return cellText(row.getCell(col));
  }

  const rawRows: { rowIndex: number; raw: ImportEmbarcacionRaw }[] = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw: ImportEmbarcacionRaw = {
      nombre: readCell(row, 'nombre'),
      emailSocio: readCell(row, 'email_socio'),
      matricula: readCell(row, 'matricula'),
      modelo: readCell(row, 'modelo'),
      seguro: readCell(row, 'seguro'),
    };
    if (rowIsEmpty(raw)) continue;
    rawRows.push({ rowIndex: r, raw });
  }

  if (rawRows.length === 0) {
    return { error: 'No encontramos filas con datos. ¿Las cargaste a partir de la fila 3?' };
  }

  type Parsed = {
    rowIndex: number;
    raw: ImportEmbarcacionRaw;
    valid?: z.infer<typeof rowSchema>;
    errores?: string[];
  };
  const parsed: Parsed[] = rawRows.map(({ rowIndex, raw }) => {
    const result = rowSchema.safeParse(raw);
    if (!result.success) {
      return { rowIndex, raw, errores: result.error.issues.map((i) => i.message) };
    }
    return { rowIndex, raw, valid: result.data };
  });

  // Detectar matrículas duplicadas dentro del archivo (case-insensitive)
  const matriculasEnArchivo = new Map<string, number>();
  for (const p of parsed) {
    if (!p.valid) continue;
    const m = p.valid.matricula.toLowerCase();
    if (!m) continue;
    matriculasEnArchivo.set(m, (matriculasEnArchivo.get(m) ?? 0) + 1);
  }

  // Buscar socios y matrículas existentes en DB en una sola pasada
  const gId = ctx.activeMembership.guarderiaId;
  const emails = Array.from(new Set(parsed.flatMap((p) => (p.valid ? [p.valid.emailSocio] : []))));
  const matriculasArchivoNoVacias = Array.from(matriculasEnArchivo.keys());

  type SocioInfo = { profileId: string; tieneMembership: boolean };
  const socioByEmail = new Map<string, SocioInfo>();
  if (emails.length > 0) {
    const rows = await db
      .select({
        email: profiles.email,
        profileId: profiles.id,
        rolMembership: memberships.rol,
      })
      .from(profiles)
      .leftJoin(
        memberships,
        and(
          eq(memberships.userId, profiles.id),
          eq(memberships.guarderiaId, gId),
          eq(memberships.status, 'active'),
          eq(memberships.rol, 'socio'),
        ),
      )
      .where(inArray(profiles.email, emails));
    for (const r of rows) {
      socioByEmail.set(r.email.toLowerCase(), {
        profileId: r.profileId,
        tieneMembership: r.rolMembership === 'socio',
      });
    }
  }

  // Matrículas ya existentes en esta guardería (compara case-insensitive)
  const matriculasEnDb = new Set<string>();
  if (matriculasArchivoNoVacias.length > 0) {
    const existentes = await db
      .select({ matricula: embarcaciones.matricula })
      .from(embarcaciones)
      .where(eq(embarcaciones.guarderiaId, gId));
    const archivoLowerSet = new Set(matriculasArchivoNoVacias);
    for (const e of existentes) {
      if (!e.matricula) continue;
      const m = e.matricula.toLowerCase();
      if (archivoLowerSet.has(m)) matriculasEnDb.add(m);
    }
  }

  // Combos nombre+profileId ya existentes (solo para filas sin matrícula que pasaron validación)
  const fallbackKeys = new Set<string>();
  for (const p of parsed) {
    if (!p.valid) continue;
    if (p.valid.matricula) continue;
    const socio = socioByEmail.get(p.valid.emailSocio);
    if (!socio || !socio.tieneMembership) continue;
    fallbackKeys.add(`${socio.profileId}::${p.valid.nombre.toLowerCase()}`);
  }
  const fallbackExistentes = new Set<string>();
  if (fallbackKeys.size > 0) {
    const profileIdsParaFallback = Array.from(
      new Set(Array.from(fallbackKeys).map((k) => k.split('::')[0])),
    );
    const existentesSinMatricula = await db
      .select({ profileId: embarcaciones.profileId, nombre: embarcaciones.nombre })
      .from(embarcaciones)
      .where(
        and(
          eq(embarcaciones.guarderiaId, gId),
          isNull(embarcaciones.matricula),
          inArray(embarcaciones.profileId, profileIdsParaFallback),
        ),
      );
    for (const e of existentesSinMatricula) {
      if (!e.profileId || !e.nombre) continue;
      fallbackExistentes.add(`${e.profileId}::${e.nombre.toLowerCase()}`);
    }
  }

  // Construir preview
  const preview: ImportEmbarcacionPreview[] = parsed.map((p) => {
    if (p.errores) {
      return {
        rowIndex: p.rowIndex,
        raw: p.raw,
        status: 'error_validacion' as ImportEmbarcacionStatus,
        mensaje: p.errores.join('. '),
      };
    }
    const v = p.valid!;
    const matLower = v.matricula.toLowerCase();
    if (matLower && (matriculasEnArchivo.get(matLower) ?? 0) > 1) {
      return {
        rowIndex: p.rowIndex,
        raw: p.raw,
        status: 'matricula_duplicada_archivo',
        mensaje: 'Hay otra fila en el archivo con la misma matrícula.',
      };
    }
    const socio = socioByEmail.get(v.emailSocio);
    if (!socio || !socio.tieneMembership) {
      return {
        rowIndex: p.rowIndex,
        raw: p.raw,
        status: 'socio_no_encontrado',
        mensaje: `No encontramos un socio activo con email "${v.emailSocio}" en este club. Cargalo primero en la planilla de Socios.`,
      };
    }
    if (matLower && matriculasEnDb.has(matLower)) {
      return {
        rowIndex: p.rowIndex,
        raw: p.raw,
        status: 'matricula_duplicada',
        mensaje: 'Ya existe un barco con esta matrícula en este club.',
      };
    }
    if (!matLower) {
      const key = `${socio.profileId}::${v.nombre.toLowerCase()}`;
      if (fallbackExistentes.has(key)) {
        return {
          rowIndex: p.rowIndex,
          raw: p.raw,
          status: 'ya_existe_para_socio',
          mensaje: 'Ya existe un barco con este nombre para este socio (sin matrícula).',
        };
      }
    }
    return {
      rowIndex: p.rowIndex,
      raw: p.raw,
      status: 'nuevo',
      mensaje: 'Se crea como nueva embarcación.',
    };
  });

  const resumen: PreviewEmbarcacionesResumen = {
    total: preview.length,
    aCrear: preview.filter((r) => r.status === 'nuevo').length,
    saltados: preview.filter(
      (r) => r.status === 'matricula_duplicada' || r.status === 'ya_existe_para_socio',
    ).length,
    conError: preview.filter(
      (r) =>
        r.status === 'socio_no_encontrado' ||
        r.status === 'matricula_duplicada_archivo' ||
        r.status === 'error_validacion',
    ).length,
  };

  return { rows: preview, resumen };
}

// =============================================================================
// CONFIRM
// =============================================================================
export type ConfirmEmbarcacionesInput = { rows: ImportEmbarcacionPreview[] };

export type ConfirmEmbarcacionesResult = {
  error?: string;
  resumen?: {
    creadas: number;
    saltadas: number;
    falladas: { fila: number; nombre: string; mensaje: string }[];
  };
};

export async function confirmImportEmbarcacionesAction(
  input: ConfirmEmbarcacionesInput,
): Promise<ConfirmEmbarcacionesResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página.' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden importar embarcaciones.' };

  const gId = ctx.activeMembership.guarderiaId;

  // Resolver emails → profileIds para las filas que se van a crear
  const emails = Array.from(
    new Set(
      input.rows
        .filter((r) => r.status === 'nuevo')
        .map((r) => r.raw.emailSocio.trim().toLowerCase()),
    ),
  );

  const profileByEmail = new Map<string, string>();
  if (emails.length > 0) {
    const rows = await db
      .select({ email: profiles.email, id: profiles.id })
      .from(profiles)
      .innerJoin(memberships, eq(memberships.userId, profiles.id))
      .where(
        and(
          inArray(profiles.email, emails),
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
          eq(memberships.status, 'active'),
        ),
      );
    for (const r of rows) profileByEmail.set(r.email.toLowerCase(), r.id);
  }

  let creadas = 0;
  let saltadas = 0;
  const falladas: { fila: number; nombre: string; mensaje: string }[] = [];

  for (const row of input.rows) {
    if (row.status !== 'nuevo') {
      saltadas++;
      continue;
    }
    const email = row.raw.emailSocio.trim().toLowerCase();
    const profileId = profileByEmail.get(email);
    if (!profileId) {
      falladas.push({
        fila: row.rowIndex,
        nombre: row.raw.nombre,
        mensaje: `El socio ${email} dejó de existir entre el preview y la confirmación.`,
      });
      continue;
    }
    try {
      await db.insert(embarcaciones).values({
        guarderiaId: gId,
        profileId,
        nombre: row.raw.nombre.trim(),
        matricula: row.raw.matricula.trim() || null,
        modelo: row.raw.modelo.trim() || null,
        seguro: row.raw.seguro.trim() || null,
      });
      creadas++;
    } catch (err) {
      console.error('[confirmImportEmbarcaciones] error', { fila: row.rowIndex, err });
      falladas.push({
        fila: row.rowIndex,
        nombre: row.raw.nombre,
        mensaje: 'Error al guardar. Revisalo manualmente.',
      });
    }
  }

  revalidatePath('/usuarios');

  return { resumen: { creadas, saltadas, falladas } };
}
