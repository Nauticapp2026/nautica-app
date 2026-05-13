-- =============================================================================
-- Device tokens: registro de Expo Push Tokens de cada dispositivo mobile.
--
-- Cada vez que un usuario logueado en la app abre la app (o explícitamente al
-- loguearse), la mobile:
--   1. Pide permiso de notificaciones.
--   2. Obtiene su `ExponentPushToken[...]` vía expo-notifications.
--   3. POST /api/devices/register con { expoPushToken, platform }.
-- El backend hace UPSERT por `expo_push_token` (unique). Si el mismo token
-- aparece para otro user_id (caso raro: dispositivo compartido), se reasigna
-- al nuevo user — el último que loguea es el dueño.
--
-- Cuando se borra un token desde el worker porque Expo respondió
-- 'DeviceNotRegistered', la fila se elimina (la app la va a re-registrar la
-- próxima vez que el user abra).
--
-- RLS: solo el dueño puede leer/escribir su propio token. super_admin bypasa.
-- =============================================================================

create table if not exists public.device_tokens (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  expo_push_token   text not null unique,
  platform          text,
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

comment on table public.device_tokens is
  'Expo Push Tokens registrados por dispositivos mobile. Consumido por el worker en /api/cron/notificaciones-push para enviar pushes a través del Expo Push Service.';

create index if not exists device_tokens_user_idx on public.device_tokens(user_id);

-- RLS ------------------------------------------------------------------------

alter table public.device_tokens enable row level security;

drop policy if exists "device_tokens_owner_select" on public.device_tokens;
create policy "device_tokens_owner_select"
  on public.device_tokens
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_super_admin());

drop policy if exists "device_tokens_owner_modify" on public.device_tokens;
create policy "device_tokens_owner_modify"
  on public.device_tokens
  for all
  to authenticated
  using (auth.uid() = user_id or public.is_super_admin())
  with check (auth.uid() = user_id or public.is_super_admin());
