-- =============================================================================
-- 0166 — Morosidad por club: plazo configurable y bloqueo de salidas.
--
-- Pedido del cliente (2026-10-19): "Poder setear desde el club a partir de qué
-- plazo un socio se considera en situación de morosidad. Si está moroso e
-- intenta hacer una salida, en vez de darle el QR debe aparecerle una leyenda
-- indicando que se acerque a administración."
--
-- 1) guarderias.dias_morosidad: cuántos días tiene que llevar vencida una factura
--    para que el socio se considere moroso. NULL = el club no usa el bloqueo
--    (default: ningún club cambia de conducta hasta que lo configure).
--    0 = moroso desde el día siguiente al vencimiento.
--
-- 2) socio_moroso_en_club(socio, club): mismo criterio de "factura vencida" que
--    el puntito rojo de Socios y la tarjeta del Dashboard
--    (src/lib/vencimientos-socio.ts): deuda cobrable (facturas, notas de débito
--    y comprobantes internos; sin anuladas, rechazadas ni recibos RC-/RI-) que
--    todavía no está 'pagada' y tiene vencimiento cargado. Los comprobantes
--    internos no guardan vencimiento, así que hoy no cuentan (igual que en el
--    puntito). Se compara por día calendario ARGENTINO. Filtra por
--    facturacion.guarderia_id: un socio puede estar en varios clubes y la deuda
--    de uno no bloquea en el otro.
--
-- 3) Trigger BEFORE INSERT en porteria: si el SOCIO crea su propia salida
--    (auth.uid() = socio_id) y está moroso, se corta con un mensaje en español
--    que la app mobile ya muestra tal cual. No se pisa cuando la fila la crea
--    otra persona (staff) ni el service role (auth.uid() es NULL).
--    FALLA ABIERTO: ante cualquier error inesperado al calcular la morosidad se
--    deja pasar la salida. Un trigger roto sobre porteria ya dejó a todos los
--    socios sin poder publicar salidas (incidente 2026-09-11, mobile 0034).
--
-- 4) estoy_moroso(club): para que la app mobile pueda avisar ANTES de que el
--    socio complete el formulario. Solo responde por quien llama (auth.uid()).
--
-- Idempotente.
-- =============================================================================

alter table public.guarderias
  add column if not exists dias_morosidad smallint;

alter table public.guarderias
  drop constraint if exists guarderias_dias_morosidad_check;

alter table public.guarderias
  add constraint guarderias_dias_morosidad_check
  check (dias_morosidad is null or (dias_morosidad >= 0 and dias_morosidad <= 365));

comment on column public.guarderias.dias_morosidad is
  'Días que tiene que llevar vencida una factura para considerar moroso al socio. NULL = no se usa el bloqueo de salidas. 0 = desde el día siguiente al vencimiento.';

-- -----------------------------------------------------------------------------
-- Función interna: NO se expone a anon ni a authenticated (devolvería la
-- situación de cualquier socio). La usan el trigger y estoy_moroso().
-- -----------------------------------------------------------------------------
create or replace function public.socio_moroso_en_club(p_socio uuid, p_guarderia uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guarderias g
    join public.facturacion f on f.guarderia_id = g.id
    where g.id = p_guarderia
      and g.dias_morosidad is not null
      and f.socio_id = p_socio
      and f.tipo_factura::text in (
        'factura_a', 'factura_b', 'factura_c',
        'nota_debito_a', 'nota_debito_b', 'nota_debito_c',
        'recibo'
      )
      and f.anulada = false
      and f.rechazada = false
      and (f.codigo is null or (f.codigo not like 'RC-%' and f.codigo not like 'RI-%'))
      and (f.estado is null or f.estado::text <> 'pagada')
      and f.vencimiento is not null
      and (f.vencimiento at time zone 'America/Argentina/Buenos_Aires')::date
          < (now() at time zone 'America/Argentina/Buenos_Aires')::date - g.dias_morosidad
  );
$$;

revoke all on function public.socio_moroso_en_club(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Para la app: ¿yo estoy moroso en este club?
-- -----------------------------------------------------------------------------
create or replace function public.estoy_moroso(p_guarderia uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    else public.socio_moroso_en_club(auth.uid(), p_guarderia)
  end;
$$;

revoke all on function public.estoy_moroso(uuid) from public, anon;
grant execute on function public.estoy_moroso(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Corte al crear la salida.
-- -----------------------------------------------------------------------------
create or replace function public.porteria_bloquear_moroso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moroso boolean := false;
begin
  if new.tipo = 'salida'
     and new.socio_id is not null
     and auth.uid() is not null
     and auth.uid() = new.socio_id then
    begin
      v_moroso := public.socio_moroso_en_club(new.socio_id, new.guarderia_id);
    exception when others then
      -- Falla abierto: ante un error inesperado no se le niega la salida.
      v_moroso := false;
    end;

    if v_moroso then
      raise exception 'Tenés deuda vencida con el club. Acercate a administración para regularizar tu situación.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists porteria_bloquear_moroso_trg on public.porteria;

create trigger porteria_bloquear_moroso_trg
  before insert on public.porteria
  for each row
  execute function public.porteria_bloquear_moroso();
