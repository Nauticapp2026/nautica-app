'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { guarderias } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';
import { despacharInvitacionesPendientes } from '@/lib/equipo-invitaciones';
import {
  eliminarCuentasSocios,
  limpiarStorageGuarderia,
  resetearGuarderiaEnTx,
  sociosCompartidos,
  type ResumenReset,
} from '@/lib/reset-guarderia';

const uuidSchema = z.string().uuid('ID inválido.');

const resetSchema = z.object({
  guarderiaId: z.string().uuid('ID inválido.'),
  // El nombre del club escrito por el super admin, letra por letra: es la
  // confirmación de una acción irreversible.
  confirmacion: z.string().trim().min(1),
});

export type ResultadoReset = {
  error?: string;
  resumen?: ResumenReset & {
    archivosBorrados: number;
    cuentasBorradas: number;
    advertencias: string[];
  };
};

/**
 * Deja el club "de cero": conserva la configuración y borra toda la operación
 * (socios, espacios, tarifario, comprobantes, cobranzas, etc.). Ver
 * src/lib/reset-guarderia.ts para el detalle y las reglas.
 *
 * Solo super admin, y solo si el nombre tipeado coincide EXACTO con el del club.
 */
export async function resetGuarderiaAction(
  input: z.infer<typeof resetSchema>,
): Promise<ResultadoReset> {
  await requireSuperAdmin();

  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { error: 'Datos inválidos.' };
  const { guarderiaId, confirmacion } = parsed.data;

  const [club] = await db
    .select({ nombre: guarderias.nombre })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);
  if (!club) return { error: 'Guardería no encontrada.' };
  if (confirmacion !== club.nombre.trim()) {
    return { error: 'El nombre no coincide. Escribilo exactamente como figura.' };
  }

  // Chequeo temprano para dar un mensaje claro antes de abrir la transacción
  // (adentro se vuelve a chequear).
  const compartidos = await sociosCompartidos(guarderiaId);
  if (compartidos.length > 0) {
    return {
      error: `No se puede resetear: ${compartidos.map((c) => c.nombre).join(', ')} ${
        compartidos.length === 1 ? 'pertenece' : 'pertenecen'
      } también a otro club. La cuenta corriente cuelga del socio y no se puede separar por club.`,
    };
  }

  let resumen: ResumenReset;
  try {
    resumen = await db.transaction((tx) => resetearGuarderiaEnTx(tx, guarderiaId));
  } catch (err) {
    console.error('[resetGuarderiaAction] tx', err);
    // Los mensajes propios (socio compartido) se muestran tal cual; un error
    // del driver llega como "Failed query: <SQL entero>" y eso no es para la
    // pantalla — queda en el log.
    const propio = err instanceof Error && err.message.startsWith('No se puede resetear');
    return {
      error: propio
        ? (err as Error).message
        : 'No se pudo resetear la guardería. No se cambió nada: la operación se revirtió entera. Revisá el log del servidor.',
    };
  }

  // Fuera de la transacción: Storage y auth.users no son transaccionales. La
  // base ya quedó consistente; lo que falle acá se informa, no se revierte.
  const advertencias: string[] = [];
  const storage = await limpiarStorageGuarderia(guarderiaId, resumen.perfilesBorrados);
  advertencias.push(...storage.errores.map((e) => `Storage: ${e}`));
  const cuentas = await eliminarCuentasSocios(resumen.perfilesBorrados);
  advertencias.push(...cuentas.errores.map((e) => `Cuenta: ${e}`));

  revalidatePath('/super-admin/guarderias');
  revalidatePath('/super-admin');
  return {
    resumen: {
      ...resumen,
      archivosBorrados: storage.archivos,
      cuentasBorradas: cuentas.borradas,
      advertencias,
    },
  };
}

export async function deleteGuarderiaAction(guarderiaId: string): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const parsed = uuidSchema.safeParse(guarderiaId);
  if (!parsed.success) return { error: 'ID inválido.' };

  // Cascade desde guarderias borra memberships, espacios, embarcaciones,
  // facturación, etc. Las cuentas (auth.users / profiles) NO se borran:
  // son globales a la plataforma y un user puede pertenecer a varias
  // guarderías. Para borrar cuentas, usar el panel de Usuarios.
  await db.delete(guarderias).where(eq(guarderias.id, parsed.data));

  revalidatePath('/super-admin/guarderias');
  revalidatePath('/super-admin');
  return {};
}

const setActivaSchema = z.object({
  guarderiaId: z.string().uuid('ID inválido.'),
  activa: z.boolean(),
});

export async function setGuarderiaActivaAction(
  input: z.infer<typeof setActivaSchema>,
): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const parsed = setActivaSchema.safeParse(input);
  if (!parsed.success) return { error: 'Datos inválidos.' };

  await db
    .update(guarderias)
    .set({ activa: parsed.data.activa, updatedAt: new Date() })
    .where(eq(guarderias.id, parsed.data.guarderiaId));

  // Al dar de alta la guardería salen los mails de invitación al equipo que
  // quedaron encolados durante el onboarding. Los que fallan quedan en la
  // cola y se reintentan si se vuelve a activar.
  if (parsed.data.activa) {
    const { enviadas, errores } = await despacharInvitacionesPendientes(parsed.data.guarderiaId);
    if (errores.length > 0) {
      console.error('[setGuarderiaActivaAction] invitaciones con error', { enviadas, errores });
    }
  }

  revalidatePath('/super-admin/guarderias');
  return {};
}
