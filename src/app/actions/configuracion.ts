'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { guarderias, horariosDia } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;
type Dia = (typeof DIAS)[number];

const TIPOS = [
  'club_nautico',
  'marina_privada',
  'guarderia_nautica',
  'puerto_deportivo',
  'otro',
] as const;
type Tipo = (typeof TIPOS)[number];

export type HorarioInput = {
  dia: Dia;
  horarios: string | null;
  cerrado: boolean;
};

export type UpdateGuarderiaGeneralData = {
  nombre: string;
  cuit: string;
  tipo: Tipo;
  direccion: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
  telefono: string;
  email: string;
  horarios: HorarioInput[];
};

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
}

export async function updateGuarderiaGeneralAction(
  data: UpdateGuarderiaGeneralData,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const nombre = data.nombre.trim();
  if (!nombre) return { error: 'El nombre es obligatorio.' };
  if (!data.cuit.trim()) return { error: 'El CUIT es obligatorio.' };
  if (!TIPOS.includes(data.tipo)) return { error: 'Tipo de establecimiento inválido.' };

  await db
    .update(guarderias)
    .set({
      nombre,
      cuit: data.cuit.trim(),
      tipo: data.tipo,
      direccion: data.direccion.trim(),
      ciudad: data.ciudad.trim(),
      provincia: data.provincia.trim(),
      codigoPostal: data.codigoPostal.trim(),
      telefono: data.telefono.trim(),
      email: data.email.trim(),
      updatedAt: new Date(),
    })
    .where(eq(guarderias.id, guarderiaId));

  for (let i = 0; i < data.horarios.length; i++) {
    const h = data.horarios[i];
    if (!DIAS.includes(h.dia)) continue;

    const existing = await db
      .select({ id: horariosDia.id })
      .from(horariosDia)
      .where(and(eq(horariosDia.guarderiaId, guarderiaId), eq(horariosDia.dia, h.dia)))
      .limit(1);

    const payload = {
      guarderiaId,
      dia: h.dia,
      horarios: h.cerrado ? null : (h.horarios ?? null),
      cerrado: h.cerrado,
      orden: i,
    };

    if (existing.length === 0) {
      await db.insert(horariosDia).values(payload);
    } else {
      await db
        .update(horariosDia)
        .set({ horarios: payload.horarios, cerrado: payload.cerrado, orden: payload.orden })
        .where(eq(horariosDia.id, existing[0].id));
    }
  }

  revalidatePath('/configuracion');
  return {};
}
