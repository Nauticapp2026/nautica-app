'use server';

import { z } from 'zod';

import { db } from '@/lib/db';
import { terminosAceptaciones } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth/session';
import { getVersionVigente } from '@/lib/auth/terminos';

const aceptarSchema = z.object({
  version: z.number().int().positive('Versión inválida.'),
});

export async function aceptarTerminosAction(
  input: z.infer<typeof aceptarSchema>,
): Promise<{ error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: 'No autenticado.' };

    const parsed = aceptarSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
    }

    // Validar que la versión que el cliente dice aceptar sea efectivamente
    // la vigente. Si publicaron una nueva entre que cargó la página y
    // tildó "Aceptar", lo forzamos a re-aceptar la nueva.
    const vigente = await getVersionVigente();
    if (!vigente) return { error: 'No hay términos publicados.' };
    if (vigente.version !== parsed.data.version) {
      return {
        error: 'Se publicó una nueva versión de los términos. Recargá para verla.',
      };
    }

    await db.insert(terminosAceptaciones).values({
      userId: user.id,
      version: parsed.data.version,
    });

    return {};
  } catch (err) {
    // Log explícito para que aparezca en Vercel y podamos diagnosticar el
    // caso reportado de "se quedó en Guardando…" sin error visible.
    console.error('[aceptarTerminosAction] error', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `No se pudo guardar la aceptación. ${msg}` };
  }
}
