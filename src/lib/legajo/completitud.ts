/**
 * Completitud del legajo: qué datos obligatorios faltan.
 *
 * El documento del cliente marca varias secciones como "Obligatorios". Para no frenar el
 * alta (a veces se carga a una persona con lo que hay y se completa después), el sistema
 * deja crear el legajo con lo mínimo y muestra acá, de forma visible, lo que falta: en la
 * lista de personal y arriba de cada legajo. Así "obligatorio" se cumple sin trabar la carga.
 *
 * La documentación operativa y náutica depende del puesto (no todos operan autoelevadores
 * ni navegan), por eso NO cuenta como faltante; solo avisa cuando se tildó "Posee" y no se
 * adjuntó el archivo.
 */

import { FUERA_DE_CONVENIO } from '@/lib/catalogos-club';
import { DOCUMENTOS_LEGAJO } from './constantes';
import { validarCbu, validarCuil } from './validaciones';

export type SeccionLegajo =
  | 'personales'
  | 'laboral'
  | 'seguridad-social'
  | 'financiero'
  | 'documentacion';

export type Faltante = { seccion: SeccionLegajo; etiqueta: string };

export type DatosCompletitud = {
  cuilCuit: string | null;
  fechaNacimiento: string | null;
  genero: string | null;
  direccion: string | null;
  localidad: string | null;
  provincia: string | null;
  telefono: string | null;
  email: string | null;
  fechaIngresoArca: string | null;
  tipoContratacion: string | null;
  puesto: string | null;
  tareas: string | null;
  area: string | null;
  sedes: string[];
  convenio: string | null;
  categoria: string | null;
  aptoMedico: boolean;
  obraSocial: string | null;
  art: string | null;
  banco: string | null;
  cbu: string | null;
  tipoCuenta: string | null;
};

export type DocumentoCompletitud = { tipo: string; posee: boolean; tieneArchivo: boolean };

const vacio = (v: string | null | undefined) => !v || v.trim() === '';

export function calcularFaltantes(
  e: DatosCompletitud,
  docs: DocumentoCompletitud[],
  tieneHorario: boolean,
): { faltantes: Faltante[]; avisos: Faltante[] } {
  const f: Faltante[] = [];
  const falta = (seccion: SeccionLegajo, etiqueta: string) => f.push({ seccion, etiqueta });

  // Datos personales
  if (vacio(e.cuilCuit)) falta('personales', 'CUIL/CUIT');
  else if (!validarCuil(e.cuilCuit as string).ok) falta('personales', 'CUIL/CUIT válido');
  if (vacio(e.fechaNacimiento)) falta('personales', 'Fecha de nacimiento');
  if (vacio(e.genero)) falta('personales', 'Género');
  if (vacio(e.direccion)) falta('personales', 'Domicilio');
  if (vacio(e.localidad) || vacio(e.provincia)) falta('personales', 'Localidad y provincia');
  if (vacio(e.telefono)) falta('personales', 'Teléfono de contacto');
  if (vacio(e.email)) falta('personales', 'Email personal');

  // Información laboral y contratación
  if (vacio(e.fechaIngresoArca)) falta('laboral', 'Fecha de ingreso en ARCA');
  if (vacio(e.tipoContratacion)) falta('laboral', 'Tipo de contratación');
  if (vacio(e.puesto)) falta('laboral', 'Puesto o cargo');
  if (vacio(e.tareas)) falta('laboral', 'Tareas a cargo');
  if (vacio(e.area)) falta('laboral', 'Área o departamento');
  if (e.sedes.length === 0) falta('laboral', 'Sucursal o sede');
  // El convenio es opcional si es personal fuera de convenio; con convenio, la categoría pasa a ser obligatoria.
  if (!vacio(e.convenio) && e.convenio !== FUERA_DE_CONVENIO && vacio(e.categoria)) {
    falta('laboral', 'Categoría laboral');
  }
  if (!tieneHorario) falta('laboral', 'Horario laboral');

  // Seguridad social, salud y seguros
  if (vacio(e.obraSocial)) falta('seguridad-social', 'Obra social');
  if (vacio(e.art)) falta('seguridad-social', 'ART asignada');
  if (!e.aptoMedico) falta('seguridad-social', 'Apto médico preocupacional');

  // Datos financieros
  if (vacio(e.banco)) falta('financiero', 'Banco');
  if (vacio(e.cbu)) falta('financiero', 'CBU/CVU');
  else if (!validarCbu(e.cbu as string).ok) falta('financiero', 'CBU/CVU válido');
  if (vacio(e.tipoCuenta)) falta('financiero', 'Tipo de cuenta');

  // Documentación obligatoria
  const porTipo = new Map(docs.map((d) => [d.tipo, d]));
  for (const def of DOCUMENTOS_LEGAJO) {
    if (def.obligatorio && !porTipo.get(def.tipo)?.tieneArchivo) {
      falta('documentacion', def.label);
    }
  }

  // Avisos (no cuentan como faltante): se tildó "Posee" pero no hay archivo
  const avisos: Faltante[] = [];
  for (const def of DOCUMENTOS_LEGAJO) {
    const d = porTipo.get(def.tipo);
    if (def.conCheck && d?.posee && !d.tieneArchivo) {
      avisos.push({ seccion: 'documentacion', etiqueta: `Adjuntar: ${def.label}` });
    }
  }

  return { faltantes: f, avisos };
}
