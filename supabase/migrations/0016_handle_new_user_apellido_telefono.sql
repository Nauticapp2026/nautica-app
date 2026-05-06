-- =============================================================================
-- 0016 — handle_new_user lee también apellido y telefono de raw_user_meta_data
-- =============================================================================
-- Por qué: el flow de signup desde la mobile manda
--   options.data = { nombre, apellido, telefono }
-- en supabase.auth.signUp. El trigger original (mig 0001) solo extraía 'nombre'.
-- El cliente mobile compensaba haciendo un UPDATE explícito a profiles después
-- del signUp. Pero cuando "Confirm email" está prendido en Supabase, data.session
-- es null tras el signUp y el UPDATE sale sin JWT activo. La policy RLS
-- "update_own" (auth.uid() = profiles.id) filtra todo silenciosamente, no
-- devuelve error y apellido + telefono quedan vacíos para siempre.
--
-- Fix: que el trigger inserte los tres campos directamente al crear el profile,
-- antes de que importen las RLS. Como corre con `security definer`, ya tiene
-- permiso para escribir.
--
-- Idempotente: `create or replace function` reemplaza la versión anterior sin
-- recrear el trigger (sigue apuntando a la misma función).
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre, apellido, telefono)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'apellido', ''),
    nullif(new.raw_user_meta_data ->> 'telefono', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Backfill one-shot: completar apellido y telefono en profiles ya existentes
-- usando raw_user_meta_data de auth.users (que sí los tiene desde el signUp).
-- Solo afecta filas que tienen el dato en auth.users pero null en profiles.
-- coalesce respeta valores ya cargados (no pisa nada).
-- -----------------------------------------------------------------------------
update public.profiles p
set
  apellido = coalesce(p.apellido, nullif(u.raw_user_meta_data ->> 'apellido', '')),
  telefono = coalesce(p.telefono, nullif(u.raw_user_meta_data ->> 'telefono', '')),
  updated_at = now()
from auth.users u
where p.id = u.id
  and (p.apellido is null or p.telefono is null)
  and (
    nullif(u.raw_user_meta_data ->> 'apellido', '') is not null
    or nullif(u.raw_user_meta_data ->> 'telefono', '') is not null
  );
