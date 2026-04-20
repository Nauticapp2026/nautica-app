'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { profiles, memberships, embarcaciones } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';

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

export async function createSocioAction(data: CreateSocioData): Promise<SocioResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;
  const profileId = randomUUID();

  try {
    await db.insert(profiles).values({
      id: profileId,
      email: data.email.toLowerCase().trim(),
      nombre: data.nombre.trim(),
      apellido: data.apellido.trim(),
      telefono: data.telefono.trim() || null,
      direccion: data.direccion.trim() || null,
      tipoDocumento: (data.tipoDocumento || null) as never,
      numeroDocumento: data.numeroDocumento.trim() || null,
      razonSocial: data.razonSocial.trim() || null,
      condicionIva: (data.condicionIva || null) as never,
      estadoSocio: 'activo',
    });

    await db.insert(memberships).values({
      userId: profileId,
      guarderiaId: gId,
      rol: 'socio',
      status: 'active',
    });

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

    revalidatePath('/dashboard/usuarios');
    return { socioId: profileId };
  } catch {
    return { error: 'Error al crear el socio. Verificá que el email no esté registrado.' };
  }
}
