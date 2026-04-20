'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { movimientosCuentaCorriente } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';

export type AddMovimientoData = {
  socioId: string;
  servicioId: string;
  concepto: string;
  monto: string;
  fecha: string;
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
