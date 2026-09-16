'use server';

import { z } from 'zod';

import { getActiveMarina } from '@/lib/auth/session';
import { ADMIN_ROLES } from '@/config/roles';
import { inicioMesVigenteArg, totalFacturadoEnPeriodo } from '@/lib/ventas-kpis';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

const schema = z
  .discriminatedUnion('periodo', [
    z.object({ periodo: z.literal('mes') }),
    z.object({ periodo: z.literal('historico') }),
    z.object({ periodo: z.literal('rango'), desde: ymd, hasta: ymd }),
  ])
  .refine((d) => d.periodo !== 'rango' || d.desde <= d.hasta, {
    message: 'La fecha "desde" no puede ser posterior a "hasta".',
  });

// No se exporta: un archivo 'use server' solo exporta async functions. El
// cliente arma el input con el mismo shape (ver TotalFacturadoCard).
type PeriodoTotalFacturado = z.infer<typeof schema>;

/**
 * Total facturado de la guardería activa para el período que elige el club en
 * la tarjeta de Ventas (mes vigente / histórico / rango). Misma cuenta que la
 * tarjeta trae al cargar la página, así el número no cambia según de dónde
 * salga.
 */
export async function totalFacturadoAction(
  input: PeriodoTotalFacturado,
): Promise<{ total: string } | { error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Período inválido.' };
  }

  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };
  if (
    !ctx.profile.isSuperAdmin &&
    !(ADMIN_ROLES as readonly string[]).includes(ctx.activeMembership.rol)
  ) {
    return { error: 'Solo administradores pueden ver la facturación.' };
  }

  const gId = ctx.activeMembership.guarderiaId;
  const p = parsed.data;
  const periodo =
    p.periodo === 'mes'
      ? { desde: inicioMesVigenteArg(), hasta: null }
      : p.periodo === 'historico'
        ? { desde: null, hasta: null }
        : { desde: p.desde, hasta: p.hasta };

  const total = await totalFacturadoEnPeriodo(gId, periodo);
  return { total };
}
