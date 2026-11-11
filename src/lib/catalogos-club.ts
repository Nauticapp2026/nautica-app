/**
 * Listas desplegables que el club puede ampliar (puestos, bancos, marcas, rubros…).
 *
 * Traen sugerencias iniciales y el club suma las suyas desde el propio desplegable. Se guardan
 * en la tabla `legajo_catalogo` (el nombre es histórico: sirve a todos los módulos de
 * administración, el `tipo` es texto libre). Módulo plano, sin 'use server'.
 */

/** Opción de un desplegable cerrado: valor guardado y texto que ve el usuario. */
export type Opcion = { value: string; label: string };

// ── Listas desplegables que el club puede ampliar ───────────────────────────

export type TipoCatalogo =
  | 'tipo_contratacion'
  | 'puesto'
  | 'area'
  | 'sede'
  | 'ubicacion'
  | 'bien_uso'
  | 'convenio'
  | 'categoria'
  | 'obra_social'
  | 'art'
  | 'banco'
  | 'tipo_licencia'
  | 'prov_area'
  | 'prov_actividad'
  | 'prov_cuenta_contable'
  | 'prov_condicion_pago'
  | 'prov_forma_pago'
  | 'prov_documento'
  | 'bu_tipo'
  | 'bu_rubro'
  | 'bu_subrubro'
  | 'bu_marca'
  | 'bu_ubicacion'
  | 'bu_lugar'
  | 'bu_motivo_baja'
  | 'bu_aseguradora'
  | 'bu_tipo_intervencion'
  | 'bu_tipo_falla'
  | 'bu_tipo_insumo'
  | 'bu_tipo_inspeccion';

export const TIPOS_CATALOGO: TipoCatalogo[] = [
  'tipo_contratacion',
  'puesto',
  'area',
  'sede',
  'ubicacion',
  'bien_uso',
  'convenio',
  'categoria',
  'obra_social',
  'art',
  'banco',
  'tipo_licencia',
  'prov_area',
  'prov_actividad',
  'prov_cuenta_contable',
  'prov_condicion_pago',
  'prov_forma_pago',
  'prov_documento',
  'bu_tipo',
  'bu_rubro',
  'bu_subrubro',
  'bu_marca',
  'bu_ubicacion',
  'bu_lugar',
  'bu_motivo_baja',
  'bu_aseguradora',
  'bu_tipo_intervencion',
  'bu_tipo_falla',
  'bu_tipo_insumo',
  'bu_tipo_inspeccion',
];

export const FUERA_DE_CONVENIO = 'Fuera de convenio';

/**
 * Sugerencias iniciales de cada lista. No son una lista cerrada: el club suma las suyas
 * desde el propio desplegable ("Agregar…"). Las sedes y las ubicaciones se completan
 * además con lo que ya existe en el club (su nombre y sus áreas de Espacios).
 */
