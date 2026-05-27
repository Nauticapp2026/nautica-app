-- Trigger: auto-resolver alertas pendientes cuando el socio confirma arribo.
-- Se dispara en porteria AFTER UPDATE cuando arribada_en pasa de NULL a un valor.
-- resolvedBy queda NULL para distinguir resoluciones automáticas de las manuales.

CREATE OR REPLACE FUNCTION auto_resolver_alertas_por_arribo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.arribada_en IS NULL AND NEW.arribada_en IS NOT NULL THEN
    UPDATE alertas
    SET
      estado      = 'resuelta',
      resolved_at = NOW()
    WHERE
      porteria_id = NEW.id
      AND estado  = 'pendiente';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_resolver_alertas_arribo
AFTER UPDATE ON porteria
FOR EACH ROW
EXECUTE FUNCTION auto_resolver_alertas_por_arribo();
