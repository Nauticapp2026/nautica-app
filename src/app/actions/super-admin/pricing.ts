'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { platformSettings, pricingPlanFeatures, pricingPlans } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';

const planSlugSchema = z.enum(['esencial', 'club', 'elite']);

const updatePlanSchema = z.object({
  slug: planSlugSchema,
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(40),
  rate: z.number().int().positive('El rate debe ser un entero positivo.'),
});

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export async function updatePricingPlanAction(input: UpdatePlanInput): Promise<{ error?: string }> {
  const { profile } = await requireSuperAdmin();

  const parsed = updatePlanSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }

  const { slug, name, rate } = parsed.data;

  await db
    .update(pricingPlans)
    .set({ name, rate, updatedAt: new Date(), updatedBy: profile.id })
    .where(eq(pricingPlans.slug, slug));

  revalidatePath('/');
  revalidatePath('/super-admin/pricing');

  return {};
}

const updatePlanFeatureSchema = z.object({
  planSlug: planSlugSchema,
  featureId: z.string().trim().min(1),
  value: z.string().max(200),
});

export type UpdatePlanFeatureInput = z.infer<typeof updatePlanFeatureSchema>;

export async function updatePlanFeatureAction(
  input: UpdatePlanFeatureInput,
): Promise<{ error?: string }> {
  const { profile } = await requireSuperAdmin();

  const parsed = updatePlanFeatureSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }

  const { planSlug, featureId, value } = parsed.data;
  const trimmed = value.trim();
  // Vacío = no incluido. Lo guardamos como NULL para que sea visible en SQL.
  const stored = trimmed === '' ? null : trimmed;

  await db
    .insert(pricingPlanFeatures)
    .values({
      planSlug,
      featureId,
      value: stored,
      updatedBy: profile.id,
    })
    .onConflictDoUpdate({
      target: [pricingPlanFeatures.planSlug, pricingPlanFeatures.featureId],
      set: {
        value: stored,
        updatedAt: new Date(),
        updatedBy: profile.id,
      },
    });

  revalidatePath('/');
  revalidatePath('/onboarding');
  revalidatePath('/super-admin/pricing');
  revalidatePath('/configuracion');

  return {};
}

const capacitiesSchema = z
  .array(z.number().int().positive())
  .min(2, 'Tiene que haber al menos dos capacidades para que el slider funcione.')
  .max(20);

export async function updatePricingCapacitiesAction(input: number[]): Promise<{ error?: string }> {
  const { profile } = await requireSuperAdmin();

  const parsed = capacitiesSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Capacidades inválidas.' };
  }

  // Ordenar ascendente para que el slider quede consistente.
  const ordered = [...parsed.data].sort((a, b) => a - b);

  await db
    .insert(platformSettings)
    .values({
      key: 'pricing_capacities',
      value: ordered,
      updatedBy: profile.id,
    })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: {
        value: ordered,
        updatedAt: new Date(),
        updatedBy: profile.id,
      },
    });

  revalidatePath('/');
  revalidatePath('/super-admin/pricing');

  return {};
}
