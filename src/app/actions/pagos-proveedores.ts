'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';

import { contextoAdmin, esError } from '@/lib/auth/contexto-admin';
import {
  TIPO_ANTICIPO,
  codigoCp,
  codigoOp,
  redondear,
  signoDe,
} from '@/lib/cuentas-a-pagar/constantes';
import { todayArg } from '@/lib/dates';
import { db } from '@/lib/db';
import {
  cpComprobantes,
  cpComprobantesHistorial,
  cpPagoAplicaciones,
  cpPagoMedios,
  cpPagos,
  proveedores,
} from '@/lib/db/schema';
import { primerError, uuid } from '@/lib/esquemas-comunes';
import { cuentaCorrienteProveedor, type FilaCuentaCorriente } from '@/lib/pagos/consultas';
import {
  MEDIOS_VALUES,
  limpiarDatosMedio,
  validarDatosMedio,
  type MedioPago,
} from '@/lib/pagos/medios';

export type ResultadoPago = { error?: string; aviso?: string };
export type ResultadoCrearPago = ResultadoPago & { id?: string; codigo?: string };

function revalidar() {
  revalidatePath('/circuito-de-pagos');
  revalidatePath('/cuentas-a-pagar');
}

// ─── Cuenta corriente del proveedor ─────────────────────────────────────────

/** Comprobantes con saldo de un proveedor del club (para armar el pago). */
export async function cuentaCorrienteProveedorAction(
  proveedorId: string,
  moneda: string,
): Promise<{ error?: string; filas?: FilaCuentaCorriente[] }> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };
  if (!uuid.safeParse(proveedorId).success || (moneda !== 'PES' && moneda !== 'DOL')) {
    return { error: 'Datos inválidos.' };
  }
  const [prov] = await db
    .select({ id: proveedores.id })
    .from(proveedores)
    .where(and(eq(proveedores.id, proveedorId), eq(proveedores.guarderiaId, c.gId)))
    .limit(1);
  if (!prov) return { error: 'No encontramos ese proveedor.' };
  return { filas: await cuentaCorrienteProveedor(c.gId, proveedorId, moneda) };
}

// ─── Nuevo pago ─────────────────────────────────────────────────────────────

const importePositivo = z
  .number({ error: 'Revisá los importes: hay un valor que no es un número.' })
  .finite()
  .max(999_999_999.99, 'Un importe es demasiado grande.');

const pagoSchema = z.object({
  proveedorId: uuid,
  tipo: z.enum(['comprobantes', 'anticipo']),
  moneda: z.enum(['PES', 'DOL'], { error: 'Elegí la moneda.' }),
  tipoCambio: z.number().finite().positive().max(1_000_000).nullable(),
  observaciones: z.string().trim().max(500, 'Las observaciones pueden tener hasta 500 caracteres.'),
  lineas: z
    .array(
      z.object({
        comprobanteId: uuid,
        monto: importePositivo.gt(0, 'El monto a aplicar tiene que ser mayor a cero.'),
        /** Descuento (+) o ajuste / recargo (−) sobre la línea; solo facturas y notas de débito. */
        descuento: importePositivo,
      }),
    )
    .max(100, 'Hasta 100 comprobantes por pago.'),
  medios: z
    .array(
      z.object({
        medio: z.string().refine((m) => MEDIOS_VALUES.includes(m), 'Elegí el medio de pago.'),
        monto: importePositivo.gt(0, 'El monto de cada medio de pago tiene que ser mayor a cero.'),
        datos: z.record(z.string(), z.unknown()),
      }),
    )
    .max(10, 'Hasta 10 medios de pago.'),
});

/** Error interno para cortar la transacción con un mensaje para el usuario. */
class ErrorPago extends Error {}

/**
 * Registra una orden de pago a un proveedor: cancela total o parcialmente comprobantes en
 * estado A (compensando facturas y notas de débito contra notas de crédito y anticipos) o
 * entrega un anticipo. Se puede pagar con uno o varios medios. Genera el número de orden de
 * pago (Next Number del club). Todo en una transacción, con los comprobantes bloqueados para
 * que dos pagos simultáneos no usen el mismo saldo.
 */
