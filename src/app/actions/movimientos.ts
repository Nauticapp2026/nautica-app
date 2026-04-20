'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { movimientosCuentaCorriente } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { inArray } from 'drizzle-orm';

export type AddMovimientoData = {
  socioId: string;
  servicioId: string;
  concepto: string;
  monto: string;
  fecha: string;
};

export type MarcarPagadasData = {
  ids: string[];
  socioId: string;
  formaDePago: string;
  // Transferencia
  bancoTransferencia?: string;
  clienteTransferencia?: string;
  cbuAliasTransferencia?: string;
  montoTransferencia?: string;
  fechaTransferencia?: string;
  numeroOperacionTransferencia?: string;
  observacionesTransferencia?: string;
  // Cheque
  numeroCheque?: string;
  bancoEmisorCheque?: string;
  sucursalCheque?: string;
  cuitCuilCheque?: string;
  titularCheque?: string;
  importeCheque?: string;
  tipoCheque?: string;
  monedaCheque?: string;
  cuentaCheque?: string;
  observacionesCheque?: string;
};

export async function addMovimientoAction(data: AddMovimientoData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  try {
    await db.insert(movimientosCuentaCorriente).values({
      socioId: data.socioId,
      servicioId: data.servicioId || null,
      concepto: data.concepto.trim() || null,
      tipo: 'otro',
      estado: 'no_pagado',
      debe: data.monto || '0',
      fecha: data.fecha ? new Date(data.fecha) : new Date(),
    });
    revalidatePath(`/usuarios/${data.socioId}`);
    return {};
  } catch {
    return { error: 'Error al agregar el movimiento.' };
  }
}

export async function marcarPagadasAction(data: MarcarPagadasData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!data.ids.length) return { error: 'No hay movimientos seleccionados.' };

  const setData: Record<string, unknown> = {
    estado: 'pagado',
    formaDePago: data.formaDePago,
  };

  if (data.formaDePago === 'transferencia') {
    Object.assign(setData, {
      bancoTransferencia: data.bancoTransferencia || null,
      clienteTransferencia: data.clienteTransferencia || null,
      cbuAliasTransferencia: data.cbuAliasTransferencia || null,
      montoTransferencia: data.montoTransferencia || null,
      fechaTransferencia: data.fechaTransferencia ? new Date(data.fechaTransferencia) : null,
      numeroOperacionTransferencia: data.numeroOperacionTransferencia || null,
      observacionesTransferencia: data.observacionesTransferencia || null,
    });
  } else if (data.formaDePago === 'cheque') {
    Object.assign(setData, {
      numeroCheque: data.numeroCheque || null,
      bancoEmisorCheque: data.bancoEmisorCheque || null,
      sucursalCheque: data.sucursalCheque || null,
      cuitCuilCheque: data.cuitCuilCheque || null,
      titularCheque: data.titularCheque || null,
      importeCheque: data.importeCheque || null,
      tipoCheque: data.tipoCheque || null,
      monedaCheque: data.monedaCheque || null,
      cuentaCheque: data.cuentaCheque || null,
      observacionesCheque: data.observacionesCheque || null,
    });
  }

  try {
    await db
      .update(movimientosCuentaCorriente)
      .set(setData as never)
      .where(inArray(movimientosCuentaCorriente.id, data.ids));
    revalidatePath(`/usuarios/${data.socioId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar los movimientos.' };
  }
}
