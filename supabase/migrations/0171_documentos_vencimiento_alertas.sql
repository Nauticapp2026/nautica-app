-- =============================================================================
-- 0171 — Documentos: vencimiento del seguro (lo carga el club) y del certificado
--        náutico (lo carga el socio), con aviso al socio 7 días antes.
--
-- Pedido del cliente (2026-10-19):
--   (11) Seguro: la fecha de vencimiento la carga SOLAMENTE la guardería, a mano.
--        Alerta 7 días antes: al club en el Dashboard ("Documentación con vencimiento
--        próximo") y notificación al socio en la app.
--   (12) Certificado náutico: la fecha la carga y la ve SOLO el socio, no el club.
--
-- `documentos.vencimiento` (timestamptz) ya existía desde el esquema inicial pero
-- nadie lo escribía ni lo leía. Se guarda el día calendario argentino anclado a las
-- 12:00 UTC (mismo criterio que facturacion.vencimiento).
--
-- 1) Trigger: el socio, desde la app, NO puede cargar ni cambiar el vencimiento de
--    un SEGURO. La RLS de `documentos` es por fila (el dueño puede escribir toda su
--    fila), así que sin esto la regla "solo el club" dependería de que el cliente
--    mobile se porte bien. Aplica únicamente cuando quien escribe es el propio socio
--    (auth.uid() = profile_id). El web del club escribe por Drizzle / service role
--    (auth.uid() es NULL) y por eso sí puede cargar la fecha.
--    Cubre también el cambio de `tipo` (convertir un documento en seguro, o sacarlo
--    de seguro, para colar una fecha).
--
-- 2) Índice único parcial en `notificaciones`: una sola notificación por socio,
--    documento y fecha de vencimiento. Es lo que hace idempotente al cron (doble
--    corrida, reintento o varios deploys no repiten el aviso). Si el club o el socio
--    cambian la fecha, es otra clave y se vuelve a avisar.
--    `notificaciones` es de la app mobile; el índice es parcial (solo estos dos tipos)
--    y no afecta a los demás.
--
-- 3) Índice parcial para que la búsqueda de vencimientos próximos no recorra todo.
--
-- Idempotente.
-- =============================================================================

create or replace function public.documentos_proteger_vencimiento_seguro()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and auth.uid() = new.profile_id then
    if tg_op = 'INSERT' then
      if new.tipo = 'seguro' then
        new.vencimiento := null;
      end if;
    elsif tg_op = 'UPDATE' then
      if old.tipo = 'seguro' and new.tipo = 'seguro' then
        -- Sigue siendo seguro: la fecha que cargó el club no se toca.
        new.vencimiento := old.vencimiento;
      elsif old.tipo = 'seguro' or new.tipo = 'seguro' then
        -- Entra o sale de la categoría seguro: no se arrastra ninguna fecha.
        new.vencimiento := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists documentos_proteger_vencimiento_seguro_trg on public.documentos;

create trigger documentos_proteger_vencimiento_seguro_trg
  before insert or update on public.documentos
  for each row
  execute function public.documentos_proteger_vencimiento_seguro();

create unique index if not exists notificaciones_aviso_documento_unico
  on public.notificaciones (user_id, tipo, (payload ->> 'documento_id'), (payload ->> 'vencimiento'))
  where tipo in ('documento_seguro_vence', 'documento_carnet_vence');

create index if not exists documentos_vencimiento_idx
  on public.documentos (tipo, vencimiento)
  where vencimiento is not null;