export const CATALOGO_BASE: Record<TipoCatalogo, string[]> = {
  tipo_contratacion: [
    'Contrato por tiempo indeterminado',
    'Plazo fijo',
    'Eventual',
    'Contrato de temporada',
    'Monotributista / locación de servicios',
    'Pasantía',
  ],
  puesto: [
    'Administrativo/a',
    'Encargado/a',
    'Marinero/a',
    'Operario/a',
    'Operador/a de autoelevador',
    'Mecánico/a náutico',
    'Portería / Seguridad',
    'Mantenimiento',
    'Limpieza',
  ],
  area: ['Administración', 'Atención a socios', 'Operaciones', 'Mantenimiento', 'Seguridad'],
  sede: [],
  ubicacion: [],
  bien_uso: [
    'Lancha de servicio',
    'Autoelevador',
    'Tractor',
    'Pluma / grúa',
    'Radio VHF',
    'Teléfono celular',
    'Uniforme',
    'Llaves de acceso',
  ],
  convenio: [FUERA_DE_CONVENIO],
  categoria: [],
  obra_social: [
    'OSDE',
    'Swiss Medical',
    'Galeno',
    'Medifé',
    'Sancor Salud',
    'OSECAC (Empleados de Comercio)',
    'OSUTHGRA (Hoteleros y Gastronómicos)',
    'PAMI',
  ],
  art: [
    'Provincia ART',
    'Galeno ART',
    'Experta ART',
    'Prevención ART',
    'La Segunda ART',
    'Asociart ART',
    'Federación Patronal Seguros',
    'Omint ART',
    'Berkley ART',
  ],
  banco: [
    'Banco de la Nación Argentina',
    'Banco de la Provincia de Buenos Aires',
    'Banco Ciudad',
    'Banco Santander',
    'BBVA',
    'Banco Galicia',
    'Banco Macro',
    'Banco Patagonia',
    'Banco Credicoop',
    'Banco ICBC',
    'Banco Hipotecario',
    'Mercado Pago (CVU)',
    'Ualá (CVU)',
    'Naranja X (CVU)',
  ],
  tipo_licencia: [
    'Enfermedad inculpable',
    'Accidente de trabajo (ART)',
    'Maternidad',
    'Paternidad',
    'Nacimiento de hijo/a',
    'Matrimonio',
    'Fallecimiento de familiar',
    'Examen / estudio',
    'Donación de sangre',
    'Mudanza',
    'Sin goce de haberes',
    'Otra',
  ],
  prov_area: [
    'Combustible',
    'Mantenimiento naval',
    'Electrónica náutica',
    'Pinturas y antiincrustantes',
    'Motores y repuestos',
    'Grúas y izajes',
    'Limpieza',
    'Seguridad',
    'Servicios profesionales',
    'Construcción y obras',
    'Insumos y librería',
    'Alimentos y bebidas',
  ],
  prov_actividad: [
    'Venta de combustible y lubricantes',
    'Servicios de mantenimiento',
    'Venta de repuestos',
    'Construcción y obras civiles',
    'Servicios profesionales',
    'Transporte y logística',
    'Servicios de limpieza',
    'Servicios de seguridad',
    'Provisión de insumos',
    'Alimentos y bebidas',
    'Servicios informáticos',
  ],
  prov_cuenta_contable: [
    'Gastos de mantenimiento',
    'Combustibles y lubricantes',
    'Repuestos y materiales',
    'Servicios públicos',
    'Honorarios profesionales',
    'Seguros',
    'Impuestos y tasas',
    'Bienes de uso',
    'Fletes y logística',
    'Gastos generales',
  ],
  prov_condicion_pago: [
    'Contado',
    '7 días',
    '15 días',
    '30 días',
    '45 días',
    '60 días',
    '90 días',
    'Cuenta corriente',
  ],
  prov_forma_pago: [
    'Transferencia bancaria',
    'Cheque',
    'Efectivo',
    'Tarjeta',
    'Billetera virtual / QR',
    'Débito automático',
  ],
  prov_documento: [
    'Constancia de inscripción ARCA',
    'Constancia de inscripción en Ingresos Brutos',
    'Certificado de cobertura de ART',
    'Seguro de responsabilidad civil',
    'Seguro de vida obligatorio',
    'Comprobante de pago de cargas sociales (F.931)',
    'Nómina del personal que ingresa',
    'Habilitación municipal',
    'Certificado de exclusión de retenciones',
    'Constancia de CBU',
  ],
  bu_tipo: [
    'Camioneta',
    'Autoelevador',
    'Grúa',
    'Tractor',
    'Lancha de servicio',
    'Máquina',
    'Herramienta',
    'Compresor',
    'Generador',
  ],
  bu_rubro: [
    'Rodados',
    'Maquinarias y equipos',
    'Instalaciones',
    'Embarcaciones',
    'Herramientas',
    'Muebles y útiles',
    'Equipos de computación',
    'Inmuebles',
  ],
  bu_subrubro: [
    'Camionetas y utilitarios',
    'Autoelevadores',
    'Grúas y plumas',
    'Tractores de varadero',
    'Lanchas de servicio',
    'Herramientas eléctricas',
    'Generadores y compresores',
    'Otros',
  ],
  bu_marca: [
    'Bobcat',
    'Bosch',
    'Caterpillar',
    'Chevrolet',
    'Clark',
    'DeWalt',
    'Ford',
    'Honda',
    'Hyster',
    'Hyundai',
    'Iveco',
    'John Deere',
    'Komatsu',
    'Linde',
    'Makita',
    'Mercedes-Benz',
    'Mercury',
    'Nissan',
    'Renault',
    'Stihl',
    'Suzuki',
    'Toyota',
    'Volkswagen',
    'Yale',
    'Yamaha',
  ],
  bu_ubicacion: [],
  bu_lugar: [
    'Varadero',
    'Muelle',
    'Playa de guardado',
    'Taller',
    'Nave',
    'Oficina',
    'Rampa o botadero',
    'Predio general',
  ],
  bu_motivo_baja: [
    'Venta',
    'Fin de vida útil',
    'Siniestro o accidente',
    'Robo',
    'Obsolescencia',
    'Fin de alquiler o leasing',
    'Donación',
    'Rotura sin reparación',
  ],
  bu_aseguradora: [
    'Allianz',
    'Berkley',
    'Federación Patronal',
    'La Caja',
    'Mapfre',
    'Mercantil Andina',
    'Provincia Seguros',
    'Rivadavia',
    'San Cristóbal',
    'Sancor Seguros',
    'Zurich',
  ],
  bu_tipo_intervencion: [
    'Preventivo',
    'Correctivo',
    'Cambio de repuesto',
    'Ajuste o calibración',
    'Revisión general',
    'Reparación mayor',
  ],
  bu_tipo_falla: [
    'Mecánica',
    'Eléctrica',
    'Hidráulica',
    'Neumática',
    'Electrónica',
    'Carrocería o estructura',
  ],
  bu_tipo_insumo: [
    'Aceite de motor',
    'Filtro de aceite',
    'Filtro de aire',
    'Filtro de combustible',
    'Líquido refrigerante',
    'Líquido de frenos',
    'Aceite hidráulico',
    'Neumáticos',
    'Batería',
    'Correas',
    'Bujías o inyectores',
  ],
  bu_tipo_inspeccion: [
    'Checklist diario del operador',
    'Prueba de seguridad',
    'Control de emisiones',
    'Inspección técnica / VTV',
  ],
};

