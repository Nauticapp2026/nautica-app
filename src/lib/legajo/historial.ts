/**
 * Historial de cambios del legajo (respaldo jurídico: quién cambió qué y cuándo).
 *
 * Función pura que compara el legajo antes y después de una edición y devuelve los campos
 * que cambiaron. La escritura en `empleado_historial` la hacen los server actions, dentro
 * de la misma transacción que el cambio.
 */

import {
  ESTADOS_CIVILES,
  ESTADOS_EDUCATIVOS,
  ESTADOS_EMPLEADO,
  GENEROS,
  NIVELES_EDUCATIVOS,
  TIPOS_CUENTA,
  TIPOS_DOCUMENTO_PERSONA,
  labelDe,
  type Opcion,
} from './constantes';

type Valor = string | boolean | string[] | null | undefined;

/** Campo del legajo que se audita → etiqueta legible y, si corresponde, cómo mostrar su valor. */
const CAMPOS: Record<string, { label: string; opciones?: Opcion[]; enmascarar?: boolean }> = {
  nombre: { label: 'Nombre' },
  apellido: { label: 'Apellido' },
  tipoDocumento: { label: 'Tipo de documento', opciones: TIPOS_DOCUMENTO_PERSONA },
  nroDocumento: { label: 'Nº de documento' },
  cuilCuit: { label: 'CUIL/CUIT' },
  fechaNacimiento: { label: 'Fecha de nacimiento' },
  genero: { label: 'Género', opciones: GENEROS },
  direccion: { label: 'Domicilio' },
  localidad: { label: 'Localidad' },
  provincia: { label: 'Provincia' },
  telefono: { label: 'Teléfono' },
  email: { label: 'Email' },
  fechaIngreso: { label: 'Fecha de ingreso' },
  fechaIngresoArca: { label: 'Fecha de ingreso ARCA' },
  tipoContratacion: { label: 'Tipo de contratación' },
  puesto: { label: 'Puesto' },
  tareas: { label: 'Tareas a cargo' },
  area: { label: 'Área' },
  sedes: { label: 'Sedes' },
  ubicaciones: { label: 'Ubicaciones' },
  bienesUso: { label: 'Bienes de uso asignados' },
  convenio: { label: 'Convenio colectivo' },
  categoria: { label: 'Categoría laboral' },
  estado: { label: 'Estado', opciones: ESTADOS_EMPLEADO },
  fechaEgreso: { label: 'Fecha de egreso' },
  motivoEgreso: { label: 'Motivo del egreso' },
  obraSocial: { label: 'Obra social' },
  art: { label: 'ART' },
  aptoMedico: { label: 'Apto médico' },
  fechaUltimoExamen: { label: 'Último examen médico' },
  banco: { label: 'Banco' },
  cbu: { label: 'CBU/CVU', enmascarar: true },
  tipoCuenta: { label: 'Tipo de cuenta', opciones: TIPOS_CUENTA },
  nivelEducativo: { label: 'Nivel educativo', opciones: NIVELES_EDUCATIVOS },
  estadoEducativo: { label: 'Estado educativo', opciones: ESTADOS_EDUCATIVOS },
  estadoCivil: { label: 'Estado civil', opciones: ESTADOS_CIVILES },
};

export type CambioLegajo = { campo: string; anterior: string | null; nuevo: string | null };

function textoDe(clave: string, v: Valor): string | null {
  const def = CAMPOS[clave];
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.length === 0 ? null : v.join(', ');
  // El CBU no se guarda entero en el historial: solo los últimos dígitos.
  if (def?.enmascarar) return `••••${String(v).slice(-4)}`;
  return def?.opciones ? labelDe(def.opciones, v) : String(v);
}

/** Campos auditados que cambiaron entre `antes` y `despues` (solo los que `despues` informa). */
export function calcularCambios(antes: object, despues: object): CambioLegajo[] {
  const previo = antes as Record<string, Valor>;
  const actual = despues as Record<string, Valor>;
  const out: CambioLegajo[] = [];
  for (const clave of Object.keys(CAMPOS)) {
    if (!(clave in actual)) continue;
    const a = textoDe(clave, previo[clave]);
    const n = textoDe(clave, actual[clave]);
    if (a === n) continue;
    out.push({ campo: CAMPOS[clave].label, anterior: a, nuevo: n });
  }
  return out;
}