export async function crearPagoAction(
  input: z.input<typeof pagoSchema>,
): Promise<ResultadoCrearPago> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };

  const parsed = pagoSchema.safeParse(input);
  if (!parsed.success) return { error: primerError(parsed.error) };
  const d = parsed.data;

  if (d.moneda === 'DOL' && !d.tipoCambio) {
    return { error: 'Con moneda dólares el tipo de cambio es obligatorio.' };
  }

  // Datos específicos de cada medio.
  const medios: { medio: MedioPago; monto: number; datos: Record<string, string> }[] = [];
  for (const m of d.medios) {
    const medio = m.medio as MedioPago;
    const datos = limpiarDatosMedio(medio, m.datos);
    const err = validarDatosMedio(medio, datos);
    if (err) return { error: err };
    medios.push({ medio, monto: redondear(m.monto), datos });
  }
  const totalMedios = redondear(medios.reduce((s, m) => s + m.monto, 0));

  if (d.tipo === 'anticipo') {
    if (d.lineas.length > 0) return { error: 'Un anticipo no cancela comprobantes.' };
    if (!(totalMedios > 0)) return { error: 'Cargá con qué se paga el anticipo.' };
  } else if (d.lineas.length === 0) {
    return { error: 'Elegí al menos un comprobante a pagar.' };
  }

  const [prov] = await db
    .select({ id: proveedores.id })
    .from(proveedores)
    .where(and(eq(proveedores.id, d.proveedorId), eq(proveedores.guarderiaId, c.gId)))
    .limit(1);
  if (!prov) return { error: 'Ese proveedor no existe en el Maestro de Proveedores.' };

  const hoy = todayArg();

  for (let intento = 0; intento < 5; intento++) {
    try {
      const res = await db.transaction(async (tx) => {
        // ── Comprobantes: bloqueados, del club y de ese proveedor, en estado A ──
        const ids = [...new Set(d.lineas.map((l) => l.comprobanteId))];
        if (ids.length !== d.lineas.length) {
          throw new ErrorPago('Un comprobante está repetido en el pago.');
        }
        const cps = ids.length
          ? await tx
              .select()
              .from(cpComprobantes)
              .where(
                and(
                  inArray(cpComprobantes.id, ids),
                  eq(cpComprobantes.guarderiaId, c.gId),
                  eq(cpComprobantes.proveedorId, d.proveedorId),
                ),
              )
              .for('update')
          : [];
        if (cps.length !== ids.length) {
          throw new ErrorPago('Algún comprobante no pertenece a ese proveedor.');
        }

        // Lo ya aplicado por pagos vigentes, dentro de la transacción (con las filas bloqueadas).
        const aplicado = new Map<string, number>();
        if (ids.length) {
          const filas = await tx
            .select({
              comprobanteId: cpPagoAplicaciones.comprobanteId,
              aplicado: sql<string>`sum(${cpPagoAplicaciones.montoAplicado})`,
            })
            .from(cpPagoAplicaciones)
            .innerJoin(cpPagos, eq(cpPagos.id, cpPagoAplicaciones.pagoId))
            .where(
              and(
                eq(cpPagoAplicaciones.guarderiaId, c.gId),
                eq(cpPagos.estado, 'pagado'),
                inArray(cpPagoAplicaciones.comprobanteId, ids),
              ),
            )
            .groupBy(cpPagoAplicaciones.comprobanteId);
          for (const f of filas) aplicado.set(f.comprobanteId, Number(f.aplicado));
        }

        let netoComprobantes = 0; // lo que cancela el pago, con signo (antes de descuentos)
        let efectivoNecesario = 0; // lo que hay que pagar con los medios
        const lineas: {
          cp: (typeof cps)[number];
          monto: number;
          descuento: number;
          saldoPrevio: number;
          signo: 1 | -1;
        }[] = [];
        for (const l of d.lineas) {
          const cp = cps.find((x) => x.id === l.comprobanteId)!;
          const nombre =
            cp.origen === 'anticipo'
              ? `El anticipo ${codigoCp(cp.numero)}`
              : `El comprobante ${codigoCp(cp.numero)}`;
          if (cp.estado !== 'A') {
            throw new ErrorPago(
              `${nombre} no está en estado A: solo se pueden pagar comprobantes autorizados.`,
            );
          }
          if (cp.moneda !== d.moneda) {
            throw new ErrorPago(`${nombre} está en otra moneda que el pago.`);
          }
          const saldoPrevio = redondear(Number(cp.total) - (aplicado.get(cp.id) ?? 0));
          const monto = redondear(l.monto);
          if (monto > saldoPrevio + 0.001) {
            throw new ErrorPago(
              `${nombre} tiene un saldo de ${saldoPrevio.toFixed(2)}: no se puede aplicar más.`,
            );
          }
          const signo = signoDe(cp.tipoComprobante);
          const descuento = redondear(l.descuento);
          if (signo === -1 && descuento !== 0) {
            throw new ErrorPago(
              'Las notas de crédito y los anticipos no llevan descuento ni ajuste.',
            );
          }
          if (Math.abs(descuento) > monto + 0.001) {
            throw new ErrorPago(
              `${nombre}: el descuento o ajuste no puede superar el monto aplicado.`,
            );
          }
          netoComprobantes += signo * monto;
          efectivoNecesario += signo === 1 ? monto - descuento : -monto;
          lineas.push({ cp, monto, descuento, saldoPrevio, signo });
        }
        netoComprobantes = redondear(netoComprobantes);
        efectivoNecesario = redondear(efectivoNecesario);

        if (d.tipo === 'comprobantes') {
          if (efectivoNecesario < 0) {
            throw new ErrorPago(
              'Las notas de crédito y los anticipos superan a las facturas elegidas. Sumá facturas o notas de débito, o aplicá menos.',
            );
          }
          if (efectivoNecesario === 0 && !lineas.some((l) => l.signo === 1)) {
            throw new ErrorPago('Elegí al menos una factura o nota de débito.');
          }
          if (Math.abs(totalMedios - efectivoNecesario) > 0.001) {
            throw new ErrorPago(
              `Los medios de pago suman ${totalMedios.toFixed(2)} y el total a pagar es ${efectivoNecesario.toFixed(2)}. Tienen que coincidir.`,
            );
          }
        }

        // ── Next Number de la orden de pago ──
        const [ult] = await tx
          .select({ ultimo: max(cpPagos.numero) })
          .from(cpPagos)
          .where(eq(cpPagos.guarderiaId, c.gId));
        const numero = (ult?.ultimo ?? 0) + 1 + intento;

        const [pago] = await tx
          .insert(cpPagos)
          .values({
            guarderiaId: c.gId,
            numero,
            proveedorId: d.proveedorId,
            tipo: d.tipo,
            fechaPago: hoy,
            moneda: d.moneda,
            tipoCambio: d.moneda === 'DOL' ? String(d.tipoCambio) : null,
            montoComprobantes: netoComprobantes.toFixed(2),
            montoPagado: totalMedios.toFixed(2),
            observaciones: d.observaciones || null,
            estado: 'pagado',
            createdBy: c.userId,
          })
          .returning({ id: cpPagos.id });
        const op = codigoOp(numero);

        if (medios.length > 0) {
          await tx.insert(cpPagoMedios).values(
            medios.map((m, i) => ({
              guarderiaId: c.gId,
              pagoId: pago.id,
              medio: m.medio,
              monto: m.monto.toFixed(2),
              datos: m.datos,
              orden: i,
            })),
          );
        }

        // ── Aplicaciones y cambio de estado de los comprobantes ──
        for (const l of lineas) {
          await tx.insert(cpPagoAplicaciones).values({
            guarderiaId: c.gId,
            pagoId: pago.id,
            comprobanteId: l.cp.id,
            montoAplicado: l.monto.toFixed(2),
            descuentoAjuste: l.descuento.toFixed(2),
            saldoPrevio: l.saldoPrevio.toFixed(2),
          });
          const cancelado = redondear(l.saldoPrevio - l.monto) <= 0.001;
          if (cancelado) {
            await tx
              .update(cpComprobantes)
              .set({ estado: 'P', fechaPago: hoy, updatedBy: c.userId, updatedAt: new Date() })
              .where(and(eq(cpComprobantes.id, l.cp.id), eq(cpComprobantes.guarderiaId, c.gId)));
          }
          await tx.insert(cpComprobantesHistorial).values({
            guarderiaId: c.gId,
            comprobanteId: l.cp.id,
            estadoDesde: 'A',
            estadoHasta: cancelado ? 'P' : 'A',
            usuarioId: c.userId,
            detalle: cancelado ? `Pagado con ${op}` : `Pago parcial con ${op}`,
          });
        }

        // ── Anticipo: nace un comprobante con saldo a favor, ya autorizado ──
        if (d.tipo === 'anticipo') {
          const [ultCp] = await tx
            .select({ ultimo: max(cpComprobantes.numero) })
            .from(cpComprobantes)
            .where(eq(cpComprobantes.guarderiaId, c.gId));
          const numeroCp = (ultCp?.ultimo ?? 0) + 1 + intento;
          const [ant] = await tx
            .insert(cpComprobantes)
            .values({
              guarderiaId: c.gId,
              numero: numeroCp,
              origen: 'anticipo',
              proveedorId: d.proveedorId,
              fechaEmision: hoy,
              tipoComprobante: TIPO_ANTICIPO.value,
              fechaContabilizacion: hoy,
              moneda: d.moneda,
              tipoCambio: d.moneda === 'DOL' ? String(d.tipoCambio) : null,
              total: totalMedios.toFixed(2),
              estado: 'A',
              autorizadoPor: c.userId,
              autorizadoAt: new Date(),
              observaciones: d.observaciones || null,
              pagoOrigenId: pago.id,
              createdBy: c.userId,
              updatedBy: c.userId,
            })
            .returning({ id: cpComprobantes.id });
          await tx.insert(cpComprobantesHistorial).values({
            guarderiaId: c.gId,
            comprobanteId: ant.id,
            estadoDesde: null,
            estadoHasta: 'A',
            usuarioId: c.userId,
            detalle: `Anticipo generado por ${op}`,
          });
        }

        return { id: pago.id, codigo: op };
      });
      revalidar();
      return res;
    } catch (e) {
      if (e instanceof ErrorPago) return { error: e.message };
      const msg = `${e instanceof Error ? e.message : ''} ${
        (e as { cause?: { message?: string } } | null)?.cause?.message ?? ''
      }`;
      if (
        (msg.includes('cp_pagos_numero_unico') || msg.includes('cp_comprobantes_numero_unico')) &&
        intento < 4
      ) {
        continue;
      }
      console.error('[crearPagoAction]', e);
      return { error: 'No se pudo registrar el pago. Intentá de nuevo.' };
    }
  }
  return { error: 'Se registraron pagos al mismo tiempo. Intentá de nuevo.' };
}

