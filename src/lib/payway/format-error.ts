/**
 * Extrae un mensaje legible del response de Payway cuando un pago no fue aprobado.
 *
 * Estructura típica de error:
 *   {
 *     status: "rejected",
 *     status_details: {
 *       error: {
 *         type: "invalid_card",
 *         reason: { id: "5", description: "TARJETA RECHAZADA, LLAME" }
 *       }
 *     }
 *   }
 *
 * Algunas variantes vienen como string directo en `error`, o el `reason` puede ser
 * string en lugar de objeto. Esta función prioriza descripción humana → tipo → status.
 */
export function formatPaywayError(result: Record<string, unknown>): string {
  const details = result.status_details as Record<string, unknown> | null | undefined;
  const err = details?.error as Record<string, unknown> | string | null | undefined;

  if (typeof err === 'string' && err.trim()) return err;

  if (err && typeof err === 'object') {
    const reason = (err as Record<string, unknown>).reason as
      | Record<string, unknown>
      | string
      | null
      | undefined;

    if (typeof reason === 'string' && reason.trim()) return reason;

    if (reason && typeof reason === 'object') {
      const description = (reason as Record<string, unknown>).description;
      if (typeof description === 'string' && description.trim()) return description;
      const id = (reason as Record<string, unknown>).id;
      if (typeof id === 'string' && id.trim()) return id;
    }

    const type = (err as Record<string, unknown>).type;
    if (typeof type === 'string' && type.trim()) return type;
  }

  const status = result.status;
  if (typeof status === 'string' && status.trim()) return status;

  return 'rechazado';
}
