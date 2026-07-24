import { and, count, eq, gte, isNull, ne, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { servicios, socioServicios, socioServiciosCancelados } from '@/lib/db/schema';
import { todayArg } from '@/lib/dates';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Correlativo global por guardería (entre todos los socios), nunca
 * reasignado. Mismo patrón que `nextFolioLocal` en facturacion.ts, sin
 * prefijo de letra. Debe llamarse dentro de la misma transacción que el
 * INSERT para evitar la carrera count-then-insert.
 */
async function nextNumeroOperacion(tx: Tx, guarderiaId: string): Promise<number> {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(socioServicios)
    .where(eq(socioServicios.guarderiaId, guarderiaId));
  return Number(n) + 1;
}

/**
 * true si (socioId, servicioId) tiene un contrato Vigente hoy que bloquea
 * volver a contratar el mismo servicio.
 *
 * Tarifas Variable: nunca bloquean. Cada contratación es una fila one-shot
 * independiente (3 lavados en el mes = 3 contratos distintos); con el modelo
 * "los cargos nacen al emitir" el contrato queda abierto hasta la próxima
 * emisión, y aun abierto no debe impedir re-contratar — el índice único
 * one-shot de la mig 0133 garantiza un solo cobro por contrato.
 */
export async function hayContratoVigente(
  guarderiaId: string,
  socioId: string,
  servicioId: string,
): Promise<boolean> {
  const hoy = todayArg();
  const [row] = await db
    .select({ id: socioServicios.id })
    .from(socioServicios)
    .innerJoin(servicios, eq(servicios.id, socioServicios.servicioId))
    .where(
      and(
        eq(socioServicios.guarderiaId, guarderiaId),
        eq(socioServicios.socioId, socioId),
        eq(socioServicios.servicioId, servicioId),
        ne(servicios.tipoCobro, 'variable'),
        or(isNull(socioServicios.fechaBaja), gte(socioServicios.fechaBaja, hoy)),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Crea un contrato nuevo (fila `socio_servicios`) dentro de una transacción:
 * asigna el próximo número de operación y, si había una cancelación previa
 * para este (socio, servicio), la borra (re-contratar) para que el cron de
 * facturación mensual vuelva a generar el cargo recurrente.
 */
export async function crearSocioServicio(
  tx: Tx,
  params: {
    guarderiaId: string;
    socioId: string;
    servicioId: string;
    espacioId?: string;
    fechaInicio: string;
    fechaBaja?: string | null;
    comprobanteInterno?: boolean;
    concepto?: string | null;
    // Solo para tarifas Variable diaria: días contratados.
    cantidadDias?: number | null;
    createdBy: string;
  },
): Promise<{ id: string; numeroOperacion: number }> {
  const numeroOperacion = await nextNumeroOperacion(tx, params.guarderiaId);

  await tx
    .delete(socioServiciosCancelados)
    .where(
      and(
        eq(socioServiciosCancelados.socioId, params.socioId),
        eq(socioServiciosCancelados.servicioId, params.servicioId),
        eq(socioServiciosCancelados.guarderiaId, params.guarderiaId),
      ),
    );

  const [row] = await tx
    .insert(socioServicios)
    .values({
      guarderiaId: params.guarderiaId,
      socioId: params.socioId,
      servicioId: params.servicioId,
      espacioId: params.espacioId ?? null,
      numeroOperacion,
      fechaInicio: params.fechaInicio,
      fechaBaja: params.fechaBaja ?? null,
      comprobanteInterno: params.comprobanteInterno ?? false,
      concepto: params.concepto ?? null,
      cantidadDias: params.cantidadDias ?? null,
      createdBy: params.createdBy,
    })
    .returning({ id: socioServicios.id });

  return { id: row.id, numeroOperacion };
}

/**
 * Cierra (fechaBaja = hoy) el/los contrato(s) abiertos de un socio para un
 * servicio (opcionalmente atado a un espacio puntual). Usado cuando se
 * libera un espacio por afuera del flujo de "Editar servicio contratado"
 * (des-asignar, mudanza que deja el origen vacío, borrar una embarcación) —
 * no toca `socio_servicios_cancelados`: en esos casos la facturación ya se
 * frena por otra vía (espacio sin ocupante).
 */
export async function cerrarContratoAbierto(params: {
  socioId: string;
  servicioId: string;
  espacioId?: string;
}): Promise<void> {
  const hoy = todayArg();
  await db
    .update(socioServicios)
    .set({ fechaBaja: hoy, updatedAt: new Date() })
    .where(
      and(
        eq(socioServicios.socioId, params.socioId),
        eq(socioServicios.servicioId, params.servicioId),
        ...(params.espacioId ? [eq(socioServicios.espacioId, params.espacioId)] : []),
        isNull(socioServicios.fechaBaja),
      ),
    );
}