export const LABEL_CATALOGO: Record<TipoCatalogo, string> = {
  tipo_contratacion: 'tipo de contratación',
  puesto: 'puesto',
  area: 'área',
  sede: 'sede',
  ubicacion: 'ubicación',
  bien_uso: 'bien de uso',
  convenio: 'convenio',
  categoria: 'categoría',
  obra_social: 'obra social',
  art: 'ART',
  banco: 'banco',
  tipo_licencia: 'tipo de licencia',
  prov_area: 'área del proveedor',
  prov_actividad: 'actividad',
  prov_cuenta_contable: 'cuenta contable',
  prov_condicion_pago: 'condición de pago',
  prov_forma_pago: 'forma de pago',
  prov_documento: 'requisito',
  bu_tipo: 'tipo de bien',
  bu_rubro: 'rubro',
  bu_subrubro: 'subrubro',
  bu_marca: 'marca',
  bu_ubicacion: 'ubicación',
  bu_lugar: 'lugar de utilización',
  bu_motivo_baja: 'motivo de baja',
  bu_aseguradora: 'aseguradora',
  bu_tipo_intervencion: 'tipo de intervención',
  bu_tipo_falla: 'tipo de falla',
  bu_tipo_insumo: 'tipo de insumo',
  bu_tipo_inspeccion: 'tipo de inspección',
};

export type CatalogosDisponibles = Record<TipoCatalogo, string[]>;

/** Une las sugerencias base, lo que ya existe en el club y lo que agregó el club, sin repetidos. */
export function unirOpciones(...listas: (string[] | undefined)[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const lista of listas) {
    for (const v of lista ?? []) {
      const t = v.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      out.push(t);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}
