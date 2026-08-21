-- Mails masivos del club a los socios de un área de espacios.
--
-- Pedido del cliente (2026-08-19). Comunicaciones ya existía pero es el tablón
-- de anuncios de la app (`comunicaciones`, tipo socios/pública): no manda mails
-- ni tiene destinatarios. Esto es un canal aparte.
--
-- La tabla guarda el registro de cada envío: qué se mandó, a qué áreas, a
-- cuántos y cuántos salieron bien. Sin esto el club no tiene forma de saber si
-- un mail se envió — y un envío masivo es justo lo que uno quiere poder auditar.
-- El cuerpo se guarda como texto plano tal como lo escribió el club; el HTML lo
-- arma el template al enviar.

create table if not exists public.comunicaciones_mails (
  id uuid primary key default gen_random_uuid(),
  guarderia_id uuid not null references public.guarderias (id) on delete cascade,
  autor_id uuid references public.profiles (id) on delete set null,
  -- Áreas elegidas. Se guardan los ids Y los nombres: si después se renombra o
  -- borra un área, el historial tiene que seguir diciendo a dónde se mandó.
  area_ids uuid[] not null default '{}',
  area_nombres text[] not null default '{}',
  asunto text not null,
  cuerpo text not null,
  -- Cuántos socios se resolvieron como destinatarios y cuántos mails salieron
  -- bien. Si difieren, algo falló (mail inválido, corte de Resend).
  destinatarios integer not null default 0,
  enviados integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists comunicaciones_mails_guarderia_idx
  on public.comunicaciones_mails (guarderia_id, created_at desc);

alter table public.comunicaciones_mails enable row level security;

-- Solo el staff del club ve y crea sus envíos. Las mutaciones reales van por
-- server action con Drizzle (que usa el pooler y no pasa por RLS), así que esta
-- policy es la red de seguridad para cualquier acceso vía PostgREST.
drop policy if exists "comunicaciones_mails_select_propio_club" on public.comunicaciones_mails;
create policy "comunicaciones_mails_select_propio_club"
  on public.comunicaciones_mails for select
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid()
        and m.guarderia_id = comunicaciones_mails.guarderia_id
        and m.status = 'active'
        and m.rol in ('administrador_general', 'administrativo', 'contable')
    )
  );
