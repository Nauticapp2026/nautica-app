// Sin 'use server': facturacion.ts (que sí lo tiene) solo puede exportar
// async functions. Esta lógica la necesita tanto la action como Server
// Components de solo lectura (ej. la página de Ventas, para mostrar
// CUIT/DNI en la tabla), así que se comparte desde aquí.

/**
 * Datos del socio relevantes para construir la identidad de facturación.
 * facturaFiscal = true  → facturar con datos PERSONALES (pestaña Generales).
 * facturaFiscal = false → facturar con DATOS IMPOSITIVOS (razón social, CUIT).
 */
export type SocioFacturacion = {
  id: string;
  email: string;
  emailFacturacion: string | null;
  nombre: string | null;
  apellido: string | null;
  razonSocial: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  cuit: string | null;
  direccion: string | null;
  direccionFiscal: string | null;
  condicionIva: string | null;
  condicionIvaPersonal: string | null;
  facturaFiscal: boolean;
};

/**
 * Identidad fiscal efectiva del socio según el modo de facturación. Usada
 * para validar el documento, armar el cliente de TusFacturas, y mostrar
 * CUIT/DNI en las tablas de Ventas — todos miran los mismos campos.
 * Devuelve los valores en enums internos (DB).
 */
export function identidadFacturacion(p: SocioFacturacion): {
  razon: string;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  condicionIva: string | null;
  domicilio: string;
} {
  const nombreCompleto = [p.nombre, p.apellido].filter(Boolean).join(' ').trim();

  if (p.facturaFiscal) {
    // Datos personales (Generales).
    return {
      razon: nombreCompleto || p.email,
      tipoDocumento: p.tipoDocumento,
      numeroDocumento: p.numeroDocumento,
      condicionIva: p.condicionIvaPersonal,
      domicilio: p.direccion?.trim() || '',
    };
  }

  // Datos impositivos. Si tiene CUIT cargado, es el documento de facturación.
  return {
    razon: p.razonSocial?.trim() || nombreCompleto || p.email,
    tipoDocumento: p.cuit?.trim() ? 'cuit' : p.tipoDocumento,
    numeroDocumento: p.cuit?.trim() || p.numeroDocumento,
    condicionIva: p.condicionIva,
    domicilio: p.direccionFiscal?.trim() || p.direccion?.trim() || '',
  };
}
