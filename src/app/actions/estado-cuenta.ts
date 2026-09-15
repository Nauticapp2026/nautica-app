'use server';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { guarderias, memberships, profiles } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { ADMIN_ROLES } from '@/config/roles';
import { sendEmail } from '@/lib/email/resend';
import { estadoCuentaEmail } from '@/lib/email/templates/estado-cuenta';
import { formatArgentinaDate } from '@/lib/dates';

// El PDF se genera en el NAVEGADOR (ver src/lib/estado-cuenta-pdf.ts) con las
// mismas filas que la tabla que el admin está viendo, y llega acá en base64
// para salir como adjunto. Por eso este action no arma el documento: solo
// verifica que el socio sea del club, que el archivo sea un PDF y lo manda.
const MAX_PDF_BYTES = 5 * 1024 * 1024;

const schema = z.object({
  socioId: z.string().uuid(),
  email: z.string().trim().email('El email no es válido.'),
  mensaje: z
    .string()
    .trim()
    .max(1000, 'El mensaje no puede superar los 1000 caracteres.')
    .nullable(),
  // base64 de un PDF de hasta 5 MB (~6,7 M de caracteres). El tope de caracteres
  // corta antes de decodificar; el de bytes se vuelve a chequear después.
  pdfBase64: z.string().min(100).max(7_000_000),
  // Lo arma nombreArchivoEstadoCuenta(): solo minúsculas, dígitos y guiones.
  nombreArchivo: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z0-9-]+\.pdf$/, 'Nombre de archivo inválido.'),
  resumen: z.object({
    ventas: z.string().max(40),
    cobranzas: z.string().max(40),
    saldo: z.string().max(40),
    saldoLabel: z.string().max(40),
    movimientos: z.number().int().nonnegative(),
  }),
});

export type EnviarEstadoCuentaInput = z.infer<typeof schema>;

/**
 * Manda por mail al socio su estado de cuenta con el PDF adjunto.
 *
 * El destinatario lo elige el admin en la pantalla (arranca en el mail de
 * facturación del socio o el de su cuenta), así que se recibe como parámetro y
 * no se vuelve a leer del perfil: si el club quiere mandárselo a otro mail (un
 * contador, un familiar), puede.
 */
export async function enviarEstadoCuentaAction(
  input: EnviarEstadoCuentaInput,
): Promise<{ error?: string; email?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }

  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };
  // Mismo gate que el resto de las acciones de admin: los tres roles de
  // ADMIN_ROLES o un super admin.
  if (
    !ctx.profile.isSuperAdmin &&
    !(ADMIN_ROLES as readonly string[]).includes(ctx.activeMembership.rol)
  ) {
    return { error: 'Solo administradores pueden enviar el estado de cuenta.' };
  }
  const gId = ctx.activeMembership.guarderiaId;
  const { socioId, email, mensaje, pdfBase64, nombreArchivo, resumen } = parsed.data;

  // El socio tiene que ser de ESTE club: sin este join, un admin podría mandar
  // "en nombre del club" un PDF a cualquier id de la plataforma.
  const [row] = await db
    .select({
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      clubNombre: guarderias.nombre,
      clubRazonSocial: guarderias.razonSocial,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .innerJoin(guarderias, eq(guarderias.id, memberships.guarderiaId))
    .where(
      and(
        eq(memberships.userId, socioId),
        eq(memberships.guarderiaId, gId),
        eq(memberships.rol, 'socio'),
      ),
    )
    .limit(1);
  if (!row) return { error: 'Socio no encontrado.' };

  const pdf = Buffer.from(pdfBase64, 'base64');
  // Firma de todo PDF: si no empieza así, no es lo que dice ser.
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { error: 'El archivo generado no es un PDF válido. Probá de nuevo.' };
  }
  if (pdf.length > MAX_PDF_BYTES) {
    return {
      error: 'El estado de cuenta es demasiado grande para enviarlo por mail (más de 5 MB).',
    };
  }

  const socioNombre = [row.nombre, row.apellido].filter(Boolean).join(' ') || 'socio';
  const { subject, html } = estadoCuentaEmail({
    clubNombre: row.clubRazonSocial ?? row.clubNombre,
    socioNombre,
    fecha: formatArgentinaDate(new Date()),
    saldoLabel: resumen.saldoLabel,
    saldoFmt: resumen.saldo,
    mensaje,
    movimientos: resumen.movimientos,
  });

  const enviado = await sendEmail({
    to: email,
    subject,
    html,
    attachments: [{ filename: nombreArchivo, content: pdf }],
  });
  if (!enviado.ok) return { error: `No se pudo enviar el mail: ${enviado.error}` };

  return { email };
}
