-- =============================================================================
-- Publicidades: agregar segmentación por sección de la app mobile + rango de
-- fechas (calendario) en el que la publicidad debe mostrarse.
--   - seccion: nullable. Si está seteado, la mobile solo la muestra en esa
--              sección; si es null, en todas las secciones de su tamaño.
--   - fecha_inicio / fecha_fin: nullables. Si están seteadas, la mobile solo
--                               la muestra dentro de ese rango (inclusive).
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'publicidad_seccion') then
    create type public.publicidad_seccion as enum (
      'home',
      'nautishop',
      'mi_club',
      'contactos',
      'solicitud_lavado',
      'acceso_externo',
      'qr',
      'marketplace_embarcacion',
      'marketplace_propiedad'
    );
  end if;
end$$;

alter table public.platform_publicidades
  add column if not exists seccion public.publicidad_seccion,
  add column if not exists fecha_inicio date,
  add column if not exists fecha_fin date;
