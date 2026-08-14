-- Separar calle / número / ciudad / provincia en las direcciones del socio
-- (pedido cliente 2026-08-14). Antes:
--   · Datos personales: `direccion` = calle + número junto ("Av. Libertador 1234").
--     ciudad/provincia/codigo_postal ya estaban separados.
--   · Datos impositivos: `direccion_fiscal` = todo junto ("Av. Corrientes 1234, CABA").
--
-- Criterio: `direccion` y `direccion_fiscal` pasan a significar SOLO la calle, y
-- se agregan las partes que faltaban. Así no hay que renombrar columnas ni tocar
-- los ~20 lugares que ya las leen.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS direccion_numero        text,
  ADD COLUMN IF NOT EXISTS direccion_fiscal_numero text,
  ADD COLUMN IF NOT EXISTS ciudad_fiscal           text,
  ADD COLUMN IF NOT EXISTS provincia_fiscal        text;

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Best-effort sobre datos escritos a mano en un solo campo. Lo que no matchea
-- queda entero en la calle (no se pierde nada); el club lo corrige a mano.

-- 1) Dirección personal: número = lo que quede al final ("Av. Libertador 1234"
--    → calle "Av. Libertador", número "1234"). Direcciones sin número
--    (ej. "tandil") quedan intactas.
UPDATE profiles
   SET direccion_numero = btrim(substring(direccion from '(\d+\s*[A-Za-z]?)\s*$')),
       direccion        = btrim(regexp_replace(direccion, '\s*\d+\s*[A-Za-z]?\s*$', ''))
 WHERE direccion IS NOT NULL
   AND direccion ~ '\d+\s*[A-Za-z]?\s*$'
   AND direccion_numero IS NULL;

-- 2) Dirección fiscal, parte 1: separar por comas. "Av. Corrientes 1234, CABA,
--    Buenos Aires" → calle+nro / ciudad / provincia.
UPDATE profiles
   SET ciudad_fiscal    = NULLIF(btrim(split_part(direccion_fiscal, ',', 2)), ''),
       provincia_fiscal = NULLIF(btrim(split_part(direccion_fiscal, ',', 3)), ''),
       direccion_fiscal = btrim(split_part(direccion_fiscal, ',', 1))
 WHERE direccion_fiscal IS NOT NULL
   AND direccion_fiscal LIKE '%,%'
   AND ciudad_fiscal IS NULL;

-- 3) Dirección fiscal, parte 2: extraer el número de la calle que quedó.
UPDATE profiles
   SET direccion_fiscal_numero = btrim(substring(direccion_fiscal from '(\d+\s*[A-Za-z]?)\s*$')),
       direccion_fiscal        = btrim(regexp_replace(direccion_fiscal, '\s*\d+\s*[A-Za-z]?\s*$', ''))
 WHERE direccion_fiscal IS NOT NULL
   AND direccion_fiscal ~ '\d+\s*[A-Za-z]?\s*$'
   AND direccion_fiscal_numero IS NULL;

-- Limpiar cadenas que quedaron vacías tras los recortes.
UPDATE profiles SET direccion = NULL WHERE btrim(coalesce(direccion, '')) = '';
UPDATE profiles SET direccion_fiscal = NULL WHERE btrim(coalesce(direccion_fiscal, '')) = '';
