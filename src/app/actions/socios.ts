'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { profiles, memberships, embarcaciones, movimientosCuentaCorriente } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

export type CreateSocioData = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion: string;
  tipoDocumento: string;
  numeroDocumento: string;
  razonSocial: string;
  condicionIva: string;
  embarcacionNombre: string;
  matricula: string;
  modelo: string;
  seguro: string;
};

export type SocioResult = { error?: string; socioId?: string };

function nextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function createSocioAction(data: CreateSocioData): Promise<SocioResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;
  const admin = createAdminClient();
  const emailLower = data.email.toLowerCase().trim();

  // 1. Create auth user and send invite email for password setup
  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(emailLower);

  if (inviteError) {
    if (
      inviteError.message.toLowerCase().includes('already been registered') ||
      inviteError.message.toLowerCase().includes('already exists')
    ) {
      return { error: 'Ya existe una cuenta con ese email.' };
    }
    return { error: 'Error al crear la cuenta del socio. Verificá el email e intentá de nuevo.' };
  }

  const profileId = inviteData.user.id;

  try {
    // 2. Upsert profile (in case Supabase trigger already created a minimal row)
    await db
      .insert(profiles)
      .values({
        id: profileId,
        email: emailLower,
        nombre: data.nombre.trim() || null,
        apellido: data.apellido.trim() || null,
        telefono: data.telefono.trim() || null,
        direccion: data.direccion.trim() || null,
        tipoDocumento: (data.tipoDocumento || null) as never,
        numeroDocumento: data.numeroDocumento.trim() || null,
        razonSocial: data.razonSocial.trim() || null,
        condicionIva: (data.condicionIva || null) as never,
        estadoSocio: 'activo',
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: {
          email: emailLower,
          nombre: data.nombre.trim() || null,
          apellido: data.apellido.trim() || null,
          telefono: data.telefono.trim() || null,
          direccion: data.direccion.trim() || null,
          tipoDocumento: (data.tipoDocumento || null) as never,
          numeroDocumento: data.numeroDocumento.trim() || null,
          razonSocial: data.razonSocial.trim() || null,
          condicionIva: (data.condicionIva || null) as never,
          estadoSocio: 'activo',
        },
      });

    // 3. Create membership linking socio to this guardería
    await db
      .insert(memberships)
      .values({
        userId: profileId,
        guarderiaId: gId,
        rol: 'socio',
        status: 'active',
      })
      .onConflictDoNothing();

    // 4. Create embarcación if provided
    if (data.embarcacionNombre.trim()) {
      await db.insert(embarcaciones).values({
        guarderiaId: gId,
        profileId,
        nombre: data.embarcacionNombre.trim(),
        matricula: data.matricula.trim() || null,
        modelo: data.modelo.trim() || null,
        seguro: data.seguro.trim() || null,
      });
    }

    // 5. Create first monthly billing movement
    await db.insert(movimientosCuentaCorriente).values({
      socioId: profileId,
      concepto: 'Cuota mensual',
      tipo: 'mensual',
      estado: 'no_pagado',
      fecha: new Date(),
      proximoPago: nextMonthStart(),
    });

    revalidatePath('/usuarios');
    return { socioId: profileId };
  } catch {
    // Clean up orphaned auth user if DB writes fail
    await admin.auth.admin.deleteUser(profileId).catch(() => null);
    return { error: 'Error al registrar el socio. Intentá de nuevo.' };
  }
}
