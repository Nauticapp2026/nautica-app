'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { memberships, movimientosCuentaCorriente } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { getLedgerSaldoAFavor, type LedgerSaldoAFavor } from '@/lib/reconciliar-cuenta';

/** Una fila del historial de saldo a favor, tal como la consume la ficha del socio. */
export type LedgerSaldoAFavorEntry = LedgerSaldoAFavor;
import { and, eq } from 'drizzle-orm';

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo' ||
    ctx.activeMembership.rol === 'contable'
  );
}

// Anular un pago a cuenta. Admin only. Solo se puede borrar movimientos
// que sean efectivamente pagos (haber > 0) — no toca cargos ni movimientos
// que ya fueron facturados.
export async function eliminarPagoAction(movimientoId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden anular pagos.' };

  const [mov] = await db
    .select({
      id: movimientosCuentaCorriente.id,
      socioId: movimientosCuentaCorriente.socioId,
      haber: movimientosCuentaCorriente.haber,
      debe: movimientosCuentaCorriente.debe,
    })
    .from(movimientosCuentaCorriente)
    .where(eq(movimientosCuentaCorriente.id, movimientoId))
    .limit(1);

  if (!mov) return { error: 'El pago no existe o ya fue eliminado.' };
  if (parseFloat(mov.haber ?? '0') <= 0 || parseFloat(mov.debe ?? '0') > 0) {
    return { error: 'Solo se pueden anular pagos a cuenta.' };
  }

  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, mov.socioId),
        eq(memberships.guarderiaId, ctx.activeMembership.guarderiaId),
      ),
    );
  if (!m) return { error: 'El pago no pertenece a esta guardería.' };

  try {
    await db
      .delete(movimientosCuentaCorriente)
      .where(eq(movimientosCuentaCorriente.id, movimientoId));
    revalidatePath(`/usuarios/${mov.socioId}`);
    return {};
  } catch {
    return { error: 'Error al anular el pago.' };
  }
}

// Historial del saldo a favor de un socio: de dónde salió cada peso de crédito y
// en qué se usó. Se carga on-demand al abrir el detalle (no en cada render de la
// ficha), porque recorre toda la cuenta corriente del socio.
export async function getLedgerSaldoAFavorAction(
  socioId: string,
): Promise<{ error?: string; entradas?: LedgerSaldoAFavor[] }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden ver el saldo a favor.' };

  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, socioId),
        eq(memberships.guarderiaId, ctx.activeMembership.guarderiaId),
      ),
    );
  if (!m) return { error: 'El socio no pertenece a esta guardería.' };

  try {
    return { entradas: await getLedgerSaldoAFavor(socioId) };
  } catch {
    return { error: 'Error al cargar el historial del saldo a favor.' };
  }
}
