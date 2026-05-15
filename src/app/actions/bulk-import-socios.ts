'use server';

import ExcelJS from 'exceljs';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { memberships, profiles } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { translateInviteError } from '@/lib/auth/errors';
import {
  CONDICION_IVA_MAP,
  TIPO_DOCUMENTO_MAP,
  type ImportRowPreview,
  type ImportRowRaw,
  type ImportRowStatus,
  type PreviewResumen,
} from '@/app/(dashboard)/(admin)/usuarios/bulk-import-types';

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo'
  );
}

// =============================================================================
// Esquema de validación
// =============================================================================
const rowSchema = z.object({
  nombre: z.string().trim().min(1, 'Falta el nombre'),
  apellido: z.string().trim().min(1, 'Falta el apellido'),
  email: z.string().trim().toLowerCase().email('Email inválido'),
  telefono: z.string().trim().optional().default(''),
  direccion: z.string().trim().optional().default(''),
  tipoDocumento: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine(
      (v) => v === '' || v in TIPO_DOCUMENTO_MAP,
      `Tipo de documento inválido. Usá: ${Object.keys(TIPO_DOCUMENTO_MAP).join(', ')}`,
    ),
  numeroDocumento: z.string().trim().optional().default(''),
  razonSocial: z.string().trim().optional().default(''),
  condicionIva: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine(
      (v) => v === '' || v in CONDICION_IVA_MAP,
      `Condición IVA inválida. Usá: ${Object.keys(CONDICION_IVA_MAP).join(', ')}`,
    ),
});

// =============================================================================
// Helpers
// =============================================================================
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

function rowIsEmpty(raw: ImportRowRaw): boolean {
  return Object.values(raw).every((v) => v === '');
}

