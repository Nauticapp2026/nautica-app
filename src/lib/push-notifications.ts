import { and, eq, inArray, notExists, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { deviceTokens, guarderias, memberships, platformNotificaciones } from '@/lib/db/schema';

type Audiencia = 'todos' | 'con_club' | 'sin_club' | 'plan_esencial' | 'plan_club' | 'plan_elite';

// =============================================================================
// Expo Push Service
//
// Doc: https://docs.expo.dev/push-notifications/sending-notifications/
//
// - Endpoint: POST https://exp.host/--/api/v2/push/send
// - Body: array de mensajes (máx 100 por request).
// - Auth opcional: Bearer EXPO_ACCESS_TOKEN (sin él, rate limits más bajos).
// - Respuesta: array de "tickets", uno por mensaje. Cada ticket tiene
//   `status: 'ok' | 'error'` y, si es error, `details.error`.
//
// Errores típicos:
//   - 'DeviceNotRegistered' → el token está muerto (user desinstaló o
//     desactivó notifs). Borramos el token de device_tokens.
//   - 'InvalidCredentials' → falta EXPO_ACCESS_TOKEN o está mal.
//   - 'MessageTooBig' / 'MessageRateExceeded' → temporal.
// =============================================================================

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_MESSAGES_PER_REQUEST = 100;
const MAX_NOTIFICACIONES_PER_RUN = 50;

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound?: 'default';
  data?: Record<string, unknown>;
};

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };

type ProcessResult = {
  procesadas: number;
  enviadas: number;
  fallidas: number;
  sinDestinatarios: number;
  tokensBorrados: number;
  detalle: Array<{
    id: string;
    estado: 'enviada' | 'fallida' | 'sin_destinatarios';
    tokens: number;
    error?: string;
  }>;
};

