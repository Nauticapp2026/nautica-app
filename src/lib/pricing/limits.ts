import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { guarderias, pricingPlanFeatures } from '@/lib/db/schema';

// Fallback hardcodeado para cuando la fila no existe en pricing_plan_features.
// Solo aplica si el DB no tiene el registro; si existe, el valor del DB tiene
// prioridad (incluso si es 0).
// Version simplificada para lanzamiento (2026-08-12): mismo cupo mensual en
// los 3 planes. Ver mig. 0141_publicaciones_comunicaciones_cupo_lanzamiento.
const FEATURE_DEFAULTS: Record<string, Record<string, number>> = {
  com_cerrada: { esencial: 6, premium: 6, elite: 6 },
  com_abierta: { esencial: 3, premium: 3, elite: 3 },
  nautishop_publicaciones: { esencial: 6, premium: 6, elite: 6 },
};

// Orden fijo de tiers (coincide con planEnum en schema.ts). Se usa para
// calcular el mensaje de upsell dinamico al llegar al limite de una feature.
const PLAN_ORDER = ['esencial', 'premium', 'elite'] as const;
const PLAN_LABELS: Record<string, string> = {
  esencial: 'Esencial',
  premium: 'Premium',
  elite: 'Elite',
};

// Mensaje de upsell al bloquear una accion por limite de plan alcanzado.
// Si hay un plan superior, invita a upgradear a ese (no siempre "el mas alto"
// — un club en Esencial ve "Premium", uno en Premium ve "Elite"). Si ya esta
// en el plan mas alto, no hay a donde subir: invita a contactar a NauticApp.
export function mensajeUpsellPlan(planSlugActual: string): string {
  const idx = PLAN_ORDER.indexOf(planSlugActual as (typeof PLAN_ORDER)[number]);
  const siguiente = idx >= 0 && idx < PLAN_ORDER.length - 1 ? PLAN_ORDER[idx + 1] : null;
  if (siguiente) {
    return `Cambiando a plan ${PLAN_LABELS[siguiente]} podés tener más publicaciones y beneficios.`;
  }
  return 'Comunicate con NauticApp para un plan ajustado a tu medida.';
}

// Parsea el primer entero del valor textual almacenado en pricing_plan_features.
// '2 / mes' → 2, '2 publ.' → 2, '5 / mes' → 5.
// '✓' / '' / null → undefined (no hay número explícito; el llamador usa el fallback).
function parseLimit(value: string | null | undefined): number | undefined {
  if (!value || !value.trim()) return undefined;
  const n = parseInt(value, 10);
  return isNaN(n) || n < 0 ? undefined : n;
}

// Devuelve el plan vigente de la guardería (para armar el mensaje de upsell
// sin depender de que el llamador ya lo tenga a mano).
export async function getGuarderiaPlanSlug(guarderiaId: string): Promise<string> {
  const [guarderia] = await db
    .select({ plan: guarderias.plan })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);
  return guarderia?.plan ?? 'esencial';
}

// Devuelve los límites numéricos de las features pedidas para la guardería.
// Hace 2 queries: plan de la guardería + valores en pricing_plan_features.
export async function getPlanFeatureLimits(
  guarderiaId: string,
  featureIds: string[],
): Promise<Record<string, number>> {
  const planSlug = await getGuarderiaPlanSlug(guarderiaId);
  return getPlanLimitsForSlug(planSlug, featureIds);
}

// Igual que getPlanFeatureLimits pero cuando el planSlug ya es conocido
// (evita la query extra a guarderias).
export async function getPlanLimitsForSlug(
  planSlug: string,
  featureIds: string[],
): Promise<Record<string, number>> {
  const rows = await db
    .select({ featureId: pricingPlanFeatures.featureId, value: pricingPlanFeatures.value })
    .from(pricingPlanFeatures)
    .where(
      and(
        eq(pricingPlanFeatures.planSlug, planSlug as 'esencial' | 'premium' | 'elite'),
        inArray(pricingPlanFeatures.featureId, featureIds),
      ),
    );

  // Arranca con los defaults hardcodeados para cubrir filas ausentes en el DB.
  const result: Record<string, number> = Object.fromEntries(
    featureIds.map((id) => [id, FEATURE_DEFAULTS[id]?.[planSlug] ?? 0]),
  );

  // El valor del DB sobreescribe el default solo si es un número explícito.
  // '✓' o vacío conserva el fallback para que el admin pueda setear el label
  // sin perder el límite numérico.
  for (const row of rows) {
    const parsed = parseLimit(row.value);
    if (parsed !== undefined) {
      result[row.featureId] = parsed;
    }
  }

  return result;
}