// =============================================================================
// 1) PREVIEW
// Recibe FormData con el .xlsx, parsea, valida fila por fila y compara contra
// la DB. NO escribe nada.
// =============================================================================
export async function previewImportSociosAction(
  formData: FormData,
): Promise<{ error?: string; rows?: ImportRowPreview[]; resumen?: PreviewResumen }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página.' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden importar socios.' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'No llegó el archivo.' };
  if (file.size === 0) return { error: 'El archivo está vacío.' };
  if (file.size > 10 * 1024 * 1024) return { error: 'El archivo supera los 10 MB.' };

  // Parse del Excel
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

  // Mapear índices de columna por nombre del header (fila 1, sin " *" ni espacios)
  const headerRow = ws.getRow(1);
  const headerMap: Record<string, number> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const name = cellText(cell)
      .replace(/\s*\*\s*$/, '')
      .trim()
      .toLowerCase();
    if (name) headerMap[name] = col;
  });

  const requiredHeaders = ['nombre', 'apellido', 'email'];
  for (const h of requiredHeaders) {
    if (!(h in headerMap)) {
      return { error: `Falta la columna "${h}" en el archivo. ¿Es la plantilla correcta?` };
    }
  }

  function readCell(row: ExcelJS.Row, header: string): string {
    const col = headerMap[header];
    if (!col) return '';
    return cellText(row.getCell(col));
  }

  // Levantar filas de datos (a partir de la 3, porque la 2 es de hints)
  const rawRows: { rowIndex: number; raw: ImportRowRaw }[] = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw: ImportRowRaw = {
      nombre: readCell(row, 'nombre'),
      apellido: readCell(row, 'apellido'),
      email: readCell(row, 'email'),
      telefono: readCell(row, 'telefono'),
      direccion: readCell(row, 'direccion'),
      tipoDocumento: readCell(row, 'tipo_documento'),
      numeroDocumento: readCell(row, 'numero_documento'),
      razonSocial: readCell(row, 'razon_social'),
      condicionIva: readCell(row, 'condicion_iva'),
    };
    if (rowIsEmpty(raw)) continue; // saltar filas vacías
    rawRows.push({ rowIndex: r, raw });
  }

  if (rawRows.length === 0) {
    return { error: 'No encontramos filas con datos. ¿Las cargaste a partir de la fila 3?' };
  }

  // Validación Zod + detección de duplicados internos
  type Parsed = {
    rowIndex: number;
    raw: ImportRowRaw;
    valid?: z.infer<typeof rowSchema>;
    errores?: string[];
  };
  const parsed: Parsed[] = rawRows.map(({ rowIndex, raw }) => {
    const result = rowSchema.safeParse(raw);
    if (!result.success) {
      return {
        rowIndex,
        raw,
        errores: result.error.issues.map((i) => i.message),
      };
    }
    return { rowIndex, raw, valid: result.data };
  });

  const emailCount = new Map<string, number>();
  for (const p of parsed) {
    if (!p.valid) continue;
    emailCount.set(p.valid.email, (emailCount.get(p.valid.email) ?? 0) + 1);
  }

  // Una sola query contra DB con todos los emails únicos válidos
  const emails = Array.from(emailCount.keys());
  const gId = ctx.activeMembership.guarderiaId;

  type ExistingInfo = { profileId: string; rolEnGuarderia: string | null };
  const existingByEmail = new Map<string, ExistingInfo>();
  if (emails.length > 0) {
    const rows = await db
      .select({
        email: profiles.email,
        profileId: profiles.id,
        rolEnGuarderia: memberships.rol,
      })
      .from(profiles)
      .leftJoin(
        memberships,
        and(eq(memberships.userId, profiles.id), eq(memberships.guarderiaId, gId)),
      )
      .where(inArray(profiles.email, emails));
    for (const r of rows) {
      existingByEmail.set(r.email.toLowerCase(), {
        profileId: r.profileId,
        rolEnGuarderia: r.rolEnGuarderia,
      });
    }
  }

  // Construir el preview
  const preview: ImportRowPreview[] = parsed.map((p) => {
    if (p.errores) {
      return {
        rowIndex: p.rowIndex,
        raw: p.raw,
        status: 'error_validacion' as ImportRowStatus,
        mensaje: p.errores.join('. '),
      };
    }
    const v = p.valid!;
    if ((emailCount.get(v.email) ?? 0) > 1) {
      return {
        rowIndex: p.rowIndex,
        raw: p.raw,
        status: 'email_duplicado',
        mensaje: 'Ese mismo email aparece en otra fila del archivo.',
      };
    }
    const existing = existingByEmail.get(v.email);
    if (!existing) {
      return {
        rowIndex: p.rowIndex,
        raw: p.raw,
        status: 'nuevo',
        mensaje: 'Se crea como socio nuevo y se envía la invitación por mail.',
      };
    }
    if (existing.rolEnGuarderia === null) {
      return {
        rowIndex: p.rowIndex,
        raw: p.raw,
        status: 'otra_guarderia',
        mensaje: 'Ya tiene cuenta en otro club. Se vincula como socio acá sin tocar sus datos.',
      };
    }
    if (existing.rolEnGuarderia === 'socio') {
      return {
        rowIndex: p.rowIndex,
        raw: p.raw,
        status: 'ya_es_socio',
        mensaje: 'Ya es socio de este club. No se modifica.',
      };
    }
    return {
      rowIndex: p.rowIndex,
      raw: p.raw,
      status: 'bloqueado',
      mensaje: `Ya pertenece a este club con rol "${existing.rolEnGuarderia}". No se importa para no pisar datos.`,
    };
  });

  const resumen: PreviewResumen = {
    total: preview.length,
    aCrear: preview.filter((r) => r.status === 'nuevo').length,
    aVincular: preview.filter((r) => r.status === 'otra_guarderia').length,
    saltados: preview.filter((r) => r.status === 'ya_es_socio').length,
    conError: preview.filter(
      (r) =>
        r.status === 'bloqueado' ||
        r.status === 'error_validacion' ||
        r.status === 'email_duplicado',
    ).length,
  };

  return { rows: preview, resumen };
}

