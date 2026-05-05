-- Agrega imagen_urls (text[]) a comunicaciones y platform_comunicaciones para
-- permitir adjuntar varias imágenes que después se renderizan como carrusel.

ALTER TABLE public.comunicaciones
  ADD COLUMN IF NOT EXISTS imagen_urls text[];

ALTER TABLE public.platform_comunicaciones
  ADD COLUMN IF NOT EXISTS imagen_urls text[];
