-- =============================================================================
-- Agrega 'proveedor_exterior' al enum public.condicion_frente_iva.
--
-- El listado completo de "Condición frente al IVA" de AFIP tiene 11 categorías.
-- En este repo arrancamos con 6 (las más comunes). Acá sumamos Proveedor del
-- Exterior porque tusfacturas tiene código documentado para esta condición
-- (`PDEX`).
--
-- Las otras 4 categorías AFIP (Sujeto No Categorizado, IVA Liberado - Ley N°
-- 19.640, Monotributista Social, Monotributista Trabajador Independiente
-- Promovido) quedan pendientes de agregar cuando se confirmen los códigos que
-- usa tusfacturas — sin código TF correcto, la emisión de factura fallaría.
--
-- Idempotente.
-- =============================================================================

alter type public.condicion_frente_iva add value if not exists 'proveedor_exterior';
