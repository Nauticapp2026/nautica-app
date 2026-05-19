// Lista de puertos disponibles en el SHN (Servicio de Hidrografia Naval)
// para consultar tablas de marea. Extraida del form de
// https://www.hidro.gob.ar/oceanografia/Tmareas/Form_Tmareas.asp
//
// El `id` es el codigo que espera el form en el campo `Localidad`.
// `region` agrupa para el selector de mobile.

export type RegionPuerto =
  | 'rio_de_la_plata'
  | 'costa_bonaerense'
  | 'patagonia_norte'
  | 'patagonia_sur'
  | 'tierra_del_fuego'
  | 'islas_malvinas';

export type PuertoSHN = {
  id: string;
  nombre: string;
  region: RegionPuerto;
};

export const PUERTOS_SHN: PuertoSHN[] = [
  // --- Rio de la Plata + delta ---
  { id: 'MAGA', nombre: 'Isla Martín García', region: 'rio_de_la_plata' },
  { id: 'SANF', nombre: 'San Fernando', region: 'rio_de_la_plata' },
  {
    id: 'BSAS',
    nombre: 'Puerto de Buenos Aires (Muelle de Pescadores)',
    region: 'rio_de_la_plata',
  },
  { id: 'LPLA', nombre: 'Puerto La Plata', region: 'rio_de_la_plata' },
  { id: 'ATAL', nombre: 'Atalaya', region: 'rio_de_la_plata' },
  { id: 'PIND', nombre: 'Canal Punta Indio (Km 201.6)', region: 'rio_de_la_plata' },
  { id: 'OYAR', nombre: 'Canal Punta Indio (Oyarvide - Km 133)', region: 'rio_de_la_plata' },
  { id: 'NORD', nombre: 'Pilote Norden - Administración Binacional', region: 'rio_de_la_plata' },

  // --- Costa bonaerense ---
  { id: 'SCLE', nombre: 'San Clemente del Tuyú (Muelle)', region: 'costa_bonaerense' },
  { id: 'STER', nombre: 'Santa Teresita', region: 'costa_bonaerense' },
  { id: 'MAJO', nombre: 'Mar de Ajó', region: 'costa_bonaerense' },
  { id: 'PINA', nombre: 'Pinamar', region: 'costa_bonaerense' },
  { id: 'MARD', nombre: 'Puerto Mar del Plata', region: 'costa_bonaerense' },
  { id: 'QUEQ', nombre: 'Puerto Quequén', region: 'costa_bonaerense' },
  { id: 'MHER', nombre: 'Monte Hermoso', region: 'costa_bonaerense' },
  { id: 'BELG', nombre: 'Puerto Belgrano', region: 'costa_bonaerense' },
  { id: 'IWHI', nombre: 'Puerto Ingeniero White', region: 'costa_bonaerense' },
  { id: 'ROSA', nombre: 'Puerto Rosales', region: 'costa_bonaerense' },
  { id: 'BBLA', nombre: 'Canal Principal a Bahía Blanca', region: 'costa_bonaerense' },
  { id: 'SANB', nombre: 'Bahía San Blas', region: 'costa_bonaerense' },

  // --- Patagonia norte ---
  { id: 'RION', nombre: 'Río Negro (Punta Redonda)', region: 'patagonia_norte' },
  { id: 'SANT', nombre: 'Puerto San Antonio (Muelle de Ultramar)', region: 'patagonia_norte' },
  { id: 'PCOL', nombre: 'Cargadero de Punta Colorada', region: 'patagonia_norte' },
  { id: 'MADR', nombre: 'Puerto Madryn', region: 'patagonia_norte' },
  { id: 'RAWS', nombre: 'Puerto Rawson', region: 'patagonia_norte' },
  { id: 'SROM', nombre: 'Fondeadero San Román (Golfo San José)', region: 'patagonia_norte' },
  { id: 'SELE', nombre: 'Puerto Santa Elena', region: 'patagonia_norte' },
  { id: 'COMO', nombre: 'Puerto Comodoro Rivadavia', region: 'patagonia_norte' },
  { id: 'CPAU', nombre: 'Caleta Paula', region: 'patagonia_norte' },

  // --- Patagonia sur ---
  { id: 'PDES', nombre: 'Puerto Deseado', region: 'patagonia_sur' },
  { id: 'QUIL', nombre: 'Punta Quilla (Puerto Santa Cruz)', region: 'patagonia_sur' },
  { id: 'SJUL', nombre: 'Puerto San Julián (Punta Peña)', region: 'patagonia_sur' },
  { id: 'LOYO', nombre: 'Punta Loyola (Muelle Presidente Illia)', region: 'patagonia_sur' },
  { id: 'TURB', nombre: 'Muelle El Turbio (Puerto Río Gallegos)', region: 'patagonia_sur' },

  // --- Tierra del Fuego ---
  { id: 'RIOG', nombre: 'Puerto Río Grande (Exterior)', region: 'tierra_del_fuego' },
  { id: 'LAMI', nombre: 'Caleta La Misión', region: 'tierra_del_fuego' },
  { id: 'SSEB', nombre: 'Bahía San Sebastián', region: 'tierra_del_fuego' },
  { id: 'USHU', nombre: 'Bahía Ushuaia', region: 'tierra_del_fuego' },
  { id: 'AGUI', nombre: 'Bahía Aguirre', region: 'tierra_del_fuego' },
  { id: 'SUCE', nombre: 'Bahía Buen Suceso', region: 'tierra_del_fuego' },
  { id: 'THET', nombre: 'Bahía Thetis', region: 'tierra_del_fuego' },
  { id: 'EMAG', nombre: 'Estrecho de Magallanes (Boca Oriental)', region: 'tierra_del_fuego' },
  { id: 'SPAB', nombre: 'Caleta San Pablo', region: 'tierra_del_fuego' },
  { id: 'CBRE', nombre: 'Caleta Brent (Isla de los Estados)', region: 'tierra_del_fuego' },
  { id: 'CROS', nombre: 'Bahía Crossley (Isla de los Estados)', region: 'tierra_del_fuego' },
  { id: 'VANC', nombre: 'Puerto Vancouver (Isla de los Estados)', region: 'tierra_del_fuego' },
  {
    id: 'SJUA',
    nombre: 'Puerto San Juan del Salvamento (Isla de los Estados)',
    region: 'tierra_del_fuego',
  },
  { id: 'ANUE', nombre: 'Islas de Año Nuevo (Isla Observatorio)', region: 'tierra_del_fuego' },

  // --- Malvinas ---
  { id: 'PARG', nombre: 'Puerto Argentino (Isla Soledad)', region: 'islas_malvinas' },
];

export const REGION_LABEL: Record<RegionPuerto, string> = {
  rio_de_la_plata: 'Río de la Plata y delta',
  costa_bonaerense: 'Costa bonaerense',
  patagonia_norte: 'Patagonia norte',
  patagonia_sur: 'Patagonia sur',
  tierra_del_fuego: 'Tierra del Fuego',
  islas_malvinas: 'Islas Malvinas',
};

export function getPuerto(id: string): PuertoSHN | null {
  return PUERTOS_SHN.find((p) => p.id === id) ?? null;
}
