-- =============================================================================
-- Amplía los MIME types permitidos en el bucket de Storage `documentos`.
--
-- Antes el bucket solo aceptaba PDF e imágenes y rechazaba .docx/.xlsx con
-- "mime type ... is not supported". El cliente subió un .docx y se topó con
-- ese error.
--
-- Lista nueva: PDF, imágenes comunes, Word y Excel (formato moderno y
-- legacy). Si en el futuro se quiere agregar PowerPoint u otros, sumar acá.
--
-- Idempotente.
-- =============================================================================

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
where id = 'documentos';