export async function processPendingNotifications(
  opts: { notifId?: string } = {},
): Promise<ProcessResult> {
  const whereClause = opts.notifId
    ? and(
        eq(platformNotificaciones.id, opts.notifId),
        eq(platformNotificaciones.estado, 'pendiente'),
      )
    : eq(platformNotificaciones.estado, 'pendiente');

  const pendientes = await db
    .select({
      id: platformNotificaciones.id,
      titulo: platformNotificaciones.titulo,
      cuerpo: platformNotificaciones.cuerpo,
      audiencia: platformNotificaciones.audiencia,
    })
    .from(platformNotificaciones)
    .where(whereClause)
    .limit(MAX_NOTIFICACIONES_PER_RUN);

  const result: ProcessResult = {
    procesadas: pendientes.length,
    enviadas: 0,
    fallidas: 0,
    sinDestinatarios: 0,
    tokensBorrados: 0,
    detalle: [],
  };

  for (const notif of pendientes) {
    const userIds = await resolveAudienceUserIds(notif.audiencia);

    if (userIds.length === 0) {
      // No hay miembros que cumplan la audiencia. Marcamos como 'enviada' con
      // 0 destinatarios — no es un error, simplemente no había a quién mandar.
      await markEnviada(notif.id);
      result.sinDestinatarios++;
      result.detalle.push({ id: notif.id, estado: 'sin_destinatarios', tokens: 0 });
      continue;
    }

    const tokens = await db
      .select({ expoPushToken: deviceTokens.expoPushToken })
      .from(deviceTokens)
      .where(inArray(deviceTokens.userId, userIds));

    if (tokens.length === 0) {
      // Hay miembros pero ninguno tiene la app instalada / registrada.
      await markEnviada(notif.id);
      result.sinDestinatarios++;
      result.detalle.push({ id: notif.id, estado: 'sin_destinatarios', tokens: 0 });
      continue;
    }

    const messages: ExpoMessage[] = tokens.map((t) => ({
      to: t.expoPushToken,
      title: notif.titulo,
      body: notif.cuerpo,
      sound: 'default',
      data: { notificacionId: notif.id },
    }));

    try {
      const tickets = await sendExpoPushes(messages);

      // Limpiar tokens que Expo reportó como muertos.
      const tokensToDelete: string[] = [];
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (
          ticket.status === 'error' &&
          ticket.details?.error === 'DeviceNotRegistered' &&
          messages[i]
        ) {
          tokensToDelete.push(messages[i].to);
        }
      }
      if (tokensToDelete.length > 0) {
        await db.delete(deviceTokens).where(inArray(deviceTokens.expoPushToken, tokensToDelete));
        result.tokensBorrados += tokensToDelete.length;
      }

      const okCount = tickets.filter((t) => t.status === 'ok').length;
      const errors = tickets
        .filter(
          (t): t is { status: 'error'; message: string; details?: { error?: string } } =>
            t.status === 'error',
        )
        .map((t) => t.details?.error ?? t.message)
        .slice(0, 3);

      if (okCount > 0) {
        // Al menos uno se entregó al relay de Expo: estado enviada.
        // (La entrega final FCM/APNS se confirma con receipts, no la chequeamos en v1.)
        await markEnviada(notif.id);
        result.enviadas++;
        result.detalle.push({ id: notif.id, estado: 'enviada', tokens: tokens.length });
      } else {
        const errMsg = errors.join('; ') || 'Todos los pushes fallaron en Expo.';
        await markFallida(notif.id, errMsg);
        result.fallidas++;
        result.detalle.push({
          id: notif.id,
          estado: 'fallida',
          tokens: tokens.length,
          error: errMsg,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markFallida(notif.id, msg);
      result.fallidas++;
      result.detalle.push({ id: notif.id, estado: 'fallida', tokens: tokens.length, error: msg });
    }
  }

  return result;
}

async function resolveAudienceUserIds(audiencia: Audiencia): Promise<string[]> {
  // 'todos': cualquier user con device token registrado. No filtramos por
  // membership porque sin_rol también está incluido.
  if (audiencia === 'todos') {
    const rows = await db.selectDistinct({ userId: deviceTokens.userId }).from(deviceTokens);
    return rows.map((r) => r.userId);
  }

  // 'sin_club': users con device token pero sin ninguna membership activa.
  if (audiencia === 'sin_club') {
    const rows = await db
      .selectDistinct({ userId: deviceTokens.userId })
      .from(deviceTokens)
      .where(
        notExists(
          db
            .select({ one: sql`1` })
            .from(memberships)
            .where(
              and(eq(memberships.userId, deviceTokens.userId), eq(memberships.status, 'active')),
            ),
        ),
      );
    return rows.map((r) => r.userId);
  }

  // 'con_club': cualquier user con al menos una membership activa.
  if (audiencia === 'con_club') {
    const rows = await db
      .selectDistinct({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.status, 'active'));
    return rows.map((r) => r.userId);
  }

  // 'plan_X': users con membership activa en guarderías de ese plan.
  const planMap: Record<
    'plan_esencial' | 'plan_club' | 'plan_elite',
    'esencial' | 'club' | 'elite'
  > = {
    plan_esencial: 'esencial',
    plan_club: 'club',
    plan_elite: 'elite',
  };
  const plan = planMap[audiencia];
  const rows = await db
    .selectDistinct({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(guarderias, eq(guarderias.id, memberships.guarderiaId))
    .where(and(eq(memberships.status, 'active'), eq(guarderias.plan, plan)));
  return rows.map((r) => r.userId);
}

async function sendExpoPushes(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  const chunks: ExpoMessage[][] = [];
  for (let i = 0; i < messages.length; i += MAX_MESSAGES_PER_REQUEST) {
    chunks.push(messages.slice(i, i + MAX_MESSAGES_PER_REQUEST));
  }

  const tickets: ExpoTicket[] = [];
  for (const chunk of chunks) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    };
    if (process.env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    }
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      throw new Error(`Expo Push API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as { data?: ExpoTicket[]; errors?: unknown };
    if (!json.data) {
      throw new Error(`Expo Push API respuesta inesperada: ${JSON.stringify(json).slice(0, 200)}`);
    }
    tickets.push(...json.data);
  }
  return tickets;
}

async function markEnviada(id: string): Promise<void> {
  await db
    .update(platformNotificaciones)
    .set({
      estado: 'enviada',
      enviadoEn: new Date(),
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(platformNotificaciones.id, id));
}

async function markFallida(id: string, errorMsg: string): Promise<void> {
  await db
    .update(platformNotificaciones)
    .set({
      estado: 'fallida',
      error: errorMsg.slice(0, 1000),
      updatedAt: new Date(),
    })
    .where(eq(platformNotificaciones.id, id));
}

// =============================================================================
// Push directo a un user (no broadcast)
//
// Para flujos transaccionales: el admin marca una solicitud de lavado como
// 'aceptada' y queremos avisarle al socio inmediatamente. No pasa por
// platform_notificaciones (eso es para campañas del super admin), va
// directo al device del user.
//
// Fire-and-forget: si Expo falla, logueamos pero no rompemos la acción
// que la disparó. El usuario igual ve el cambio cuando abre la app.
// =============================================================================

export async function sendPushToUser({
  userId,
  title,
  body,
  data,
}: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const tokens = await db
    .select({ expoPushToken: deviceTokens.expoPushToken })
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId));

  if (tokens.length === 0) return;

  const messages: ExpoMessage[] = tokens.map((t) => ({
    to: t.expoPushToken,
    title,
    body,
    sound: 'default',
    data,
  }));

  try {
    const tickets = await sendExpoPushes(messages);
    const tokensToDelete: string[] = [];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered' &&
        messages[i]
      ) {
        tokensToDelete.push(messages[i].to);
      }
    }
    if (tokensToDelete.length > 0) {
      await db.delete(deviceTokens).where(inArray(deviceTokens.expoPushToken, tokensToDelete));
    }
  } catch (err) {
    // No queremos que un fallo del push tire la server action que lo
    // disparó. Logueamos y seguimos.
    console.error('[sendPushToUser] error enviando push', { userId, err });
  }
}

export async function registerDeviceToken({
  userId,
  expoPushToken,
  platform,
}: {
  userId: string;
  expoPushToken: string;
  platform: string | null;
}): Promise<void> {
  await db
    .insert(deviceTokens)
    .values({
      userId,
      expoPushToken,
      platform,
    })
    .onConflictDoUpdate({
      target: deviceTokens.expoPushToken,
      set: {
        userId,
        platform,
        lastSeenAt: sql`now()`,
      },
    });
}

export async function unregisterDeviceToken(expoPushToken: string): Promise<void> {
  await db.delete(deviceTokens).where(eq(deviceTokens.expoPushToken, expoPushToken));
}