// ─── Anulación de un pago ───────────────────────────────────────────────────

/**
 * Anula una orden de pago. Solo anula el pago: los comprobantes que cancelaba vuelven al
 * estado H, para empezar de nuevo el circuito (los anticipos que aplicaba recuperan su saldo y
 * vuelven a A). Si el pago era un anticipo, el anticipo generado se anula, salvo que ya se haya
 * aplicado a otro pago: en ese caso primero hay que anular ese pago.
 */
export async function anularPagoAction(id: string): Promise<ResultadoPago> {
  const c = await contextoAdmin();
  if (esError(c)) return { error: c.error };
  if (!uuid.safeParse(id).success) return { error: 'Pago inválido.' };

  try {
    await db.transaction(async (tx) => {
      const [pago] = await tx
        .select()
        .from(cpPagos)
        .where(and(eq(cpPagos.id, id), eq(cpPagos.guarderiaId, c.gId)))
        .for('update')
        .limit(1);
      if (!pago) throw new ErrorPago('No encontramos ese pago.');
      if (pago.estado === 'anulado') throw new ErrorPago('El pago ya está anulado.');
      const op = codigoOp(pago.numero);

      // El anticipo que generó este pago no puede estar ya usado en otro pago.
      const [anticipo] = await tx
        .select()
        .from(cpComprobantes)
        .where(and(eq(cpComprobantes.pagoOrigenId, pago.id), eq(cpComprobantes.guarderiaId, c.gId)))
        .for('update')
        .limit(1);
      if (anticipo) {
        const [uso] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(cpPagoAplicaciones)
          .innerJoin(cpPagos, eq(cpPagos.id, cpPagoAplicaciones.pagoId))
          .where(
            and(eq(cpPagoAplicaciones.comprobanteId, anticipo.id), eq(cpPagos.estado, 'pagado')),
          );
        if ((uso?.n ?? 0) > 0) {
          throw new ErrorPago(
            `El anticipo de ${op} ya se aplicó a otro pago. Anulá primero ese pago y después este.`,
          );
        }
      }

      const aplicaciones = await tx
        .select()
        .from(cpPagoAplicaciones)
        .where(
          and(eq(cpPagoAplicaciones.pagoId, pago.id), eq(cpPagoAplicaciones.guarderiaId, c.gId)),
        );

      await tx
        .update(cpPagos)
        .set({ estado: 'anulado', anuladoAt: new Date(), anuladoPor: c.userId })
        .where(and(eq(cpPagos.id, pago.id), eq(cpPagos.guarderiaId, c.gId)));

      // Los comprobantes que pagaba vuelven a H (los anticipos aplicados, a A).
      for (const a of aplicaciones) {
        const [cp] = await tx
          .select()
          .from(cpComprobantes)
          .where(and(eq(cpComprobantes.id, a.comprobanteId), eq(cpComprobantes.guarderiaId, c.gId)))
          .for('update')
          .limit(1);
        if (!cp || cp.estado === 'X') continue;
        const destino = cp.origen === 'anticipo' ? 'A' : 'H';
        await tx
          .update(cpComprobantes)
          .set({
            estado: destino,
            fechaPago: null,
            ...(destino === 'H' ? { autorizadoPor: null, autorizadoAt: null } : {}),
            updatedBy: c.userId,
            updatedAt: new Date(),
          })
          .where(and(eq(cpComprobantes.id, cp.id), eq(cpComprobantes.guarderiaId, c.gId)));
        await tx.insert(cpComprobantesHistorial).values({
          guarderiaId: c.gId,
          comprobanteId: cp.id,
          estadoDesde: cp.estado,
          estadoHasta: destino,
          usuarioId: c.userId,
          detalle: `Pago ${op} anulado${destino === 'H' ? ': vuelve a H para empezar de nuevo el circuito' : ''}`,
        });
      }

      if (anticipo) {
        await tx
          .update(cpComprobantes)
          .set({
            estado: 'X',
            anuladoAt: new Date(),
            anuladoPor: c.userId,
            updatedBy: c.userId,
            updatedAt: new Date(),
          })
          .where(and(eq(cpComprobantes.id, anticipo.id), eq(cpComprobantes.guarderiaId, c.gId)));
        await tx.insert(cpComprobantesHistorial).values({
          guarderiaId: c.gId,
          comprobanteId: anticipo.id,
          estadoDesde: anticipo.estado,
          estadoHasta: 'X',
          usuarioId: c.userId,
          detalle: `Anticipo anulado por la anulación de ${op}`,
        });
      }
    });
  } catch (e) {
    if (e instanceof ErrorPago) return { error: e.message };
    console.error('[anularPagoAction]', e);
    return { error: 'No se pudo anular el pago.' };
  }
  revalidar();
  revalidatePath(`/circuito-de-pagos/${id}`);
  return {};
}