// =============================================================================
// 2) CONFIRM
// Recibe las filas validadas del preview. Crea usuarios + perfiles + memberships.
// Manda invitación por mail vía Supabase admin para los nuevos.
// =============================================================================
export type ConfirmInput = {
  rows: ImportRowPreview[];
};

export type ConfirmResult = {
  error?: string;
  resumen?: {
    creados: number;
    vinculados: number;
    saltados: number;
    falladas: { fila: number; email: string; mensaje: string }[];
  };
};

export async function confirmImportSociosAction(input: ConfirmInput): Promise<ConfirmResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página.' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden importar socios.' };

  const gId = ctx.activeMembership.guarderiaId;
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  let creados = 0;
  let vinculados = 0;
  let saltados = 0;
  const falladas: { fila: number; email: string; mensaje: string }[] = [];

  for (const row of input.rows) {
    // Las filas con error / bloqueadas / duplicadas / ya socio no se procesan
    if (
      row.status === 'error_validacion' ||
      row.status === 'bloqueado' ||
      row.status === 'email_duplicado' ||
      row.status === 'ya_es_socio'
    ) {
      saltados++;
      continue;
    }

    const email = row.raw.email.trim().toLowerCase();
    const tipoDoc = TIPO_DOCUMENTO_MAP[row.raw.tipoDocumento] ?? null;
    const condIva = CONDICION_IVA_MAP[row.raw.condicionIva] ?? null;

    try {
      if (row.status === 'nuevo') {
        // Crear auth user + mandar invitación
        const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
          email,
          { redirectTo: `${appUrl}/auth/callback?next=/crear-cuenta` },
        );
        if (inviteError) {
          falladas.push({
            fila: row.rowIndex,
            email,
            mensaje: translateInviteError(inviteError.message),
          });
          continue;
        }
        const profileId = inviteData.user.id;

        // Upsert profile — si el trigger ya creó la fila vacía, la completamos
        await db
          .insert(profiles)
          .values({
            id: profileId,
            email,
            nombre: row.raw.nombre.trim() || null,
            apellido: row.raw.apellido.trim() || null,
            telefono: row.raw.telefono.trim() || null,
            direccion: row.raw.direccion.trim() || null,
            tipoDocumento: tipoDoc as never,
            numeroDocumento: row.raw.numeroDocumento.trim() || null,
            razonSocial: row.raw.razonSocial.trim() || null,
            condicionIva: condIva as never,
            estadoSocio: 'activo',
          })
          .onConflictDoUpdate({
            target: profiles.id,
            set: {
              email,
              nombre: row.raw.nombre.trim() || null,
              apellido: row.raw.apellido.trim() || null,
              telefono: row.raw.telefono.trim() || null,
              direccion: row.raw.direccion.trim() || null,
              tipoDocumento: tipoDoc as never,
              numeroDocumento: row.raw.numeroDocumento.trim() || null,
              razonSocial: row.raw.razonSocial.trim() || null,
              condicionIva: condIva as never,
              estadoSocio: 'activo',
            },
          });

        await db.insert(memberships).values({
          userId: profileId,
          guarderiaId: gId,
          rol: 'socio',
          status: 'active',
        });

        creados++;
      } else if (row.status === 'otra_guarderia') {
        // Buscar el profile existente y agregar solo el membership
        const [p] = await db
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.email, email))
          .limit(1);
        if (!p) {
          falladas.push({
            fila: row.rowIndex,
            email,
            mensaje: 'No encontramos el perfil existente.',
          });
          continue;
        }
        await db.insert(memberships).values({
          userId: p.id,
          guarderiaId: gId,
          rol: 'socio',
          status: 'active',
        });
        vinculados++;
      }
    } catch (err) {
      console.error('[confirmImportSocios] error', { email, err });
      falladas.push({
        fila: row.rowIndex,
        email,
        mensaje: 'Error al guardar en la base. Revisalo manualmente.',
      });
    }
  }

  revalidatePath('/usuarios');

  return { resumen: { creados, vinculados, saltados, falladas } };
}
