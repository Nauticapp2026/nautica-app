-- Varios centros emisores (puntos de venta ARCA) por guardería.
--
-- Hasta ahora el POS y sus credenciales de TusFacturas vivían como columnas
-- singulares de `guarderias` (punto_de_venta, tusfacturas_apikey/apitoken/
-- usertoken). Esta tabla los saca a una fila por centro emisor, con un nombre
-- visible en el dropdown de emisión y un flag de principal (el que usan el
-- cron de auto-emisión y todo flujo que no elige a mano).
--
-- Las columnas singulares de `guarderias` NO se dropean: quedan espejando el
-- centro emisor principal (dual-write desde el código) como red de seguridad
-- para cualquier lector que todavía no migró.

CREATE TABLE public.guarderia_centros_emisores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guarderia_id uuid NOT NULL REFERENCES public.guarderias(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  -- Número de POS en ARCA. No editable una vez creado (igual que antes).
  punto_de_venta integer NOT NULL,
  -- Credenciales propias del POS que devuelve TusFacturas al alta.
  apikey text,
  apitoken text,
  usertoken text,
  es_principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guarderia_centros_emisores_pv_unico UNIQUE (guarderia_id, punto_de_venta)
);

CREATE INDEX guarderia_centros_emisores_guarderia_idx
  ON public.guarderia_centros_emisores (guarderia_id);

-- Un solo principal por guardería.
CREATE UNIQUE INDEX guarderia_centros_emisores_principal_idx
  ON public.guarderia_centros_emisores (guarderia_id)
  WHERE es_principal;

-- Backfill: el POS que cada guardería ya tenía pasa a ser su centro emisor
-- principal, con las mismas credenciales.
INSERT INTO public.guarderia_centros_emisores
  (guarderia_id, nombre, punto_de_venta, apikey, apitoken, usertoken, es_principal)
SELECT id, 'Centro emisor principal', punto_de_venta,
       tusfacturas_apikey, tusfacturas_apitoken, tusfacturas_usertoken, true
FROM public.guarderias
WHERE punto_de_venta IS NOT NULL
ON CONFLICT (guarderia_id, punto_de_venta) DO NOTHING;

-- Trazabilidad: por qué centro emisor salió (o intentó salir) cada
-- comprobante. Clave para reenviar una rechazada por el mismo POS con el que
-- se intentó, y para NC/ND cuando el comprobante todavía no tiene codigo.
ALTER TABLE public.facturacion
  ADD COLUMN centro_emisor_id uuid
  REFERENCES public.guarderia_centros_emisores(id) ON DELETE SET NULL;

ALTER TABLE public.guarderia_centros_emisores ENABLE ROW LEVEL SECURITY;

-- Contiene credenciales de TusFacturas: solo roles admin de la guardería
-- (no todos los miembros) y super admin.
CREATE POLICY guarderia_centros_emisores_select ON public.guarderia_centros_emisores
  FOR SELECT USING (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

CREATE POLICY guarderia_centros_emisores_insert ON public.guarderia_centros_emisores
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );

CREATE POLICY guarderia_centros_emisores_update ON public.guarderia_centros_emisores
  FOR UPDATE USING (
    public.is_super_admin()
    OR guarderia_id IN (
      SELECT guarderia_id FROM public.memberships
      WHERE user_id = (SELECT auth.uid())
        AND rol IN ('administrador_general', 'administrativo', 'contable')
    )
  );
