/**
 * Aplicación de ajustes de precio programados a futuro (tarifario).
 *
 * El "Ajuste masivo" con vigencia futura no cambia el precio en el momento:
 * agenda una fila en `servicios_ajustes_programados`. Este módulo, invocado
 * por el cron diario (`/api/cron/mensuales`), aplica los ajustes cuya
 * `fechaAplicacion` ya llegó: actualiza el precio del servicio, deja que el
 * trigger escriba el historial (vía GUCs) y marca el ajuste como aplicado.
 *
 * Idempotente: solo toma pendientes (`aplicado = false`) y los marca al
 * aplicarlos, dentro de la misma transacción que el UPDATE.
 */

import { and, eq, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { servicios, serviciosAjustesProgramados } from '@/lib/db/schema';
import { todayArg } from '@/lib/dates';

/**
 * Aplica todos los ajustes programados cuya fecha de aplicación es hoy (AR) o
 * anterior. Devuelve la cantidad de ajustes aplicados.
 */
export async function runAjustesProgramados(now: Date = new Date()): Promise<number> {
  const hoy = todayArg(now);

  const pendientes = await db
    .select({
      id: serviciosAjustesProgramados.id,
      servicioId: serviciosAjustesProgramados.servicioId,
      precioNuevo: serviciosAjustesProgramados.precioNuevo,
      origen: serviciosAjustesProgramados.origen,
      fechaAplicacion: serviciosAjustesProgramados.fechaAplicacion,
      createdBy: serviciosAjustesProgramados.createdBy,
    })
    .from(serviciosAjustesProgramados)
    .where(
      and(
        eq(serviciosAjustesProgramados.aplicado, false),
        lte(serviciosAjustesProgramados.fechaAplicacion, hoy),
      ),
    );

  let aplicados = 0;

  for (const ajuste of pendientes) {
    await db.transaction(async (tx) => {
      // GUCs que lee el trigger `_on_servicio_precio_change` para armar el
      // historial. Tienen que ser locales a esta transacción (is_local=true).
      await tx.execute(sql`SELECT set_config('app.origen_cambio', ${ajuste.origen}, true)`);
      if (ajuste.createdBy) {
        await tx.execute(sql`SELECT set_config('app.usuario_id', ${ajuste.createdBy}, true)`);
      }

      await tx
        .update(servicios)
        .set({
          precio: ajuste.precioNuevo,
          vigenciaDesde: ajuste.fechaAplicacion,
          updatedAt: now,
        })
        .where(eq(servicios.id, ajuste.servicioId));

      await tx
        .update(serviciosAjustesProgramados)
        .set({ aplicado: true, aplicadoAt: now })
        .where(eq(serviciosAjustesProgramados.id, ajuste.id));
    });
    aplicados++;
  }

  return aplicados;
}
