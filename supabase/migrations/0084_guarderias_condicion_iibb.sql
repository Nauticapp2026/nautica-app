-- Condición frente a Ingresos Brutos (ARCA) por guardería.
-- Opcional, para registro interno y envío a TusFacturas.

CREATE TYPE condicion_iibb AS ENUM (
  'convenio_multilateral',
  'local',
  'exento',
  'no_gravado',
  'no_corresponde'
);

ALTER TABLE guarderias ADD COLUMN condicion_iibb condicion_iibb;
