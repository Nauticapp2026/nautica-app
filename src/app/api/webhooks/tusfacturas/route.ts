import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { facturacion } from '@/lib/db/schema';

// Webhook receptor de eventos de tusfacturas.app.
//
// Eventos posibles (según docs):
//   - test          → ping al setear webhook (validación inicial)
//   - encolado      → comprobante en cola (no aplica al endpoint sincrónico)
//   - emitido       → factura emitida con CAE
//   - error         → AFIP rechazó el comprobante
//   - eliminado     → comprobante anulado en TF
//   - cambio_fecha  → fecha del comprobante modificada
//
// Auth: secret en query param (?secret=XXX) contra TUSFACTURAS_WEBHOOK_SECRET.
// La URL completa se setea como `webhook` en cada POS al darlo de alta.
// TF reintenta hasta 5 veces con backoff (5min, 30min, 3h, 6h, 12h) si no
// devolvemos HTTP 200, así que devolvemos 200 ante eventos esperados aún si
// no hacen nada accionable (solo log).

type WebhookEvent = 'test' | 'encolado' | 'emitido' | 'error' | 'eliminado' | 'cambio_fecha';

type WebhookPayload = {
  creado?: string;
  evento?: WebhookEvent;
  recurso?: string;
  external_reference?: string;
  intento?: number;
  msg?: unknown;
  hook_id?: string;
};

export async function POST(request: NextRequest): Promise<Response> {
  const expected = process.env.TUSFACTURAS_WEBHOOK_SECRET;
  if (!expected) {
    console.error('[tusfacturas-webhook] TUSFACTURAS_WEBHOOK_SECRET no configurado');
    return NextResponse.json({ error: 'webhook no configurado' }, { status: 503 });
  }

  const provided = request.nextUrl.searchParams.get('secret');
  if (provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = (await request.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: 'json invalido' }, { status: 400 });
  }

  const { evento, external_reference: externalRef, intento, hook_id: hookId } = payload;

  if (evento === 'test') {
    console.log('[tusfacturas-webhook] test recibido', { hookId });
    return NextResponse.json({ ok: true });
  }

  if (!externalRef) {
    console.warn('[tusfacturas-webhook] evento sin external_reference', payload);
    return NextResponse.json({ ok: true });
  }

  const [factura] = await db
    .select({
      id: facturacion.id,
      guarderiaId: facturacion.guarderiaId,
      codigo: facturacion.codigo,
      estado: facturacion.estado,
    })
    .from(facturacion)
    .where(eq(facturacion.externalReference, externalRef))
    .limit(1);

  switch (evento) {
    case 'emitido':
      if (!factura) {
        // Caso del agujero: TF emitió pero no tenemos la factura local
        // (probablemente cayó la persistencia local después del CAE).
        // El payload del webhook NO trae los datos del comprobante para
        // reconstruirla, así que loggeamos para investigación manual.
        console.error('[tusfacturas-webhook] factura emitida en TF pero NO existe en DB local', {
          externalRef,
          intento,
          hookId,
        });
      } else {
        console.log('[tusfacturas-webhook] factura confirmada por TF', {
          externalRef,
          codigo: factura.codigo,
          guarderiaId: factura.guarderiaId,
        });
      }
      break;

    case 'error':
      console.error('[tusfacturas-webhook] error reportado por TF/AFIP', {
        externalRef,
        msg: payload.msg,
        intento,
        existeLocal: !!factura,
      });
      break;

    case 'eliminado':
      // No actualizamos estado: el enum estado_factura no tiene 'anulada'.
      // Cuando se implemente anulación (NC/ND) propagar acá.
      console.warn('[tusfacturas-webhook] comprobante eliminado en TF', {
        externalRef,
        guarderiaId: factura?.guarderiaId,
        codigo: factura?.codigo,
      });
      break;

    case 'cambio_fecha':
    case 'encolado':
      console.log('[tusfacturas-webhook] evento informativo', { evento, externalRef });
      break;

    default:
      console.warn('[tusfacturas-webhook] evento desconocido', payload);
  }

  return NextResponse.json({ ok: true });
}
