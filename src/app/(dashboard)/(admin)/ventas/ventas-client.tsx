'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  Download,
  Edit3,
  FileDown,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react';

import {
  crearComprobanteInternoAction,
  crearComprobanteInternoLoteAction,
  createBatchInvoicesAction,
  createInvoiceAction,
  emitirNotaAsociadaAction,
  emitirNotaCreditoAction,
  emitirNotaCreditoInternaAction,
  emitirNotaLibreAction,
  enviarComprobantePorMailAction,
  getPendientesEmisionAction,
  markInvoicePaidAction,
  obtenerPdfFacturaAction,
  reenviarFacturaRechazadaAction,
  type BatchResult,
  type ComprobanteInternoLoteResult,
  type PendienteEmision,
} from '@/app/actions/facturacion';
import { MOTIVO_NOTA_LABEL, type MotivoNota } from '@/app/actions/nota-constants';
import { toast } from 'sonner';
import { buscarSocios, normalizarBusqueda } from '@/lib/buscador';
import { formatArgentinaDate } from '@/lib/dates';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { TablaScrollX } from '@/components/shared/tabla-scroll-x';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Factura = {
  id: string;
  codigo: string | null;
  folioLocal: string | null;
  tipoFactura: string | null;
  tipoRecibo: 'fiscal' | 'interno' | null;
  importe: string | null;
  estado: string | null;
  emision: string | null;
  vencimiento: string | null;
  desde: string | null;
  hasta: string | null;
  archivo: string | null;
  descripcion: string | null;
  socioId: string | null;
  socioNombre: string;
  cae: string | null;
  facturaOriginalId: string | null;
  rechazada: boolean;
  motivoError: string | null;
  condicionVenta: string | null;
  medioPago: string | null;
  letra: string;
  montoNeto: string | null;
  montoExento: string | null;
  montoIva: string | null;
  caeVencimiento: string | null;
  socioRazonSocial: string;
  socioNumeroSocio: number | null;
  socioCuitDni: string;
  numeroOperacionSC: string;
  entreEmisor: string;
  entreEmisorCuit: string;
  centroEmisor: string;
};

type CentroEmisorOpt = {
  id: string;
  nombre: string;
  puntoDeVenta: number;
  esPrincipal: boolean;
};

type LoteMovimiento = {
  id: string;
  concepto: string | null;
  debe: string | null;
  servicioNombre: string | null;
  tipoServicio: string | null;
  // Alícuota IVA de la tarifa (null en internos y cargos sin tarifa) — para
  // el desglose Neto/IVA del lote.
  alicuotaIva: number | null;
  // null = cargo legacy de cuenta corriente; seteado = ítem computado desde
  // el contrato vigente (modelo "los cargos nacen al emitir").
  itemKey: PendienteEmision['itemKey'];
};

type SocioInterno = {
  id: string;
  nombre: string;
  email: string;
  movimientos: LoteMovimiento[];
};

type Socio = {
  id: string;
  nombre: string;
  email: string;
  razonSocial: string | null;
  direccion: string | null;
  numeroDocumento: string;
  tipoDocumento: string | null;
  cuit: string | null;
  condicionIva: string | null;
  condicionIvaPersonal: string | null;
  // true = factura con datos personales (Generales); false = Datos Impositivos.
  facturaFiscal: boolean;
  numeroSocio: number | null;
  embarcaciones: string[];
  pendientes: number;
  pendienteTotal: string;
  movimientos: LoteMovimiento[];
};

// Condición frente al IVA efectiva del socio según el modo de facturación:
// si factura con datos personales, la de Generales; si no, la fiscal.
function condicionIvaEfectiva(
  socio: Pick<Socio, 'facturaFiscal' | 'condicionIva' | 'condicionIvaPersonal'>,
): string | null {
  return socio.facturaFiscal ? socio.condicionIvaPersonal : socio.condicionIva;
}

// Documento que realmente se manda a facturar (ver identidadFacturacion en
// actions/facturacion.ts): con datos personales es el DNI; con datos
// impositivos es el CUIT si está cargado, si no cae al DNI.
function numeroDocumentoEfectivo(
  socio: Pick<Socio, 'facturaFiscal' | 'numeroDocumento' | 'cuit'>,
): string {
  if (socio.facturaFiscal) return socio.numeroDocumento;
  return socio.cuit?.trim() || socio.numeroDocumento;
}

type Kpis = {
  pendientes: number;
  pagadasMes: number;
  vencidas: number;
  totalFacturado: string;
};

// ─── Constantes ─────────────────────────────────────────────────────────────

const TIPO_FACTURA_LABEL: Record<string, string> = {
  factura_a: 'A',
  factura_b: 'B',
  factura_c: 'C',
  recibo: 'Recibo',
  nota_credito_a: 'NC A',
  nota_credito_b: 'NC B',
  nota_credito_c: 'NC C',
  nota_credito_interna: 'NC interna',
};

// 'recibo' agrupa RC-/CI- (cobranza), CM-/CL-/CA- (comprobante interno) y RB-
// — todos documentos sin validez fiscal en sí mismos. "Recibo" queda reservado
// para Cobranzas (RC- fiscal / CI- interno): `tipoRecibo` (columna propia, se
// computa al registrar la cobranza) dice de qué tipo era la deuda que cancela.
// Todo el resto es "Comprobante interno" — nunca "Recibo interno", que es otro
// documento.
function tipoComprobanteLabel(f: {
  tipoFactura: string | null;
  tipoRecibo: 'fiscal' | 'interno' | null;
  codigo: string | null;
}): string {
  if (f.tipoFactura === 'recibo') {
    if (!(f.codigo?.startsWith('RC-') || f.codigo?.startsWith('CI-'))) {
      return 'Comprobante interno';
    }
    return f.tipoRecibo === 'fiscal' ? 'Recibo fiscal' : 'Recibo interno';
  }
  return TIPO_FACTURA_LABEL[f.tipoFactura ?? ''] ?? f.tipoFactura ?? '—';
}

// Sigla del tipo de comprobante SIN letra, para la columna "Tipo comprobante"
// del listado ARCA (pedido 2026-08-03): la letra (A/B/C) va únicamente en su
// columna "Letra".
function tipoSiglaSinLetra(tipoFactura: string | null): string {
  if (!tipoFactura) return '—';
  if (tipoFactura.startsWith('factura')) return 'FC';
  if (tipoFactura.startsWith('nota_credito')) return 'NC';
  if (tipoFactura.startsWith('nota_debito')) return 'ND';
  return TIPO_FACTURA_LABEL[tipoFactura] ?? tipoFactura;
}

const TIPO_FACTURA_OPTS = [
  { value: 'factura_c', label: 'Factura C' },
  { value: 'factura_b', label: 'Factura B' },
  { value: 'factura_a', label: 'Factura A' },
];

// La letra del comprobante NO es opcional: la fija ARCA según la condición
// frente al IVA del club y la del socio (mismo cuadro que derivarTipoFactura).
// Con el socio ya elegido se ofrece únicamente la que corresponde — dejar
// elegir entre A y B permitía emitir mal (ej. un Responsable Inscripto
// facturado como B). Sin socio elegido todavía, se listan las que el club
// podría llegar a emitir.
function tiposFacturaEmisibles(
  guarderiaCondicionIva: string | null,
  socioCondicionIva?: string | null,
) {
  if (guarderiaCondicionIva !== 'responsable_inscripto') {
    return TIPO_FACTURA_OPTS.filter((o) => o.value === 'factura_c');
  }
  if (socioCondicionIva) {
    const corresponde = derivarTipoFactura(guarderiaCondicionIva, socioCondicionIva);
    return TIPO_FACTURA_OPTS.filter((o) => o.value === corresponde);
  }
  return TIPO_FACTURA_OPTS.filter((o) => o.value !== 'factura_c');
}

function derivarTipoFactura(
  guarderiaCondicion: string | null,
  socioCondicion: string | null,
): string {
  if (guarderiaCondicion !== 'responsable_inscripto') return 'factura_c';
  // Socios RI y Monotributistas reciben Factura A (cuadro del cliente:
  // a los monotributistas les corresponde A, no B).
  if (socioCondicion === 'responsable_inscripto' || socioCondicion === 'monotributo') {
    return 'factura_a';
  }
  return 'factura_b';
}

const CONDICION_VENTA_OPTS = [
  { value: 'contado', label: 'Contado' },
  { value: 'cuenta_corriente', label: 'Cuenta corriente' },
  { value: 'dias_30', label: '30 días' },
  { value: 'dias_60', label: '60 días' },
  { value: 'dias_90', label: '90 días' },
];

const MEDIO_PAGO_OPTS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { value: 'debito_automatico', label: 'Débito automático' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
];

const ESTADO_BADGE: Record<string, string> = {
  pagada: 'bg-teal-50 text-[#175861]',
  pendiente: 'bg-amber-50 text-amber-700',
  vencida: 'bg-red-50 text-red-700',
};

// El valor 'pagada' del enum en DB se muestra como "Cobrada" en toda la
// pantalla de Ventas (pedido 2026-07-24) — mismo criterio que "Cobrado" en
// la cuenta corriente del socio.
const ESTADO_LABEL: Record<string, string> = {
  pagada: 'Cobrada',
  pendiente: 'Pendiente',
  vencida: 'Vencida',
};

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(value: string | number | null): string {
  const n = typeof value === 'string' ? parseFloat(value || '0') : (value ?? 0);
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Desglose neto/exento/IVA de ítems con IVA incluido — espejo exacto de
// `desglosarMontos` en actions/facturacion.ts (lo que se guarda y se muestra
// en las columnas del listado): alícuota 0 → el ítem es "exento"; >0 → neto +
// IVA. `fallbackAlicuota` para ítems sin tarifa: 0 en comprobantes C
// (Monotributo), 21 en el resto (mismo criterio que `alicuotaPara`).
//
// `esMonotributo`: el club no factura IVA, así que su alícuota 0 no es la
// categoría fiscal "Exento" sino simplemente "sin IVA" y el importe entero va a
// Neto. Es la misma regla que el server (pedido 2026-08-06, commit c43fb94);
// faltaba acá y quedaba tapada porque en Monotributo las tres líneas no se
// mostraban. Sin esto el modal diría Exento y el comprobante emitido, Neto.
function desglosarItemsUi(
  items: { bruto: number; alicuotaIva: number | null }[],
  fallbackAlicuota: number,
  esMonotributo = false,
): { neto: number; exento: number; iva: number } {
  let neto = 0;
  let exento = 0;
  let iva = 0;
  for (const it of items) {
    if (esMonotributo) {
      neto += it.bruto;
      continue;
    }
    const ali = it.alicuotaIva ?? fallbackAlicuota;
    if (ali === 0) {
      exento += it.bruto;
    } else {
      const n = it.bruto / (1 + ali / 100);
      neto += n;
      iva += it.bruto - n;
    }
  }
  return { neto, exento, iva };
}

// Desglose de importes de los modales de emisión: neto, exento, IVA y bruto
// (pedido 2026-08-03; antes B/C mostraban solo el bruto).
//
// Las tres líneas se muestran SIEMPRE, también en club Monotributo. Entre el
// 2026-08-05 y el 2026-08-10 ahí se mostraba solo el total, pero el cliente
// aclaró el criterio: no es que se oculten, es que en Monotributo Exento e IVA
// dan $0 y el importe entero va a Neto. Es además lo que ya muestran las
// columnas del listado de Ventas, que leen los montos guardados.
function DesgloseImportes({
  neto,
  exento,
  iva,
  bruto,
  brutoLabel,
}: {
  neto: number;
  exento: number;
  iva: number;
  bruto: number;
  brutoLabel: string;
}) {
  return (
    <div className="mb-4 rounded-[10px] bg-gray-50 px-4 py-3">
      <div className="mb-1.5 space-y-1 border-b border-gray-200 pb-1.5">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <p>Importe neto</p>
          <p>{fmtMoney(neto)}</p>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <p>Importe exento</p>
          <p>{fmtMoney(exento)}</p>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <p>Impuestos (IVA)</p>
          <p>{fmtMoney(iva)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: '#101828' }}>
          {brutoLabel}
        </p>
        <p className="text-lg font-bold" style={{ color: '#175861' }}>
          {fmtMoney(bruto)}
        </p>
      </div>
    </div>
  );
}

/**
 * Desglose de una NC/ND, para el footer de los modales que las emiten. Las notas
 * van a una sola alícuota (21%, o 0 en comprobante C — ver `alicuotaPara()` en
 * facturacion.ts), así que alcanza el total: no hacen falta los ítems.
 *
 * Lo usan los cuatro caminos de emisión (Nueva NC/ND del header, el botón de la
 * fila, la NC interna y la anulación en lote) para que muestren lo mismo que la
 * factura. En club Monotributo el importe entero va a Neto, igual que en el
 * server (ver `desglosarItemsUi`).
 */
function DesgloseNota({
  total,
  tipoFactura,
  esNc,
  esMonotributo,
}: {
  total: number;
  tipoFactura: string | null;
  esNc: boolean;
  esMonotributo?: boolean;
}) {
  if (!(total > 0)) return null;
  const d = desglosarItemsUi(
    [{ bruto: total, alicuotaIva: null }],
    tipoFactura === 'factura_c' ? 0 : 21,
    esMonotributo,
  );
  return (
    <DesgloseImportes
      neto={d.neto}
      exento={d.exento}
      iva={d.iva}
      bruto={total}
      brutoLabel={`Importe bruto (total ${esNc ? 'a acreditar' : 'a debitar'})`}
    />
  );
}

const fmtDate = formatArgentinaDate;

// Detalle del socio en UNA línea para los buscadores de comprobantes:
// nº de socio, razón social, CUIT/DNI, dirección y embarcaciones.
function detalleSocioRenglon(s: Socio): string {
  const doc = s.cuit?.trim()
    ? `CUIT ${s.cuit}`
    : s.numeroDocumento
      ? `${s.tipoDocumento?.toUpperCase() ?? 'DNI'} ${s.numeroDocumento}`
      : null;
  return [
    s.numeroSocio != null ? `#${s.numeroSocio}` : null,
    s.razonSocial?.trim() && s.razonSocial.trim() !== s.nombre ? s.razonSocial.trim() : null,
    doc,
    s.direccion?.trim() || null,
    s.embarcaciones.length > 0 ? s.embarcaciones.join(', ') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Etiqueta secundaria de una fila de la lista de emisión: los ítems
// computados desde contratos vigentes se describen por su origen; los cargos
// legacy de cuenta corriente muestran su fecha, como siempre.
function etiquetaPendiente(m: PendienteEmision): string {
  if (!m.itemKey) return `En cuenta corriente${m.fecha ? ` · ${fmtDate(m.fecha)}` : ''}`;
  if (m.origen === 'baja') return 'Cobro por baja anticipada';
  if (m.esVariable) return 'Servicio variable';
  if (m.esProporcional) return 'Proporcional del mes';
  return 'Servicio contratado';
}

// Formatea una fecha-calendario "YYYY-MM-DD" (columna `date`, sin hora) como
// "DD/MM/YYYY" sin pasar por new Date()/TZ — evita el corrimiento de un día
// que daría tratarla como timestamp UTC.
function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

const TZ_AR = 'America/Argentina/Buenos_Aires';

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ_AR }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  return todayIso().slice(0, 7) + '-01';
}

function lastOfMonthIso(): string {
  const [y, m] = todayIso().split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-2xl font-bold" style={{ color: '#101828' }}>
        {value}
      </p>
      <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
        {label}
      </p>
    </div>
  );
}

// ─── Combobox: buscar socio ─────────────────────────────────────────────────

function SocioCombobox({
  socios,
  value,
  onChange,
}: {
  socios: Socio[];
  value: string;
  onChange: (socioId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const seleccionado = socios.find((s) => s.id === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtrados = useMemo(() => buscarSocios(socios, query), [socios, query]);

  function select(socioId: string) {
    onChange(socioId);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        className={`${inputCls} pl-9`}
        placeholder="Buscar por nombre, razón social, CUIT/DNI, Nº de socio, dirección o embarcación..."
        value={open ? query : (seleccionado?.nombre ?? '')}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-[10px] border border-gray-200 bg-white shadow-lg">
          {filtrados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">Sin resultados</p>
          ) : (
            filtrados.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => select(s.id)}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <span className="shrink-0 font-medium" style={{ color: '#101828' }}>
                  {s.nombre}
                </span>
                <span className="truncate text-xs text-gray-400">{detalleSocioRenglon(s)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal: Nuevo comprobante ───────────────────────────────────────────────

function NuevaFacturaModal({
  open,
  onClose,
  socios,
  guarderiaCondicionIva,
  facturas,
  centrosEmisores,
}: {
  open: boolean;
  onClose: () => void;
  socios: Socio[];
  guarderiaCondicionIva: string | null;
  facturas: Factura[];
  centrosEmisores: CentroEmisorOpt[];
}) {
  const router = useRouter();
  // Centro emisor (punto de venta) por el que sale el comprobante. Con un
  // solo centro el dropdown ni se muestra y todo sale por el principal.
  const centroPrincipalId =
    centrosEmisores.find((c) => c.esPrincipal)?.id ?? centrosEmisores[0]?.id ?? '';
  const [centroEmisorId, setCentroEmisorId] = useState(centroPrincipalId);
  // Notas de crédito/débito integradas al mismo modal: si el Tipo de
  // comprobante elegido es NC/ND, el formulario cambia al de la nota
  // (relacionada a un comprobante emitido, o libre sin comprobante de origen).
  const [modoNota, setModoNota] = useState<{ esNc: boolean } | null>(null);
  const [notaRelacionada, setNotaRelacionada] = useState(true);
  const [notaFacturaId, setNotaFacturaId] = useState('');
  const [notaMotivo, setNotaMotivo] = useState<MotivoNota>('bonificacion');
  const [notaImporte, setNotaImporte] = useState('');
  // Solo para NC/ND "sin comprobante de origen": fecha de emisión y período
  // asociado — ARCA exige que toda nota referencie un comprobante o un rango
  // de fechas; sin origen puntual, va el rango (default: últimos 30 días).
  const [notaFecha, setNotaFecha] = useState(todayIso());
  const [notaVencimiento, setNotaVencimiento] = useState(addDays(todayIso(), 30));
  const [notaPeriodoDesde, setNotaPeriodoDesde] = useState(addDays(todayIso(), -30));
  const [notaPeriodoHasta, setNotaPeriodoHasta] = useState(todayIso());
  const [notaResult, setNotaResult] = useState<{
    comprobanteNro?: string;
    folioLocal?: string;
    pdfUrl?: string;
  } | null>(null);
  const [form, setForm] = useState({
    socioId: '',
    tipoFactura: 'factura_c',
    condicionVenta: 'contado',
    medioPago: 'efectivo',
    estado: 'pendiente',
    descripcion: '',
    fecha: todayIso(),
    vencimiento: addDays(todayIso(), 30),
    desde: firstOfMonthIso(),
    hasta: lastOfMonthIso(),
  });
  const [movimientos, setMovimientos] = useState<PendienteEmision[]>([]);
  const [selectedMovs, setSelectedMovs] = useState<Set<string>>(() => new Set());
  const [loadingMovs, setLoadingMovs] = useState(false);
  // Adelantar la cuota Fija del mes que viene (acción opt-in del club).
  const [adelantarSig, setAdelantarSig] = useState(false);
  // true apenas el admin toca el campo Vencimiento a mano: a partir de ahí
  // dejamos de pisarlo con el sugerido por tarifario.
  const [vencEditado, setVencEditado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const clubMonotributo = guarderiaCondicionIva === 'monotributo';

  // Trae los pendientes del socio. Los ítems de adelanto (mes siguiente)
  // llegan sin tildar: el club los marca a mano si quiere cobrarlos ahora.
  function cargarPendientes(socioId: string, adelantar: boolean) {
    setLoadingMovs(true);
    getPendientesEmisionAction(socioId, 'fiscal', adelantar)
      .then((res) => {
        if (res.error) {
          setError(res.error);
        } else {
          const movs = res.pendientes ?? [];
          setMovimientos(movs);
          setSelectedMovs(new Set(movs.filter((m) => !m.esAdelanto).map((m) => m.id)));
        }
      })
      .finally(() => setLoadingMovs(false));
  }

  function handleSocioChange(socioId: string) {
    const socio = socios.find((s) => s.id === socioId);
    const tipoFactura = derivarTipoFactura(
      guarderiaCondicionIva,
      socio ? condicionIvaEfectiva(socio) : null,
    );
    setForm((f) => ({ ...f, socioId, tipoFactura }));
    setMovimientos([]);
    setSelectedMovs(new Set());
    setAdelantarSig(false);
    setVencEditado(false);
    setNotaFacturaId('');
    setError(null);
    if (!socioId) return;
    cargarPendientes(socioId, false);
  }

  function handleToggleAdelantar() {
    const next = !adelantarSig;
    setAdelantarSig(next);
    if (form.socioId) cargarPendientes(form.socioId, next);
  }

  const totalSeleccionado = useMemo(
    () =>
      movimientos
        .filter((m) => selectedMovs.has(m.id))
        .reduce((s, m) => s + parseFloat(m.debe || '0'), 0),
    [movimientos, selectedMovs],
  );
  // Desglose Neto/Exento/IVA con la alícuota real de cada tarifa (fallback
  // según la letra: C → 0, resto 21 — mismo criterio que desglosarMontos en
  // facturacion.ts, así el modal anticipa lo que va a mostrar el listado).
  const desgloseSeleccionado = useMemo(
    () =>
      desglosarItemsUi(
        movimientos
          .filter((m) => selectedMovs.has(m.id))
          .map((m) => ({ bruto: parseFloat(m.debe || '0'), alicuotaIva: m.alicuotaIva })),
        form.tipoFactura === 'factura_c' ? 0 : 21,
        clubMonotributo,
      ),
    [movimientos, selectedMovs, form.tipoFactura, clubMonotributo],
  );

  // Vencimiento sugerido "según tarifario": fecha de emisión + el menor Plazo
  // de cobro de los servicios seleccionados (si difieren, rige el que vence
  // primero — mismo criterio que la Cuenta Corriente). Sin plazos: +30 días,
  // el default histórico. Se aplica hasta que el admin edite el campo a mano.
  const vencimientoSugerido = useMemo(() => {
    const plazos = movimientos
      .filter((m) => selectedMovs.has(m.id) && m.plazoPagoDias != null)
      .map((m) => m.plazoPagoDias!);
    return addDays(form.fecha, plazos.length > 0 ? Math.min(...plazos) : 30);
  }, [movimientos, selectedMovs, form.fecha]);
  const vencimientoEfectivo = vencEditado ? form.vencimiento : vencimientoSugerido;

  // ── Derivados del modo nota ──
  // Total ya acreditado por NC (no rechazadas) sobre cada comprobante: entre
  // todas las NC de una factura no se puede acreditar más que su total.
  const acreditadoNcPorFactura = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of facturas) {
      if (!f.facturaOriginalId || f.rechazada) continue;
      if (!f.tipoFactura?.startsWith('nota_credito')) continue;
      map.set(
        f.facturaOriginalId,
        (map.get(f.facturaOriginalId) ?? 0) + parseFloat(f.importe ?? '0'),
      );
    }
    return map;
  }, [facturas]);
  // Elegibles para NC/ND relacionada: mismas condiciones que el botón de la
  // fila de la tabla (factura fiscal A/B/C con CAE), del socio elegido. Para
  // NC se excluyen las ya acreditadas por completo.
  const facturasDelSocio = useMemo(
    () =>
      form.socioId
        ? facturas.filter(
            (f) =>
              f.socioId === form.socioId &&
              (f.tipoFactura === 'factura_a' ||
                f.tipoFactura === 'factura_b' ||
                f.tipoFactura === 'factura_c') &&
              f.cae &&
              (!modoNota?.esNc ||
                parseFloat(f.importe ?? '0') - (acreditadoNcPorFactura.get(f.id) ?? 0) > 0.001),
          )
        : [],
    [facturas, form.socioId, modoNota, acreditadoNcPorFactura],
  );
  const notaFacturaSel = facturasDelSocio.find((f) => f.id === notaFacturaId) ?? null;
  const notaAcreditadoSel = notaFacturaSel
    ? (acreditadoNcPorFactura.get(notaFacturaSel.id) ?? 0)
    : 0;
  const notaDisponibleSel = notaFacturaSel
    ? Math.max(0, parseFloat(notaFacturaSel.importe ?? '0') - notaAcreditadoSel)
    : 0;
  // "Anulación total" solo tiene sentido para NC relacionada a un comprobante
  // que todavía no tenga NC parciales (si las tiene, el total ya no se puede
  // acreditar entero — queda solo el camino parcial por lo disponible).
  const notaMotivoOpts = useMemo(
    () =>
      modoNota && modoNota.esNc && notaRelacionada && notaAcreditadoSel <= 0.001
        ? MOTIVO_OPTS
        : MOTIVO_OPTS.filter((o) => o.value !== 'anulacion_total'),
    [modoNota, notaRelacionada, notaAcreditadoSel],
  );
  // Si el motivo guardado quedó en "anulación total" pero la factura elegida
  // ya tiene NC parciales, cae a parcial (derivado, sin efecto).
  const notaMotivoEf: MotivoNota =
    notaMotivo === 'anulacion_total' && notaAcreditadoSel > 0.001
      ? 'descuento_parcial'
      : notaMotivo;
  const notaNeedsImporte = !(
    modoNota?.esNc &&
    notaRelacionada &&
    notaMotivoEf === 'anulacion_total'
  );
  const notaImporteNum = parseFloat(notaImporte.replace(',', '.'));

  const isValid = modoNota
    ? Boolean(
        form.socioId &&
        (!notaRelacionada || notaFacturaId) &&
        (notaRelacionada || (notaFecha && notaPeriodoDesde && notaPeriodoHasta)) &&
        (!notaNeedsImporte || notaImporteNum > 0),
      )
    : Boolean(
        form.socioId &&
        form.fecha &&
        vencimientoEfectivo &&
        form.desde &&
        form.hasta &&
        selectedMovs.size > 0 &&
        totalSeleccionado > 0,
      );

  const socioSeleccionado = useMemo(
    () => socios.find((s) => s.id === form.socioId),
    [socios, form.socioId],
  );

  const set =
    <K extends keyof typeof form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function toggleMov(id: string) {
    setSelectedMovs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllMovs() {
    if (selectedMovs.size === movimientos.length) {
      setSelectedMovs(new Set());
    } else {
      setSelectedMovs(new Set(movimientos.map((m) => m.id)));
    }
  }

  function handleClose() {
    setForm((f) => ({ ...f, socioId: '' }));
    setMovimientos([]);
    setSelectedMovs(new Set());
    setVencEditado(false);
    setCentroEmisorId(centroPrincipalId);
    setModoNota(null);
    setNotaRelacionada(true);
    setNotaFacturaId('');
    setNotaMotivo('bonificacion');
    setNotaImporte('');
    setNotaFecha(todayIso());
    setNotaVencimiento(addDays(todayIso(), 30));
    setNotaPeriodoDesde(addDays(todayIso(), -30));
    setNotaPeriodoHasta(todayIso());
    setNotaResult(null);
    setError(null);
    setSuccess(null);
    onClose();
  }

  function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (modoNota) {
      const esNc = modoNota.esNc;
      const importeNum = notaNeedsImporte ? notaImporteNum : undefined;
      startTransition(async () => {
        const res = notaRelacionada
          ? await emitirNotaAsociadaAction({
              facturaOriginalId: notaFacturaId,
              esNc,
              motivo: notaMotivoEf,
              importe: importeNum,
              descripcion: form.descripcion || undefined,
            })
          : await emitirNotaLibreAction({
              socioId: form.socioId,
              esNc,
              motivo: notaMotivoEf,
              importe: importeNum!,
              descripcion: form.descripcion || undefined,
              centroEmisorId: centroEmisorId || undefined,
              fecha: notaFecha,
              vencimiento: notaVencimiento || undefined,
              condicionVenta: form.condicionVenta as never,
              periodoDesde: notaPeriodoDesde,
              periodoHasta: notaPeriodoHasta,
            });
        if (res.error) {
          setError(res.error);
        } else {
          setNotaResult({
            comprobanteNro: res.comprobanteNro,
            folioLocal: res.folioLocal,
            pdfUrl: res.pdfUrl,
          });
          router.refresh();
        }
      });
      return;
    }
    startTransition(async () => {
      const seleccion = movimientos.filter((m) => selectedMovs.has(m.id));
      const res = await createInvoiceAction({
        socioId: form.socioId,
        tipoFactura: form.tipoFactura as never,
        condicionVenta: form.condicionVenta as never,
        medioPago: form.medioPago as never,
        estado: form.estado as never,
        descripcion: form.descripcion,
        fecha: form.fecha,
        vencimiento: vencimientoEfectivo,
        desde: form.desde,
        hasta: form.hasta,
        itemKeys: seleccion.filter((m) => m.itemKey).map((m) => m.itemKey!),
        movimientoIds: seleccion.filter((m) => !m.itemKey).map((m) => m.id),
        centroEmisorId: centroEmisorId || undefined,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(
          `Comprobante emitido ${res.comprobanteNro ?? ''}${res.folioLocal ? ` · ${res.folioLocal}` : ''}`,
        );
        setTimeout(() => {
          handleClose();
          router.refresh();
        }, 1200);
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Nuevo comprobante
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Emití un comprobante tomando los movimientos pendientes del socio
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        {notaResult ? (
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-3 rounded-[10px] bg-teal-50 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" />
              <div>
                <p className="font-semibold text-teal-900">
                  {modoNota?.esNc ? 'NC' : 'ND'} emitida correctamente
                </p>
                {notaResult.comprobanteNro && (
                  <p className="text-sm text-teal-700">Nro: {notaResult.comprobanteNro}</p>
                )}
                {notaResult.folioLocal && (
                  <p className="text-sm text-teal-700">{notaResult.folioLocal}</p>
                )}
              </div>
            </div>
            {notaResult.pdfUrl && (
              <a
                href={notaResult.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-4 w-4" />
                Descargar PDF
              </a>
            )}
            <button
              onClick={handleClose}
              className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#175861' }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Socio*
                  </label>
                  <SocioCombobox
                    socios={socios}
                    value={form.socioId}
                    onChange={handleSocioChange}
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Número documento (DNI / CUIT / CUIL)
                  </label>
                  <input
                    className={`${inputCls} cursor-not-allowed bg-gray-50 text-gray-500`}
                    value={socioSeleccionado ? numeroDocumentoEfectivo(socioSeleccionado) : ''}
                    placeholder="Se completa al elegir socio"
                    readOnly
                  />
                </div>
              </div>

              {!modoNota && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold"
                      style={{ color: '#101828' }}
                    >
                      Fecha de comprobante*
                    </label>
                    <input
                      type="date"
                      className={inputCls}
                      value={form.fecha}
                      onChange={set('fecha')}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold"
                      style={{ color: '#101828' }}
                    >
                      Vencimiento*{' '}
                      <span className="font-normal text-gray-400">(según tarifario)</span>
                    </label>
                    <input
                      type="date"
                      className={inputCls}
                      value={vencimientoEfectivo}
                      onChange={(e) => {
                        setVencEditado(true);
                        setForm((f) => ({ ...f, vencimiento: e.target.value }));
                      }}
                    />
                  </div>
                </div>
              )}

              {!modoNota && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold" style={{ color: '#101828' }}>
                    Período facturado{' '}
                    <span className="font-normal text-gray-400">
                      (a qué rango de fechas corresponde el servicio — se informa a ARCA)
                    </span>
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                        Desde*
                      </label>
                      <input
                        type="date"
                        className={inputCls}
                        value={form.desde}
                        onChange={set('desde')}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                        Hasta*
                      </label>
                      <input
                        type="date"
                        className={inputCls}
                        value={form.hasta}
                        onChange={set('hasta')}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* NC/ND sin comprobante de origen: fecha de emisión propia,
              mismo formato que la factura. */}
              {modoNota && !notaRelacionada && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold"
                      style={{ color: '#101828' }}
                    >
                      Fecha de comprobante*
                    </label>
                    <input
                      type="date"
                      className={inputCls}
                      value={notaFecha}
                      onChange={(e) => setNotaFecha(e.target.value)}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold"
                      style={{ color: '#101828' }}
                    >
                      Vencimiento*
                    </label>
                    <input
                      type="date"
                      className={inputCls}
                      value={notaVencimiento}
                      onChange={(e) => setNotaVencimiento(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* NC/ND sin comprobante de origen: ARCA exige asociar la nota a
              comprobantes o a un período — acá va el período. */}
              {modoNota && !notaRelacionada && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold" style={{ color: '#101828' }}>
                    Período asociado{' '}
                    <span className="font-normal text-gray-400">
                      (rango de fechas al que corresponde la nota — se informa a ARCA en lugar de un
                      comprobante puntual)
                    </span>
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                        Desde*
                      </label>
                      <input
                        type="date"
                        className={inputCls}
                        value={notaPeriodoDesde}
                        onChange={(e) => setNotaPeriodoDesde(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                        Hasta*
                      </label>
                      <input
                        type="date"
                        className={inputCls}
                        value={notaPeriodoHasta}
                        onChange={(e) => setNotaPeriodoHasta(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Centro emisor, en su propia línea arriba de Tipo/Condición.
              Se muestra siempre (con un solo POS queda como única opción —
              pedido 2026-08-03). Para NC/ND relacionadas no se elige — salen
              por el mismo POS que el comprobante original. */}
              {centrosEmisores.length > 0 && (!modoNota || !notaRelacionada) && (
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Centro emisor
                  </label>
                  <select
                    className={inputCls}
                    value={centroEmisorId}
                    onChange={(e) => setCentroEmisorId(e.target.value)}
                  >
                    {centrosEmisores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} — N.º {c.puntoDeVenta}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Tipo de comprobante
                  </label>
                  {/* Elegible entre los tipos válidos según la condición IVA del
                  club; al elegir socio se preselecciona el sugerido según la
                  condición del socio. NC/ND cambian el formulario al de la
                  nota (relacionada o sin comprobante de origen). */}
                  <select
                    className={inputCls}
                    value={
                      modoNota ? (modoNota.esNc ? 'nota_credito' : 'nota_debito') : form.tipoFactura
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      setError(null);
                      if (v === 'nota_credito' || v === 'nota_debito') {
                        const esNc = v === 'nota_credito';
                        setModoNota({ esNc });
                        setNotaMotivo(esNc && notaRelacionada ? 'anulacion_total' : 'bonificacion');
                        setNotaImporte('');
                      } else {
                        setModoNota(null);
                        setForm((f) => ({ ...f, tipoFactura: v }));
                      }
                    }}
                  >
                    {tiposFacturaEmisibles(
                      guarderiaCondicionIva,
                      socioSeleccionado ? condicionIvaEfectiva(socioSeleccionado) : null,
                    ).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                    {(() => {
                      // Misma letra que va a llevar la nota (ver tipoNota en el
                      // desglose): relacionada → la de la factura elegida;
                      // libre → la sugerida según el socio/club.
                      const tipoNotaBase = notaRelacionada
                        ? (notaFacturaSel?.tipoFactura ?? form.tipoFactura)
                        : form.tipoFactura;
                      const letra = tipoNotaBase?.split('_').pop()?.toUpperCase();
                      const suf = letra && letra.length === 1 ? ` ${letra}` : '';
                      return (
                        <>
                          <option value="nota_credito">{`Nota de crédito${suf}`}</option>
                          <option value="nota_debito">{`Nota de débito${suf}`}</option>
                        </>
                      );
                    })()}
                  </select>
                </div>
                {/* También para NC/ND sin comprobante de origen (mismo
                formato que la factura manual). Con nota relacionada no se
                elige: sale con la condición del comprobante original. */}
                {(!modoNota || !notaRelacionada) && (
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold"
                      style={{ color: '#101828' }}
                    >
                      Condición de venta*
                    </label>
                    <select
                      className={inputCls}
                      value={form.condicionVenta}
                      onChange={set('condicionVenta')}
                    >
                      {CONDICION_VENTA_OPTS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Checklist de movimientos pendientes */}
              {form.socioId && !modoNota && (
                <div className="rounded-[10px] border border-gray-100 bg-white">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                        Servicios a facturar
                      </p>
                      <p className="text-xs text-gray-400">
                        {loadingMovs
                          ? 'Cargando...'
                          : `${selectedMovs.size} de ${movimientos.length} seleccionados — Total ${fmtMoney(totalSeleccionado)}`}
                      </p>
                    </div>
                    {movimientos.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAllMovs}
                        className="text-xs font-medium underline underline-offset-2"
                        style={{ color: '#175861' }}
                      >
                        {selectedMovs.size === movimientos.length ? 'Ninguno' : 'Todos'}
                      </button>
                    )}
                  </div>
                  {loadingMovs ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-400">
                      Cargando movimientos...
                    </p>
                  ) : movimientos.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-400">
                      Este socio no tiene servicios pendientes de facturar.
                    </p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto">
                      {movimientos.map((m) => (
                        <label
                          key={m.id}
                          className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-4 py-2.5 text-sm last:border-0 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                            checked={selectedMovs.has(m.id)}
                            onChange={() => toggleMov(m.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium" style={{ color: '#101828' }}>
                              {m.concepto ?? 'Servicio'}
                              {m.esAdelanto && (
                                <span className="ml-2 rounded-full bg-[#EFF8F7] px-2 py-0.5 text-[10px] font-semibold text-[#175861]">
                                  Adelanto
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400">{etiquetaPendiente(m)}</p>
                          </div>
                          <p className="text-sm font-medium" style={{ color: '#175861' }}>
                            {fmtMoney(m.debe)}
                          </p>
                        </label>
                      ))}
                    </div>
                  )}
                  {/* Adelantar la cuota Fija del mes que viene (opt-in). */}
                  <label className="flex cursor-pointer items-center gap-3 border-t border-gray-100 px-4 py-3 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                      checked={adelantarSig}
                      onChange={handleToggleAdelantar}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium" style={{ color: '#101828' }}>
                        Adelantar la cuota del mes que viene
                      </p>
                      <p className="text-xs text-gray-400">
                        Suma la cuota Fija del mes siguiente (mes completo). Marcá cuáles cobrar en
                        la lista.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {modoNota && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNotaRelacionada(true);
                        if (modoNota.esNc) setNotaMotivo('anulacion_total');
                      }}
                      className={`rounded-[10px] border px-3 py-2.5 text-sm font-medium transition ${
                        notaRelacionada
                          ? 'border-[#175861] bg-[#EFF8F7] text-[#175861]'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Sobre un comprobante emitido
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNotaRelacionada(false);
                        if (notaMotivo === 'anulacion_total') setNotaMotivo('bonificacion');
                      }}
                      className={`rounded-[10px] border px-3 py-2.5 text-sm font-medium transition ${
                        !notaRelacionada
                          ? 'border-[#175861] bg-[#EFF8F7] text-[#175861]'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Sin comprobante de origen
                    </button>
                  </div>

                  {notaRelacionada && (
                    <div className="rounded-[10px] border border-gray-100 bg-white">
                      <div className="border-b border-gray-100 px-4 py-3">
                        <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                          Comprobante al que aplica
                        </p>
                        <p className="text-xs text-gray-400">
                          Facturas fiscales emitidas del socio (con CAE)
                        </p>
                      </div>
                      {!form.socioId ? (
                        <p className="px-4 py-6 text-center text-sm text-gray-400">
                          Elegí un socio para ver sus comprobantes.
                        </p>
                      ) : facturasDelSocio.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-gray-400">
                          Este socio no tiene facturas fiscales emitidas.
                        </p>
                      ) : (
                        <div className="max-h-48 overflow-y-auto">
                          {facturasDelSocio.map((f) => (
                            <label
                              key={f.id}
                              className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-4 py-2.5 text-sm last:border-0 hover:bg-gray-50"
                            >
                              <input
                                type="radio"
                                name="nota-factura-original"
                                className="h-4 w-4 cursor-pointer accent-[#175861]"
                                checked={notaFacturaId === f.id}
                                onChange={() => setNotaFacturaId(f.id)}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium" style={{ color: '#101828' }}>
                                  {tipoComprobanteLabel(f)} {f.codigo}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {f.emision ? fmtDate(f.emision) : ''}
                                </p>
                              </div>
                              <p className="text-sm font-medium" style={{ color: '#175861' }}>
                                {fmtMoney(f.importe)}
                              </p>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold"
                      style={{ color: '#101828' }}
                    >
                      Motivo
                    </label>
                    <select
                      className={inputCls}
                      value={notaMotivoEf}
                      onChange={(e) => {
                        setNotaMotivo(e.target.value as MotivoNota);
                        setNotaImporte('');
                      }}
                    >
                      {notaMotivoOpts.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {notaNeedsImporte && (
                    <div>
                      <label
                        className="mb-1.5 block text-xs font-semibold"
                        style={{ color: '#101828' }}
                      >
                        Importe {modoNota.esNc ? 'a acreditar' : 'a debitar'}
                        {notaRelacionada && notaFacturaSel && (
                          <span className="ml-1 font-normal text-gray-400">
                            {modoNota.esNc && notaAcreditadoSel > 0.001
                              ? `(disponible ${fmtMoney(notaDisponibleSel)} de ${fmtMoney(notaFacturaSel.importe)} — ya acreditado ${fmtMoney(notaAcreditadoSel)})`
                              : `(máx. ${fmtMoney(modoNota.esNc ? notaDisponibleSel : parseFloat(notaFacturaSel.importe ?? '0'))})`}
                          </span>
                        )}
                      </label>
                      <input
                        className={inputCls}
                        inputMode="decimal"
                        placeholder="0,00"
                        value={notaImporte}
                        onChange={(e) => setNotaImporte(e.target.value)}
                      />
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Descripción <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  className={inputCls}
                  placeholder={
                    modoNota ? 'Se auto-genera si se deja vacío' : 'Detalle del comprobante'
                  }
                  value={form.descripcion}
                  onChange={set('descripcion')}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="flex items-start gap-2 rounded-[10px] bg-green-50 p-3 text-sm text-green-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{success}</span>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 p-6">
              {/* Desglose completo neto/exento/IVA/bruto (pedido 2026-08-03).
              En Monotributo las tres líneas van igual, con el importe en Neto y
              Exento/IVA en $0 (aclaración del cliente 2026-08-10). */}
              {!modoNota && form.socioId && selectedMovs.size > 0 && (
                <DesgloseImportes
                  neto={desgloseSeleccionado.neto}
                  exento={desgloseSeleccionado.exento}
                  iva={desgloseSeleccionado.iva}
                  bruto={totalSeleccionado}
                  brutoLabel="Importe bruto (total a emitir)"
                />
              )}
              {/* Mismo desglose para NC/ND (ver DesgloseNota). */}
              {modoNota && (
                <DesgloseNota
                  total={
                    notaNeedsImporte
                      ? Number.isFinite(notaImporteNum)
                        ? notaImporteNum
                        : 0
                      : parseFloat(notaFacturaSel?.importe ?? '0')
                  }
                  tipoFactura={
                    notaRelacionada
                      ? (notaFacturaSel?.tipoFactura ?? form.tipoFactura)
                      : form.tipoFactura
                  }
                  esNc={modoNota.esNc}
                  esMonotributo={clubMonotributo}
                />
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isPending || !isValid}
                  className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: '#175861' }}
                >
                  {isPending
                    ? 'Emitiendo...'
                    : modoNota
                      ? `Emitir ${modoNota.esNc ? 'NC' : 'ND'}`
                      : 'Emitir comprobante'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modal: Comprobante interno manual ─────────────────────────────────────

function ComprobanteInternoManualModal({
  open,
  onClose,
  socios,
}: {
  open: boolean;
  onClose: () => void;
  socios: Socio[];
}) {
  const router = useRouter();
  // Mismo flujo por pasos que "Nueva cobranza": primero elegir el socio en una
  // lista amplia con buscador, después la fecha y los cargos a consolidar.
  const [step, setStep] = useState<'socio' | 'detalle'>('socio');
  const [query, setQuery] = useState('');
  const [socioId, setSocioId] = useState('');
  const [fecha, setFecha] = useState(todayIso);
  const [movimientos, setMovimientos] = useState<PendienteEmision[]>([]);
  const [selectedMovs, setSelectedMovs] = useState<Set<string>>(() => new Set());
  const [loadingMovs, setLoadingMovs] = useState(false);
  const [adelantarSig, setAdelantarSig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const socioNombre = useMemo(
    () => socios.find((s) => s.id === socioId)?.nombre ?? '',
    [socios, socioId],
  );

  const sociosFiltrados = useMemo(() => buscarSocios(socios, query).slice(0, 50), [socios, query]);

  // Los ítems de adelanto (mes siguiente) llegan sin tildar: el club elige.
  function cargarPendientes(id: string, adelantar: boolean) {
    setLoadingMovs(true);
    getPendientesEmisionAction(id, 'interno', adelantar)
      .then((res) => {
        if (res.error) {
          setError(res.error);
        } else {
          const movs = res.pendientes ?? [];
          setMovimientos(movs);
          setSelectedMovs(new Set(movs.filter((m) => !m.esAdelanto).map((m) => m.id)));
        }
      })
      .finally(() => setLoadingMovs(false));
  }

  function handleSelectSocio(id: string) {
    setSocioId(id);
    setMovimientos([]);
    setSelectedMovs(new Set());
    setAdelantarSig(false);
    setError(null);
    setStep('detalle');
    cargarPendientes(id, false);
  }

  function handleToggleAdelantar() {
    const next = !adelantarSig;
    setAdelantarSig(next);
    if (socioId) cargarPendientes(socioId, next);
  }

  function volverASocio() {
    setStep('socio');
    setSocioId('');
    setMovimientos([]);
    setSelectedMovs(new Set());
    setAdelantarSig(false);
    setError(null);
  }

  const totalSeleccionado = useMemo(
    () =>
      movimientos
        .filter((m) => selectedMovs.has(m.id))
        .reduce((s, m) => s + parseFloat(m.debe || '0'), 0),
    [movimientos, selectedMovs],
  );

  const isValid = Boolean(socioId && fecha && selectedMovs.size > 0 && totalSeleccionado > 0);

  function toggleMov(id: string) {
    setSelectedMovs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllMovs() {
    if (selectedMovs.size === movimientos.length) {
      setSelectedMovs(new Set());
    } else {
      setSelectedMovs(new Set(movimientos.map((m) => m.id)));
    }
  }

  function handleClose() {
    setStep('socio');
    setQuery('');
    setSocioId('');
    setFecha(todayIso());
    setMovimientos([]);
    setSelectedMovs(new Set());
    setError(null);
    setSuccess(null);
    onClose();
  }

  function handleSubmit() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const seleccion = movimientos.filter((m) => selectedMovs.has(m.id));
      const res = await crearComprobanteInternoAction({
        socioId,
        fecha,
        itemKeys: seleccion.filter((m) => m.itemKey).map((m) => m.itemKey!),
        movimientoIds: seleccion.filter((m) => !m.itemKey).map((m) => m.id),
      });
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(`Comprobante emitido ${res.codigo ?? ''}`);
        setTimeout(() => {
          handleClose();
          router.refresh();
        }, 1200);
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Comprobante interno manual
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {step === 'socio'
                ? 'Elegí el socio para consolidar sus cargos Interno pendientes'
                : `Socio: ${socioNombre}`}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {/* Paso 1: elegir socio — mismo diseño que "Nueva cobranza". */}
          {step === 'socio' && (
            <>
              <div className="relative">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  className={`${inputCls} pl-9`}
                  placeholder="Buscar por nombre, razón social, CUIT/DNI, Nº de socio, dirección o embarcación…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto rounded-[10px] border border-gray-200">
                {sociosFiltrados.length === 0 ? (
                  <p className="p-4 text-center text-sm text-gray-400">Sin resultados.</p>
                ) : (
                  sociosFiltrados.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectSocio(s.id)}
                      className="flex w-full items-baseline gap-2 px-4 py-3 text-left transition hover:bg-gray-50"
                    >
                      <span className="shrink-0 text-sm font-medium text-[#101828]">
                        {s.nombre}
                      </span>
                      <span className="truncate text-xs text-gray-400">
                        {detalleSocioRenglon(s)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {step === 'detalle' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Fecha*
              </label>
              <input
                type="date"
                className={inputCls}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
          )}

          {step === 'detalle' && socioId && (
            <div className="rounded-[10px] border border-gray-100 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                    Servicios internos a emitir
                  </p>
                  <p className="text-xs text-gray-400">
                    {loadingMovs
                      ? 'Cargando...'
                      : `${selectedMovs.size} de ${movimientos.length} seleccionados — Total ${fmtMoney(totalSeleccionado)}`}
                  </p>
                </div>
                {movimientos.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAllMovs}
                    className="text-xs font-medium underline underline-offset-2"
                    style={{ color: '#175861' }}
                  >
                    {selectedMovs.size === movimientos.length ? 'Ninguno' : 'Todos'}
                  </button>
                )}
              </div>
              {loadingMovs ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  Cargando movimientos...
                </p>
              ) : movimientos.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  Este socio no tiene servicios internos pendientes de emitir.
                </p>
              ) : (
                <div className="max-h-60 overflow-y-auto">
                  {movimientos.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-4 py-2.5 text-sm last:border-0 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                        checked={selectedMovs.has(m.id)}
                        onChange={() => toggleMov(m.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium" style={{ color: '#101828' }}>
                          {m.concepto ?? 'Servicio'}
                          {m.esAdelanto && (
                            <span className="ml-2 rounded-full bg-[#EFF8F7] px-2 py-0.5 text-[10px] font-semibold text-[#175861]">
                              Adelanto
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">{etiquetaPendiente(m)}</p>
                      </div>
                      <p className="text-sm font-medium" style={{ color: '#175861' }}>
                        {fmtMoney(m.debe)}
                      </p>
                    </label>
                  ))}
                </div>
              )}
              {/* Adelantar la cuota Fija del mes que viene (opt-in). */}
              <label className="flex cursor-pointer items-center gap-3 border-t border-gray-100 px-4 py-3 text-sm hover:bg-gray-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                  checked={adelantarSig}
                  onChange={handleToggleAdelantar}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium" style={{ color: '#101828' }}>
                    Adelantar la cuota del mes que viene
                  </p>
                  <p className="text-xs text-gray-400">
                    Suma la cuota Fija del mes siguiente (mes completo). Marcá cuáles cobrar en la
                    lista.
                  </p>
                </div>
              </label>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-[10px] bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 rounded-[10px] bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 p-6">
          {step === 'detalle' && socioId && selectedMovs.size > 0 && (
            <div className="mb-4 flex items-center justify-between rounded-[10px] bg-gray-50 px-4 py-3">
              <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                Total a emitir
              </p>
              <p className="text-lg font-bold" style={{ color: '#175861' }}>
                {fmtMoney(totalSeleccionado)}
              </p>
            </div>
          )}
          <div className="flex gap-3">
            {step === 'socio' ? (
              <button
                onClick={handleClose}
                className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
              >
                Cancelar
              </button>
            ) : (
              <>
                <button
                  onClick={volverASocio}
                  className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
                >
                  Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isPending || !isValid}
                  className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: '#175861' }}
                >
                  {isPending ? 'Emitiendo...' : 'Emitir comprobante'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Factura en lote ─────────────────────────────────────────────────

const CONCEPTO_OPTS: { value: string; label: string }[] = [
  { value: 'espacio_guarda', label: 'Espacio de guarda' },
  { value: 'cuota_social', label: 'Cuota social' },
  { value: 'membresia', label: 'Membresía' },
  { value: 'expensas_ordinarias', label: 'Expensas ordinarias' },
  { value: 'expensas_extraordinarias', label: 'Expensas extraordinarias' },
  { value: 'servicio_extra', label: 'Servicios extra' },
];

function LoteModal({
  open,
  onClose,
  socios,
  guarderiaCondicionIva,
}: {
  open: boolean;
  onClose: () => void;
  socios: Socio[];
  guarderiaCondicionIva: string | null;
}) {
  const router = useRouter();

  const [form, setForm] = useState({
    medioPago: 'efectivo',
    fecha: todayIso(),
  });
  // null = todos los conceptos; set = solo esos
  const [filterTipos, setFilterTipos] = useState<Set<string> | null>(null);
  // deselected: movimientos que el usuario desmarcó explícitamente (por defecto todo está seleccionado)
  const [deselected, setDeselected] = useState<Map<string, Set<string>>>(() => new Map());
  const [expandedSocios, setExpandedSocios] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const minFecha = addDays(todayIso(), -5);

  // Socios filtrados por concepto y con al menos 1 movimiento
  const elegibles = useMemo(() => {
    return socios
      .map((s) => {
        const movsFiltrados =
          filterTipos === null
            ? s.movimientos
            : s.movimientos.filter((m) => m.tipoServicio && filterTipos.has(m.tipoServicio));
        return { ...s, movsFiltrados };
      })
      .filter((s) => s.movsFiltrados.length > 0);
  }, [socios, filterTipos]);

  function isMovSel(socioId: string, movId: string) {
    return !deselected.get(socioId)?.has(movId);
  }

  function toggleConcepto(tipo: string) {
    // Resetear deselecciones al cambiar el filtro (todo queda seleccionado)
    setDeselected(new Map());
    setFilterTipos((prev) => {
      const next = new Set(prev ?? CONCEPTO_OPTS.map((o) => o.value));
      if (next.has(tipo)) {
        next.delete(tipo);
        if (next.size === 0) return null;
      } else {
        next.add(tipo);
        if (next.size === CONCEPTO_OPTS.length) return null;
      }
      return next;
    });
  }

  function isConceptoActive(tipo: string) {
    return filterTipos === null || filterTipos.has(tipo);
  }

  function toggleExpandSocio(id: string) {
    setExpandedSocios((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSocio(socioId: string, movsFiltrados: LoteMovimiento[]) {
    const allSel = movsFiltrados.every((m) => isMovSel(socioId, m.id));
    setDeselected((prev) => {
      const next = new Map(prev);
      if (allSel) {
        next.set(socioId, new Set(movsFiltrados.map((m) => m.id)));
      } else {
        next.delete(socioId);
      }
      return next;
    });
  }

  function toggleMov(socioId: string, movId: string) {
    setDeselected((prev) => {
      const next = new Map(prev);
      const socioSet = new Set(next.get(socioId) ?? []);
      if (socioSet.has(movId)) socioSet.delete(movId);
      else socioSet.add(movId);
      next.set(socioId, socioSet);
      return next;
    });
  }

  const totalSeleccionado = useMemo(() => {
    return elegibles.reduce((sum, s) => {
      return (
        sum +
        s.movsFiltrados
          .filter((m) => isMovSel(s.id, m.id))
          .reduce((s2, m) => s2 + parseFloat(m.debe ?? '0'), 0)
      );
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deselected, elegibles]);

  const sociosConSel = useMemo(
    () => elegibles.filter((s) => s.movsFiltrados.some((m) => isMovSel(s.id, m.id))).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deselected, elegibles],
  );

  // Desglose Neto/Exento/IVA de todo lo seleccionado con la alícuota real de
  // cada tarifa (fallback: 0 con club Monotributo — Factura C —, 21 el resto;
  // mismo criterio que desglosarMontos en el server).
  const clubMonotributo = guarderiaCondicionIva === 'monotributo';
  const desgloseSeleccionado = useMemo(() => {
    return desglosarItemsUi(
      elegibles.flatMap((s) =>
        s.movsFiltrados
          .filter((m) => isMovSel(s.id, m.id))
          .map((m) => ({ bruto: parseFloat(m.debe ?? '0'), alicuotaIva: m.alicuotaIva })),
      ),
      clubMonotributo ? 0 : 21,
      clubMonotributo,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deselected, elegibles, clubMonotributo]);

  const allSelected = elegibles.every((s) => s.movsFiltrados.every((m) => isMovSel(s.id, m.id)));

  function toggleAll() {
    if (allSelected) {
      const next = new Map<string, Set<string>>();
      for (const s of elegibles) {
        next.set(s.id, new Set(s.movsFiltrados.map((m) => m.id)));
      }
      setDeselected(next);
    } else {
      setDeselected(new Map());
    }
  }

  function handleClose() {
    setError(null);
    setResult(null);
    setFilterTipos(null);
    setDeselected(new Map());
    setExpandedSocios(new Set());
    onClose();
  }

  function handleSubmit() {
    if (sociosConSel === 0) {
      setError('Seleccioná al menos un movimiento para emitir.');
      return;
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      const socioMovimientos = elegibles
        .map((s) => {
          const sel = s.movsFiltrados.filter((m) => isMovSel(s.id, m.id));
          return {
            socioId: s.id,
            itemKeys: sel.filter((m) => m.itemKey).map((m) => m.itemKey!),
            movimientoIds: sel.filter((m) => !m.itemKey).map((m) => m.id),
          };
        })
        .filter((s) => s.movimientoIds.length > 0 || s.itemKeys.length > 0);

      const res = await createBatchInvoicesAction({
        socioMovimientos,
        medioPago: form.medioPago as never,
        fecha: form.fecha,
      });
      if (res.error) setError(res.error);
      else if (res.result) {
        setResult(res.result);
        router.refresh();
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Factura en lote
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Emití un comprobante por cada socio con movimientos pendientes
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {!result ? (
            <>
              {/* Fecha + Medio de pago */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Fecha
                  </label>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.fecha}
                    min={minFecha}
                    onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Forma de pago
                  </label>
                  <select
                    className={inputCls}
                    value={form.medioPago}
                    onChange={(e) => setForm((f) => ({ ...f, medioPago: e.target.value }))}
                  >
                    {MEDIO_PAGO_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Filtro por concepto */}
              <div>
                <p className="mb-2 text-xs font-semibold" style={{ color: '#101828' }}>
                  Filtrar por concepto
                </p>
                <div className="flex flex-wrap gap-2">
                  {CONCEPTO_OPTS.map((o) => {
                    const active = isConceptoActive(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => toggleConcepto(o.value)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          active
                            ? 'border-[#175861] bg-[#175861] text-white'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lista de socios */}
              <div className="rounded-[10px] border border-gray-100 bg-white">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                      Socios con pendientes ({elegibles.length})
                    </p>
                    <p className="text-xs text-gray-400">
                      Seleccionados: {sociosConSel} — Total: {fmtMoney(totalSeleccionado)}
                    </p>
                  </div>
                  {elegibles.length > 0 && (
                    <button
                      onClick={toggleAll}
                      className="text-xs font-medium underline underline-offset-2"
                      style={{ color: '#175861' }}
                    >
                      {allSelected ? 'Ninguno' : 'Todos'}
                    </button>
                  )}
                </div>
                {elegibles.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">
                    No hay socios con movimientos para los conceptos seleccionados.
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {elegibles.map((s) => {
                      const expanded = expandedSocios.has(s.id);
                      const totalSocio = s.movsFiltrados
                        .filter((m) => isMovSel(s.id, m.id))
                        .reduce((sum, m) => sum + parseFloat(m.debe ?? '0'), 0);
                      const allMovSel = s.movsFiltrados.every((m) => isMovSel(s.id, m.id));
                      const selCount = s.movsFiltrados.filter((m) => isMovSel(s.id, m.id)).length;
                      const someMovSel = selCount > 0 && !allMovSel;

                      return (
                        <div key={s.id} className="border-b border-gray-50 last:border-0">
                          {/* Fila del socio */}
                          <div className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50">
                            <input
                              ref={(el) => {
                                if (el) el.indeterminate = someMovSel;
                              }}
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                              checked={allMovSel}
                              onChange={() => toggleSocio(s.id, s.movsFiltrados)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium" style={{ color: '#101828' }}>
                                {s.nombre}
                              </p>
                              <p className="truncate text-xs text-gray-400">{s.email}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium" style={{ color: '#175861' }}>
                                {fmtMoney(totalSocio)}
                              </p>
                              <p className="text-xs text-gray-400">
                                {selCount}/{s.movsFiltrados.length} mov.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleExpandSocio(s.id)}
                              className="shrink-0 rounded-[6px] p-1 text-gray-400 hover:bg-gray-100"
                              title={expanded ? 'Ocultar consumos' : 'Ver consumos'}
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          {/* Consumos expandidos */}
                          {expanded && (
                            <div className="bg-gray-50 pb-1">
                              {s.movsFiltrados.map((m) => (
                                <label
                                  key={m.id}
                                  className="flex cursor-pointer items-center gap-3 border-b border-gray-100 py-2 pr-4 pl-11 text-sm last:border-0 hover:bg-gray-100"
                                >
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 cursor-pointer rounded accent-[#175861]"
                                    checked={isMovSel(s.id, m.id)}
                                    onChange={() => toggleMov(s.id, m.id)}
                                  />
                                  <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                                    {m.concepto ?? m.servicioNombre ?? 'Servicio'}
                                  </span>
                                  <span className="shrink-0 text-xs font-medium text-gray-600">
                                    {fmtMoney(m.debe)}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-[10px] bg-green-50 p-4 text-sm text-green-800">
                <p className="font-semibold">{result.succeeded.length} comprobantes emitidos</p>
                {result.skipped.length > 0 && (
                  <p className="mt-0.5 text-green-700">
                    {result.skipped.length} socios omitidos (sin pendientes)
                  </p>
                )}
              </div>
              {result.failed.length > 0 && (
                <div className="rounded-[10px] bg-red-50 p-4 text-sm text-red-800">
                  <p className="mb-1 font-semibold">{result.failed.length} fallaron:</p>
                  <ul className="space-y-1 text-xs">
                    {result.failed.map((f) => {
                      const socio = socios.find((s) => s.id === f.socioId);
                      return (
                        <li key={f.socioId}>
                          • {socio?.nombre ?? f.socioId}: {f.error}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 p-6">
          {/* Desglose completo (neto/exento/IVA/bruto) para club RI (pedido
          2026-08-03); club Monotributo no discrimina impuesto, muestra solo
          el total (pedido 2026-08-05). */}
          {!result && sociosConSel > 0 && (
            <DesgloseImportes
              neto={desgloseSeleccionado.neto}
              exento={desgloseSeleccionado.exento}
              iva={desgloseSeleccionado.iva}
              bruto={totalSeleccionado}
              brutoLabel="Importe bruto (total a emitir)"
            />
          )}
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
            >
              {result ? 'Cerrar' : 'Cancelar'}
            </button>
            {!result && (
              <button
                onClick={handleSubmit}
                disabled={isPending || sociosConSel === 0}
                className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: '#175861' }}
              >
                {isPending
                  ? 'Emitiendo...'
                  : `Emitir ${sociosConSel} comprobante${sociosConSel === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Comprobante interno por lote ────────────────────────────────────

function ComprobanteInternoLoteModal({
  open,
  onClose,
  sociosInterno,
}: {
  open: boolean;
  onClose: () => void;
  sociosInterno: SocioInterno[];
}) {
  const router = useRouter();
  const [fecha, setFecha] = useState(todayIso);
  // deselected: movimientos que el usuario desmarcó explícitamente (por defecto todo está seleccionado)
  const [deselected, setDeselected] = useState<Map<string, Set<string>>>(() => new Map());
  const [expandedSocios, setExpandedSocios] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComprobanteInternoLoteResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function isMovSel(socioId: string, movId: string) {
    return !deselected.get(socioId)?.has(movId);
  }

  function toggleExpandSocio(id: string) {
    setExpandedSocios((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSocio(socioId: string, movimientos: LoteMovimiento[]) {
    const allSel = movimientos.every((m) => isMovSel(socioId, m.id));
    setDeselected((prev) => {
      const next = new Map(prev);
      if (allSel) {
        next.set(socioId, new Set(movimientos.map((m) => m.id)));
      } else {
        next.delete(socioId);
      }
      return next;
    });
  }

  function toggleMov(socioId: string, movId: string) {
    setDeselected((prev) => {
      const next = new Map(prev);
      const socioSet = new Set(next.get(socioId) ?? []);
      if (socioSet.has(movId)) socioSet.delete(movId);
      else socioSet.add(movId);
      next.set(socioId, socioSet);
      return next;
    });
  }

  const totalSeleccionado = useMemo(() => {
    return sociosInterno.reduce((sum, s) => {
      return (
        sum +
        s.movimientos
          .filter((m) => isMovSel(s.id, m.id))
          .reduce((s2, m) => s2 + parseFloat(m.debe ?? '0'), 0)
      );
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deselected, sociosInterno]);

  const sociosConSel = useMemo(
    () => sociosInterno.filter((s) => s.movimientos.some((m) => isMovSel(s.id, m.id))).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deselected, sociosInterno],
  );

  const allSelected = sociosInterno.every((s) => s.movimientos.every((m) => isMovSel(s.id, m.id)));

  function toggleAll() {
    if (allSelected) {
      const next = new Map<string, Set<string>>();
      for (const s of sociosInterno) {
        next.set(s.id, new Set(s.movimientos.map((m) => m.id)));
      }
      setDeselected(next);
    } else {
      setDeselected(new Map());
    }
  }

  function handleClose() {
    setError(null);
    setResult(null);
    setDeselected(new Map());
    setExpandedSocios(new Set());
    onClose();
  }

  function handleSubmit() {
    if (sociosConSel === 0) {
      setError('Seleccioná al menos un cargo para emitir.');
      return;
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      const socioMovimientos = sociosInterno
        .map((s) => {
          const sel = s.movimientos.filter((m) => isMovSel(s.id, m.id));
          return {
            socioId: s.id,
            itemKeys: sel.filter((m) => m.itemKey).map((m) => m.itemKey!),
            movimientoIds: sel.filter((m) => !m.itemKey).map((m) => m.id),
          };
        })
        .filter((s) => s.movimientoIds.length > 0 || s.itemKeys.length > 0);

      const res = await crearComprobanteInternoLoteAction({ fecha, socioMovimientos });
      if (res.error) setError(res.error);
      else if (res.result) {
        setResult(res.result);
        router.refresh();
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Comprobante interno por lote
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Emití un comprobante interno por cada socio con cargos Interno pendientes
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {!result ? (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Fecha
                </label>
                <input
                  type="date"
                  className={inputCls}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>

              <div className="rounded-[10px] border border-gray-100 bg-white">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                      Socios con cargos internos ({sociosInterno.length})
                    </p>
                    <p className="text-xs text-gray-400">
                      Seleccionados: {sociosConSel} — Total: {fmtMoney(totalSeleccionado)}
                    </p>
                  </div>
                  {sociosInterno.length > 0 && (
                    <button
                      onClick={toggleAll}
                      className="text-xs font-medium underline underline-offset-2"
                      style={{ color: '#175861' }}
                    >
                      {allSelected ? 'Ninguno' : 'Todos'}
                    </button>
                  )}
                </div>
                {sociosInterno.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">
                    No hay socios con cargos internos pendientes.
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {sociosInterno.map((s) => {
                      const expanded = expandedSocios.has(s.id);
                      const totalSocio = s.movimientos
                        .filter((m) => isMovSel(s.id, m.id))
                        .reduce((sum, m) => sum + parseFloat(m.debe ?? '0'), 0);
                      const allMovSel = s.movimientos.every((m) => isMovSel(s.id, m.id));
                      const selCount = s.movimientos.filter((m) => isMovSel(s.id, m.id)).length;
                      const someMovSel = selCount > 0 && !allMovSel;

                      return (
                        <div key={s.id} className="border-b border-gray-50 last:border-0">
                          <div className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50">
                            <input
                              ref={(el) => {
                                if (el) el.indeterminate = someMovSel;
                              }}
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                              checked={allMovSel}
                              onChange={() => toggleSocio(s.id, s.movimientos)}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium" style={{ color: '#101828' }}>
                                {s.nombre}
                              </p>
                              <p className="truncate text-xs text-gray-400">{s.email}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium" style={{ color: '#175861' }}>
                                {fmtMoney(totalSocio)}
                              </p>
                              <p className="text-xs text-gray-400">
                                {selCount}/{s.movimientos.length} mov.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleExpandSocio(s.id)}
                              className="shrink-0 rounded-[6px] p-1 text-gray-400 hover:bg-gray-100"
                              title={expanded ? 'Ocultar cargos' : 'Ver cargos'}
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          {expanded && (
                            <div className="bg-gray-50 pb-1">
                              {s.movimientos.map((m) => (
                                <label
                                  key={m.id}
                                  className="flex cursor-pointer items-center gap-3 border-b border-gray-100 py-2 pr-4 pl-11 text-sm last:border-0 hover:bg-gray-100"
                                >
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 cursor-pointer rounded accent-[#175861]"
                                    checked={isMovSel(s.id, m.id)}
                                    onChange={() => toggleMov(s.id, m.id)}
                                  />
                                  <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                                    {m.concepto ?? m.servicioNombre ?? 'Servicio'}
                                  </span>
                                  <span className="shrink-0 text-xs font-medium text-gray-600">
                                    {fmtMoney(m.debe)}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-[10px] bg-green-50 p-4 text-sm text-green-800">
                <p className="font-semibold">{result.succeeded.length} comprobantes emitidos</p>
                {result.skipped.length > 0 && (
                  <p className="mt-0.5 text-green-700">
                    {result.skipped.length} socios omitidos (sin cargos seleccionados)
                  </p>
                )}
              </div>
              {result.failed.length > 0 && (
                <div className="rounded-[10px] bg-red-50 p-4 text-sm text-red-800">
                  <p className="mb-1 font-semibold">{result.failed.length} fallaron:</p>
                  <ul className="space-y-1 text-xs">
                    {result.failed.map((f) => {
                      const socio = sociosInterno.find((s) => s.id === f.socioId);
                      return (
                        <li key={f.socioId}>
                          • {socio?.nombre ?? f.socioId}: {f.error}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 p-6">
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
            >
              {result ? 'Cerrar' : 'Cancelar'}
            </button>
            {!result && (
              <button
                onClick={handleSubmit}
                disabled={isPending || sociosConSel === 0}
                className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: '#175861' }}
              >
                {isPending
                  ? 'Emitiendo...'
                  : `Emitir ${sociosConSel} comprobante${sociosConSel === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: marcar pagada ───────────────────────────────────────────────────

function MarcarPagadaModal({
  open,
  onClose,
  factura,
}: {
  open: boolean;
  onClose: () => void;
  factura: Factura | null;
}) {
  const router = useRouter();
  const [medioPago, setMedioPago] = useState('efectivo');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open || !factura) return null;

  function handleSubmit() {
    if (!factura) return;
    setError(null);
    startTransition(async () => {
      const res = await markInvoicePaidAction(factura.id, medioPago as never);
      if (res.error) setError(res.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Marcar como cobrada
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Factura {factura.codigo ?? factura.id.slice(0, 8)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
              Medio de pago
            </label>
            <select
              className={inputCls}
              value={medioPago}
              onChange={(e) => setMedioPago(e.target.value)}
            >
              {MEDIO_PAGO_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="border-t border-gray-200 p-6">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: '#175861' }}
            >
              {isPending ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: nota de crédito ────────────────────────────────────────────────

const MOTIVO_OPTS: { value: MotivoNota; label: string }[] = Object.entries(MOTIVO_NOTA_LABEL).map(
  ([value, label]) => ({ value: value as MotivoNota, label }),
);

// "Anulación total" auto-completa el importe = al de la factura original —
// solo tiene sentido para NC asociada. En ND (y en el camino libre) no se
// ofrece: no existe la noción de "anular totalmente" cobrando de más.
function motivoOptsPara(esNc: boolean) {
  return esNc ? MOTIVO_OPTS : MOTIVO_OPTS.filter((o) => o.value !== 'anulacion_total');
}

function NcNdToggle({ esNc, onChange }: { esNc: boolean; onChange: (esNc: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`rounded-[10px] border px-3 py-2.5 text-sm font-medium transition ${
          esNc
            ? 'border-[#175861] bg-[#EFF8F7] text-[#175861]'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        Nota de Crédito
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`rounded-[10px] border px-3 py-2.5 text-sm font-medium transition ${
          !esNc
            ? 'border-[#175861] bg-[#EFF8F7] text-[#175861]'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        Nota de Débito
      </button>
    </div>
  );
}

function NotaCreditoModal({
  open,
  onClose,
  factura,
  acreditado,
  guarderiaCondicionIva,
}: {
  open: boolean;
  onClose: () => void;
  factura: Factura | null;
  // Total ya acreditado por NC anteriores (no rechazadas) sobre esta factura.
  acreditado: number;
  // Para el desglose del footer: Monotributo no discrimina impuesto.
  guarderiaCondicionIva?: string | null;
}) {
  const router = useRouter();
  const [esNc, setEsNc] = useState(true);
  const [motivo, setMotivo] = useState<MotivoNota>('anulacion_total');
  const [importe, setImporte] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    comprobanteNro?: string;
    folioLocal?: string;
    pdfUrl?: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open || !factura) return null;

  const importeOriginal = parseFloat(factura.importe ?? '0');
  // Entre todas las NC de una factura no se puede acreditar más que su total.
  // Con NC previas, "anulación total" deja de aplicar: cae a parcial por lo
  // disponible (derivado, sin efecto).
  const disponible = Math.max(0, importeOriginal - acreditado);
  const motivoEf: MotivoNota =
    esNc && motivo === 'anulacion_total' && acreditado > 0.001 ? 'descuento_parcial' : motivo;
  const needsImporte = !(esNc && motivoEf === 'anulacion_total');
  const tipoNota = esNc ? 'NC' : 'ND';

  function handleSubmit() {
    if (!factura) return;
    setError(null);
    const importeNum = needsImporte ? parseFloat(importe.replace(',', '.')) : undefined;
    startTransition(async () => {
      const res = await emitirNotaAsociadaAction({
        facturaOriginalId: factura.id,
        esNc,
        motivo: motivoEf,
        importe: importeNum,
        descripcion: descripcion || undefined,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult({
          comprobanteNro: res.comprobanteNro,
          folioLocal: res.folioLocal,
          pdfUrl: res.pdfUrl,
        });
        router.refresh();
      }
    });
  }

  function handleClose() {
    setEsNc(true);
    setMotivo('anulacion_total');
    setImporte('');
    setDescripcion('');
    setError(null);
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Emitir {esNc ? 'Nota de Crédito' : 'Nota de Débito'}
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Comprobante {factura.codigo ?? factura.id.slice(0, 8)} — {fmtMoney(factura.importe)}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        {result ? (
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-3 rounded-[10px] bg-teal-50 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" />
              <div>
                <p className="font-semibold text-teal-900">{tipoNota} emitida correctamente</p>
                {result.comprobanteNro && (
                  <p className="text-sm text-teal-700">Nro: {result.comprobanteNro}</p>
                )}
                {result.folioLocal && <p className="text-sm text-teal-700">{result.folioLocal}</p>}
              </div>
            </div>
            {result.pdfUrl && (
              <a
                href={result.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-4 w-4" />
                Descargar PDF
              </a>
            )}
            <button
              onClick={handleClose}
              className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#175861' }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4 p-6">
              <NcNdToggle
                esNc={esNc}
                onChange={(v) => {
                  setEsNc(v);
                  if (!v && motivo === 'anulacion_total') setMotivo('descuento_parcial');
                  setImporte('');
                }}
              />

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Motivo
                </label>
                <select
                  className={inputCls}
                  value={motivoEf}
                  onChange={(e) => {
                    setMotivo(e.target.value as MotivoNota);
                    setImporte('');
                  }}
                >
                  {motivoOptsPara(esNc)
                    .filter((o) => o.value !== 'anulacion_total' || acreditado <= 0.001)
                    .map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                </select>
              </div>

              {needsImporte && (
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Importe {esNc ? 'a acreditar' : 'a debitar'}
                    <span className="ml-1 font-normal text-gray-400">
                      {esNc && acreditado > 0.001
                        ? `(disponible ${fmtMoney(disponible)} de ${fmtMoney(factura.importe)} — ya acreditado ${fmtMoney(acreditado)})`
                        : `(máx. ${fmtMoney(esNc ? disponible : importeOriginal)})`}
                    </span>
                  </label>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    placeholder={`0,00 (máx ${(esNc ? disponible : importeOriginal).toFixed(2)})`}
                    value={importe}
                    onChange={(e) => setImporte(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Descripción (opcional)
                </label>
                <input
                  className={inputCls}
                  placeholder="Se auto-genera si se deja vacío"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 p-6">
              {/* Mismo desglose que la factura (pedido 2026-08-10): este modal
              es el camino habitual y era el único sin el cuadro. */}
              <DesgloseNota
                total={
                  needsImporte
                    ? Number.isFinite(parseFloat(importe.replace(',', '.')))
                      ? parseFloat(importe.replace(',', '.'))
                      : 0
                    : disponible
                }
                tipoFactura={factura.tipoFactura}
                esNc={esNc}
                esMonotributo={guarderiaCondicionIva === 'monotributo'}
              />
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isPending || (needsImporte && !importe)}
                  className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: '#175861' }}
                >
                  {isPending ? 'Emitiendo...' : `Emitir ${tipoNota}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modal: nota de crédito interna (sobre un Comprobante interno CM-/CL-) ──
//
// Mismo molde que NotaCreditoModal pero sin NcNdToggle (solo NC, no hay ND
// interna) y sin nada de TusFacturas (no hay CAE ni PDF que descargar — el
// comprobante se ve/imprime en /ventas/recibo/[id] como cualquier CM-/CL-).

function NotaCreditoInternaModal({
  open,
  onClose,
  factura,
  acreditado,
  guarderiaCondicionIva,
}: {
  open: boolean;
  onClose: () => void;
  factura: Factura | null;
  // Total ya acreditado por NC internas anteriores sobre este comprobante.
  acreditado: number;
  // Para el desglose del footer: Monotributo no discrimina impuesto.
  guarderiaCondicionIva?: string | null;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState<MotivoNota>('anulacion_total');
  const [importe, setImporte] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ codigo?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open || !factura) return null;

  const importeOriginal = parseFloat(factura.importe ?? '0');
  // Mismo tope acumulado que las NC fiscales: con NC internas previas,
  // "anulación total" cae a parcial por lo disponible.
  const disponible = Math.max(0, importeOriginal - acreditado);
  const motivoEf: MotivoNota =
    motivo === 'anulacion_total' && acreditado > 0.001 ? 'descuento_parcial' : motivo;
  const needsImporte = motivoEf !== 'anulacion_total';

  function handleSubmit() {
    if (!factura) return;
    setError(null);
    const importeNum = needsImporte ? parseFloat(importe.replace(',', '.')) : undefined;
    startTransition(async () => {
      const res = await emitirNotaCreditoInternaAction({
        facturaOriginalId: factura.id,
        motivo: motivoEf,
        importe: importeNum,
        descripcion: descripcion || undefined,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult({ codigo: res.codigo });
        router.refresh();
      }
    });
  }

  function handleClose() {
    setMotivo('anulacion_total');
    setImporte('');
    setDescripcion('');
    setError(null);
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Emitir Nota de Crédito interna
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Comprobante {factura.codigo ?? factura.id.slice(0, 8)} — {fmtMoney(factura.importe)}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        {result ? (
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-3 rounded-[10px] bg-teal-50 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" />
              <div>
                <p className="font-semibold text-teal-900">NC interna emitida correctamente</p>
                {result.codigo && <p className="text-sm text-teal-700">Nro: {result.codigo}</p>}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#175861' }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Motivo
                </label>
                <select
                  className={inputCls}
                  value={motivoEf}
                  onChange={(e) => {
                    setMotivo(e.target.value as MotivoNota);
                    setImporte('');
                  }}
                >
                  {MOTIVO_OPTS.filter(
                    (o) => o.value !== 'anulacion_total' || acreditado <= 0.001,
                  ).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {needsImporte && (
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Importe a acreditar
                    <span className="ml-1 font-normal text-gray-400">
                      {acreditado > 0.001
                        ? `(disponible ${fmtMoney(disponible)} de ${fmtMoney(factura.importe)} — ya acreditado ${fmtMoney(acreditado)})`
                        : `(máx. ${fmtMoney(disponible)})`}
                    </span>
                  </label>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    placeholder={`0,00 (máx ${disponible.toFixed(2)})`}
                    value={importe}
                    onChange={(e) => setImporte(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Descripción (opcional)
                </label>
                <input
                  className={inputCls}
                  placeholder="Se auto-genera si se deja vacío"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 p-6">
              {/* Mismo desglose que la factura (pedido 2026-08-10). El
              comprobante interno no tiene letra fiscal: rige la alícuota
              general, igual que emitirNotaCreditoInternaAction. */}
              <DesgloseNota
                total={
                  needsImporte
                    ? Number.isFinite(parseFloat(importe.replace(',', '.')))
                      ? parseFloat(importe.replace(',', '.'))
                      : 0
                    : disponible
                }
                tipoFactura={null}
                esNc
                esMonotributo={guarderiaCondicionIva === 'monotributo'}
              />
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isPending || (needsImporte && !importe)}
                  className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: '#175861' }}
                >
                  {isPending ? 'Emitiendo...' : 'Emitir NC interna'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modal: reenviar factura rechazada por ARCA ────────────────────────────

// Recibe `factura` no-nulable a propósito: el padre solo la monta cuando hay
// una seleccionada, con `key={factura.id}` — así el estado se inicializa de
// nuevo (precargado) en cada apertura, sin necesitar un efecto que copie
// props a state.
function ReenviarFacturaModal({
  onClose,
  factura,
  guarderiaCondicionIva,
  socios,
}: {
  onClose: () => void;
  factura: Factura;
  guarderiaCondicionIva: string | null;
  socios: Socio[];
}) {
  const router = useRouter();
  const hoy = new Date().toISOString().slice(0, 10);
  // Si el tipo original no es emisible por la condición IVA actual del club
  // (ej. cambió de Monotributo a RI), arrancar en el primero válido. Se pasa
  // la condición del socio para que ofrezca SOLO la letra que corresponde
  // (misma regla que al emitir): reenviar no es una vía para cambiarla a mano.
  const socioFactura = factura.socioId ? socios.find((s) => s.id === factura.socioId) : undefined;
  const opcionesTipo = tiposFacturaEmisibles(
    guarderiaCondicionIva,
    socioFactura ? condicionIvaEfectiva(socioFactura) : null,
  );
  const [tipoFactura, setTipoFactura] = useState(
    opcionesTipo.some((o) => o.value === factura.tipoFactura)
      ? (factura.tipoFactura ?? opcionesTipo[0].value)
      : opcionesTipo[0].value,
  );
  const [condicionVenta, setCondicionVenta] = useState(factura.condicionVenta ?? 'contado');
  const [medioPago, setMedioPago] = useState(factura.medioPago ?? 'efectivo');
  const [descripcion, setDescripcion] = useState(factura.descripcion ?? '');
  const [fecha, setFecha] = useState(hoy);
  const [vencimiento, setVencimiento] = useState(hoy);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    comprobanteNro?: string;
    folioLocal?: string;
    pdfUrl?: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await reenviarFacturaRechazadaAction(factura.id, {
        tipoFactura: tipoFactura as never,
        condicionVenta: condicionVenta as never,
        medioPago: medioPago as never,
        descripcion: descripcion || undefined,
        fecha,
        vencimiento,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult({
          comprobanteNro: res.comprobanteNro,
          folioLocal: res.folioLocal,
          pdfUrl: res.pdfUrl,
        });
        router.refresh();
      }
    });
  }

  function handleClose() {
    setError(null);
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Reenviar factura rechazada
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {fmtMoney(factura.importe)}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        {result ? (
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-3 rounded-[10px] bg-teal-50 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" />
              <div>
                <p className="font-semibold text-teal-900">Factura aceptada por ARCA</p>
                {result.comprobanteNro && (
                  <p className="text-sm text-teal-700">Nro: {result.comprobanteNro}</p>
                )}
                {result.folioLocal && <p className="text-sm text-teal-700">{result.folioLocal}</p>}
              </div>
            </div>
            {result.pdfUrl && (
              <a
                href={result.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-4 w-4" />
                Descargar PDF
              </a>
            )}
            <button
              onClick={handleClose}
              className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#175861' }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4 p-6">
              {factura.motivoError && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>Motivo del rechazo:</strong> {factura.motivoError}
                  </span>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Tipo de factura
                </label>
                <select
                  className={inputCls}
                  value={tipoFactura}
                  onChange={(e) => setTipoFactura(e.target.value)}
                >
                  {opcionesTipo.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Condición de venta
                  </label>
                  <select
                    className={inputCls}
                    value={condicionVenta}
                    onChange={(e) => setCondicionVenta(e.target.value)}
                  >
                    {CONDICION_VENTA_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Medio de pago
                  </label>
                  <select
                    className={inputCls}
                    value={medioPago}
                    onChange={(e) => setMedioPago(e.target.value)}
                  >
                    {MEDIO_PAGO_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Descripción (opcional)
                </label>
                <input
                  className={inputCls}
                  placeholder="Se auto-genera si se deja vacío"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>

              <p className="text-xs text-gray-400">
                Los cargos incluidos son los mismos del intento original — no se vuelven a elegir.
                Si el error era del socio (CUIT, condición de IVA), corregilo en su perfil antes de
                reenviar.
              </p>

              {error && (
                <div className="flex items-start gap-2 rounded-[10px] bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 p-6">
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: '#175861' }}
                >
                  {isPending ? 'Reenviando...' : 'Reenviar'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modal: nota de crédito en lote (anulación total) ─────────────────────

type LoteNcResultado = { codigo: string; ok: boolean; mensaje: string };

function LoteNotaCreditoModal({
  open,
  onClose,
  facturas,
  guarderiaCondicionIva,
}: {
  open: boolean;
  onClose: () => void;
  facturas: Factura[];
  // Para el desglose del footer: Monotributo no discrimina impuesto.
  guarderiaCondicionIva?: string | null;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultados, setResultados] = useState<LoteNcResultado[] | null>(null);

  if (!open) return null;

  const total = facturas.reduce((s, f) => s + parseFloat(f.importe ?? '0'), 0);

  async function handleEmitir() {
    setRunning(true);
    setResultados(null);
    const res: LoteNcResultado[] = [];
    for (let i = 0; i < facturas.length; i++) {
      const f = facturas[i];
      setProgreso(i);
      // Cada NC es una emisión AFIP real → secuencial. Si una falla, se sigue.
      const r = await emitirNotaCreditoAction({
        facturaOriginalId: f.id,
        motivo: 'anulacion_total',
        origen: 'lote',
      });
      res.push({
        codigo: f.codigo ?? f.id.slice(0, 8),
        ok: !r.error,
        mensaje:
          r.error ??
          `NC ${r.comprobanteNro ?? 'emitida'}${r.folioLocal ? ` · ${r.folioLocal}` : ''}`,
      });
    }
    setProgreso(facturas.length);
    setResultados(res);
    setRunning(false);
    router.refresh();
  }

  function handleClose() {
    if (running) return; // no cerrar a mitad de emisión
    setProgreso(0);
    setResultados(null);
    onClose();
  }

  const okCount = resultados?.filter((r) => r.ok).length ?? 0;
  const failCount = resultados?.filter((r) => !r.ok).length ?? 0;

  // Desglose del lote: cada factura aporta con la alícuota de SU letra (C → 0,
  // resto 21 — mismo criterio que alicuotaPara), así una selección mezclada no
  // queda mal discriminada.
  const desgloseLote = desglosarItemsUi(
    facturas.map((f) => ({
      bruto: parseFloat(f.importe ?? '0'),
      alicuotaIva: f.tipoFactura === 'factura_c' ? 0 : 21,
    })),
    21,
    guarderiaCondicionIva === 'monotributo',
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Anular en lote (Nota de Crédito)
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {facturas.length} comprobante{facturas.length === 1 ? '' : 's'} — Total{' '}
              {fmtMoney(total.toFixed(2))}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={running}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {!resultados && !running && (
            <>
              <div className="flex items-start gap-2 rounded-[10px] bg-amber-50 p-3 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Se va a emitir una <strong>nota de crédito por el total</strong> de cada factura
                  seleccionada (anulación total). Es una emisión real a ARCA y revierte la cuenta
                  corriente del socio. No se puede deshacer.
                </span>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-[10px] border border-gray-100 p-3">
                {facturas.map((f) => (
                  <div key={f.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {f.codigo ?? f.id.slice(0, 8)} · {f.socioNombre}
                    </span>
                    <span className="font-medium text-gray-700">{fmtMoney(f.importe)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {running && (
            <div className="flex flex-col items-center gap-2 py-6">
              <p className="text-sm font-medium text-gray-700">
                Emitiendo {Math.min(progreso + 1, facturas.length)} de {facturas.length}…
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(progreso / facturas.length) * 100}%`,
                    background: '#175861',
                  }}
                />
              </div>
              <p className="text-xs text-gray-400">No cierres esta ventana.</p>
            </div>
          )}

          {resultados && (
            <>
              <div className="flex gap-3">
                <div className="flex-1 rounded-[10px] bg-teal-50 p-3 text-center">
                  <p className="text-lg font-bold text-teal-700">{okCount}</p>
                  <p className="text-xs text-teal-600">emitidas</p>
                </div>
                <div className="flex-1 rounded-[10px] bg-red-50 p-3 text-center">
                  <p className="text-lg font-bold text-red-700">{failCount}</p>
                  <p className="text-xs text-red-600">fallidas</p>
                </div>
              </div>
              {failCount > 0 && (
                <div className="space-y-1 rounded-[10px] border border-red-100 p-3">
                  <p className="mb-1 text-xs font-semibold text-red-700">Fallidas:</p>
                  {resultados
                    .filter((r) => !r.ok)
                    .map((r, i) => (
                      <p key={i} className="text-xs text-gray-600">
                        <span className="font-medium">{r.codigo}</span>: {r.mensaje}
                      </p>
                    ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-gray-200 p-6">
          {/* Mismo desglose que la factura (pedido 2026-08-10), sobre el total
          del lote. Ya emitido no aplica: el resultado manda. */}
          {!resultados && (
            <DesgloseImportes
              neto={desgloseLote.neto}
              exento={desgloseLote.exento}
              iva={desgloseLote.iva}
              bruto={total}
              brutoLabel="Importe bruto (total a acreditar)"
            />
          )}
          {resultados ? (
            <button
              onClick={handleClose}
              className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#175861' }}
            >
              Cerrar
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                disabled={running}
                className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={handleEmitir}
                disabled={running || facturas.length === 0}
                className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: '#175861' }}
              >
                {running ? 'Emitiendo…' : `Emitir ${facturas.length} NC`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────

export function VentasClient({
  facturas,
  socios,
  sociosInterno,
  kpis,
  posConfigurado,
  certificadoOk,
  guarderiaCondicionIva,
  centrosEmisores,
  internosHabilitados,
}: {
  facturas: Factura[];
  socios: Socio[];
  sociosInterno: SocioInterno[];
  kpis: Kpis;
  posConfigurado: boolean;
  certificadoOk: boolean;
  guarderiaCondicionIva: string | null;
  centrosEmisores: CentroEmisorOpt[];
  // false = el club no habilitó medios de cobro para comprobantes internos
  // (Mi Perfil → Configuración de cobranzas): se apaga la emisión de internos.
  internosHabilitados: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'afip' | 'recibos'>('afip');
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [loteOpen, setLoteOpen] = useState(false);
  const [comprobanteInternoOpen, setComprobanteInternoOpen] = useState(false);
  const [comprobanteInternoLoteOpen, setComprobanteInternoLoteOpen] = useState(false);
  const [pagarFactura, setPagarFactura] = useState<Factura | null>(null);
  const [ncFactura, setNcFactura] = useState<Factura | null>(null);
  const [ncInternaComprobante, setNcInternaComprobante] = useState<Factura | null>(null);
  const [reenviarFactura, setReenviarFactura] = useState<Factura | null>(null);
  // Selección para NC en lote (anulación total) sobre la tabla AFIP.
  const [selectedNc, setSelectedNc] = useState<Set<string>>(() => new Set());
  const [loteNcOpen, setLoteNcOpen] = useState(false);

  const puedeFacturar = posConfigurado && certificadoOk;
  const hasFiltrosAfip = Boolean(
    search || filterEstado || filterTipo || filterDesde || filterHasta,
  );
  const hasFiltrosRecibos = Boolean(search || filterDesde || filterHasta);

  // Tabla AFIP/NC — excluye recibos
  const filtradosAfip = useMemo(() => {
    return facturas
      .filter((f) => f.tipoFactura !== 'recibo')
      .filter((f) => {
        if (search.trim()) {
          const q = normalizarBusqueda(search);
          const tipo = TIPO_FACTURA_LABEL[f.tipoFactura ?? ''] ?? f.tipoFactura ?? '';
          const ok =
            normalizarBusqueda(f.codigo ?? '').includes(q) ||
            normalizarBusqueda(f.folioLocal ?? '').includes(q) ||
            normalizarBusqueda(tipo).includes(q) ||
            normalizarBusqueda(f.socioNombre).includes(q) ||
            normalizarBusqueda(f.descripcion ?? '').includes(q);
          if (!ok) return false;
        }
        if (filterEstado && f.estado !== filterEstado) return false;
        if (filterTipo) {
          const t = f.tipoFactura ?? '';
          if (filterTipo === 'afip' && !['factura_a', 'factura_b', 'factura_c'].includes(t))
            return false;
          if (filterTipo === 'nc' && !t.startsWith('nota_credito')) return false;
        }
        if (filterDesde && f.emision && f.emision < filterDesde) return false;
        if (filterHasta && f.emision && f.emision.slice(0, 10) > filterHasta) return false;
        return true;
      });
  }, [facturas, search, filterEstado, filterTipo, filterDesde, filterHasta]);

  // NC en lote: una factura es elegible si es AFIP (A/B/C), tiene CAE y todavía
  // no tiene una NC asociada (otra factura cuyo facturaOriginalId la apunta).
  const facturasConNc = useMemo(
    () =>
      new Set(
        facturas.filter((f) => f.facturaOriginalId).map((f) => f.facturaOriginalId as string),
      ),
    [facturas],
  );

  // Total acreditado por NC (fiscales e internas, no rechazadas) sobre cada
  // comprobante — entre todas las NC de un comprobante no se puede acreditar
  // más que su total, así que las nuevas se topean a lo disponible.
  const acreditadoNcPorFactura = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of facturas) {
      if (!f.facturaOriginalId || f.rechazada) continue;
      if (!f.tipoFactura?.startsWith('nota_credito')) continue;
      map.set(
        f.facturaOriginalId,
        (map.get(f.facturaOriginalId) ?? 0) + parseFloat(f.importe ?? '0'),
      );
    }
    return map;
  }, [facturas]);
  const esNcEligible = (f: Factura) =>
    ['factura_a', 'factura_b', 'factura_c'].includes(f.tipoFactura ?? '') &&
    Boolean(f.cae) &&
    !facturasConNc.has(f.id);

  const elegiblesNc = useMemo(
    () => filtradosAfip.filter(esNcEligible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtradosAfip, facturasConNc],
  );
  const facturasSeleccionadas = useMemo(
    () => facturas.filter((f) => selectedNc.has(f.id)),
    [facturas, selectedNc],
  );

  // El link de PDF que devuelve TusFacturas al emitir es temporal y vence
  // (su página muestra "no se ha encontrado información..."). Pedimos uno
  // fresco en cada click. La pestaña se abre ANTES del await para que el
  // bloqueador de popups no la frene.
  async function abrirPdfFactura(f: Factura) {
    const win = window.open('about:blank', '_blank');
    const res = await obtenerPdfFacturaAction(f.id);
    if (res.error || !res.url) {
      win?.close();
      toast.error(res.error ?? 'No se pudo obtener el PDF.');
      return;
    }
    if (win) win.location.href = res.url;
    else window.open(res.url, '_blank');
  }

  // Enviar el comprobante fiscal por mail al socio (PDF de ARCA adjunto).
  const [enviandoMailId, setEnviandoMailId] = useState<string | null>(null);
  async function enviarMailFactura(f: Factura) {
    setEnviandoMailId(f.id);
    const res = await enviarComprobantePorMailAction(f.id);
    setEnviandoMailId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Comprobante enviado a ${res.email}`);
  }

  function toggleNc(id: string) {
    setSelectedNc((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleTodosNc() {
    setSelectedNc((prev) => {
      const todosElegidos = elegiblesNc.length > 0 && elegiblesNc.every((f) => prev.has(f.id));
      return todosElegidos ? new Set() : new Set(elegiblesNc.map((f) => f.id));
    });
  }

  // Tabla Recibos internos — incluye las NC internas (anulan un CM-/CL- de
  // acá mismo, tiene sentido verlas al lado de lo que referencian).
  const filtradosRecibos = useMemo(() => {
    return facturas
      .filter((f) => f.tipoFactura === 'recibo' || f.tipoFactura === 'nota_credito_interna')
      .filter((f) => {
        if (search.trim()) {
          const q = normalizarBusqueda(search);
          const ok =
            normalizarBusqueda(f.codigo ?? '').includes(q) ||
            normalizarBusqueda(f.socioNombre).includes(q) ||
            normalizarBusqueda(f.descripcion ?? '').includes(q);
          if (!ok) return false;
        }
        if (filterDesde && f.emision && f.emision < filterDesde) return false;
        if (filterHasta && f.emision && f.emision.slice(0, 10) > filterHasta) return false;
        return true;
      });
  }, [facturas, search, filterDesde, filterHasta]);

  // Paginación (10 por página). Reset a la página 1 al cambiar de tab o de
  // filtros: ajuste de estado en render (key previa), no setState en useEffect.
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const filterKey = `${activeTab}|${search}|${filterEstado}|${filterTipo}|${filterDesde}|${filterHasta}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
    setSelectedNc(new Set());
  }

  const afipPageCount = Math.max(1, Math.ceil(filtradosAfip.length / PAGE_SIZE));
  const afipPage = Math.min(page, afipPageCount);
  const afipPaginados = filtradosAfip.slice((afipPage - 1) * PAGE_SIZE, afipPage * PAGE_SIZE);

  const recibosPageCount = Math.max(1, Math.ceil(filtradosRecibos.length / PAGE_SIZE));
  const recibosPage = Math.min(page, recibosPageCount);
  const recibosPaginados = filtradosRecibos.slice(
    (recibosPage - 1) * PAGE_SIZE,
    recibosPage * PAGE_SIZE,
  );

  function limpiarFiltros() {
    setSearch('');
    setFilterEstado('');
    setFilterTipo('');
    setFilterDesde('');
    setFilterHasta('');
  }

  function exportarCSV() {
    const BOM = '﻿';
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    if (activeTab === 'afip') {
      const cols = [
        'Número',
        'FL Nº',
        'Tipo',
        'Cliente',
        'Fecha',
        'Vencimiento',
        'Total',
        'Estado',
        'Descripción',
      ];
      const rows = filtradosAfip.map((f) =>
        [
          f.codigo ?? '',
          f.folioLocal ?? '',
          TIPO_FACTURA_LABEL[f.tipoFactura ?? ''] ?? f.tipoFactura ?? '',
          f.socioNombre,
          f.emision ? fmtDate(f.emision) : '',
          f.vencimiento ? fmtDate(f.vencimiento) : '',
          f.importe ?? '0',
          f.estado ?? '',
          f.descripcion ?? '',
        ]
          .map(esc)
          .join(','),
      );
      const csv = BOM + [cols.map(esc).join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobantes-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const cols = ['Número', 'Tipo', 'Cliente', 'Fecha', 'Total', 'Descripción'];
      const rows = filtradosRecibos.map((f) =>
        [
          f.codigo ?? '',
          tipoComprobanteLabel(f),
          f.socioNombre,
          f.emision ? fmtDate(f.emision) : '',
          f.importe ?? '0',
          f.descripcion ?? '',
        ]
          .map(esc)
          .join(','),
      );
      const csv = BOM + [cols.map(esc).join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recibos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <NuevaFacturaModal
        open={nuevaOpen}
        onClose={() => setNuevaOpen(false)}
        socios={socios}
        guarderiaCondicionIva={guarderiaCondicionIva}
        facturas={facturas}
        centrosEmisores={centrosEmisores}
      />
      <LoteModal
        open={loteOpen}
        onClose={() => setLoteOpen(false)}
        socios={socios}
        guarderiaCondicionIva={guarderiaCondicionIva}
      />
      <ComprobanteInternoManualModal
        open={comprobanteInternoOpen}
        onClose={() => setComprobanteInternoOpen(false)}
        socios={socios}
      />
      <ComprobanteInternoLoteModal
        open={comprobanteInternoLoteOpen}
        onClose={() => setComprobanteInternoLoteOpen(false)}
        sociosInterno={sociosInterno}
      />
      <MarcarPagadaModal
        open={!!pagarFactura}
        onClose={() => setPagarFactura(null)}
        factura={pagarFactura}
      />
      <NotaCreditoModal
        open={!!ncFactura}
        onClose={() => setNcFactura(null)}
        factura={ncFactura}
        acreditado={ncFactura ? (acreditadoNcPorFactura.get(ncFactura.id) ?? 0) : 0}
        guarderiaCondicionIva={guarderiaCondicionIva}
      />
      <NotaCreditoInternaModal
        open={!!ncInternaComprobante}
        onClose={() => setNcInternaComprobante(null)}
        factura={ncInternaComprobante}
        acreditado={
          ncInternaComprobante ? (acreditadoNcPorFactura.get(ncInternaComprobante.id) ?? 0) : 0
        }
        guarderiaCondicionIva={guarderiaCondicionIva}
      />
      {reenviarFactura && (
        <ReenviarFacturaModal
          key={reenviarFactura.id}
          onClose={() => setReenviarFactura(null)}
          factura={reenviarFactura}
          guarderiaCondicionIva={guarderiaCondicionIva}
          socios={socios}
        />
      )}
      <LoteNotaCreditoModal
        open={loteNcOpen}
        onClose={() => {
          setLoteNcOpen(false);
          setSelectedNc(new Set());
        }}
        facturas={facturasSeleccionadas}
        guarderiaCondicionIva={guarderiaCondicionIva}
      />
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Ventas</h1>
          <p className="page-subtitle mt-1">Gestión de comprobantes y cobros</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ background: '#175861' }}
              >
                <Plus className="h-4 w-4" />
                Nuevo comprobante
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                disabled={!puedeFacturar}
                title={
                  !puedeFacturar
                    ? 'Configurá los datos de facturación y confirmá el certificado ARCA para poder facturar.'
                    : undefined
                }
                onSelect={() => setNuevaOpen(true)}
              >
                Facturación manual
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!puedeFacturar}
                title={
                  !puedeFacturar
                    ? 'Configurá los datos de facturación y confirmá el certificado ARCA para poder facturar.'
                    : undefined
                }
                onSelect={() => setLoteOpen(true)}
              >
                Facturación por lote
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!internosHabilitados}
                title={
                  !internosHabilitados
                    ? 'Habilitá al menos un medio de pago para comprobantes internos en Mi Perfil → Datos Impositivos → Gestión de cobranza.'
                    : undefined
                }
                onSelect={() => setComprobanteInternoOpen(true)}
              >
                Comprobante interno manual
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!internosHabilitados}
                title={
                  !internosHabilitados
                    ? 'Habilitá al menos un medio de pago para comprobantes internos en Mi Perfil → Datos Impositivos → Gestión de cobranza.'
                    : undefined
                }
                onSelect={() => setComprobanteInternoLoteOpen(true)}
              >
                Comprobante interno por lote
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!puedeFacturar && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Emisión bloqueada.</strong>{' '}
          {!posConfigurado ? (
            <>
              Andá a <strong>Mi perfil → Datos Impositivos</strong> y completá los datos del POS
              antes de emitir facturas.
            </>
          ) : (
            <>
              El certificado de enlace con ARCA todavía no está confirmado. Andá a{' '}
              <strong>Mi perfil → Datos Impositivos</strong>, solicitá el certificado y confirmá la
              instalación.
            </>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={String(kpis.pendientes)} label="Pendientes de cobro" />
        <KpiCard value={String(kpis.pagadasMes)} label="Cobradas este mes" />
        <KpiCard value={String(kpis.vencidas)} label="Vencidas" />
        <KpiCard value={fmtMoney(kpis.totalFacturado)} label="Total facturado" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('afip')}
          className={`px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'afip'
              ? 'border-b-2 border-[#175861] text-[#175861]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Comprobantes ARCA
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {facturas.filter((f) => f.tipoFactura !== 'recibo').length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('recibos')}
          className={`px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'recibos'
              ? 'border-b-2 border-[#175861] text-[#175861]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Comprobantes internos
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {
              facturas.filter(
                (f) => f.tipoFactura === 'recibo' || f.tipoFactura === 'nota_credito_interna',
              ).length
            }
          </span>
        </button>
      </div>

      {/* Tabla afip / recibos */}
      {(activeTab === 'afip' || activeTab === 'recibos') && (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="space-y-3 border-b border-gray-100 p-4">
            {/* Fila 1: búsqueda + exportar */}
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por número, cliente o descripción..."
                className="h-10 flex-1 rounded-[10px] border border-gray-200 bg-white px-4 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
              />
              <button
                onClick={exportarCSV}
                disabled={(activeTab === 'afip' ? filtradosAfip : filtradosRecibos).length === 0}
                title="Exportar CSV"
                className="flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
              >
                <FileDown className="h-4 w-4" />
                <span className="hidden sm:inline">Exportar</span>
              </button>
            </div>
            {/* Fila 2: filtros */}
            <div className="flex flex-wrap gap-2">
              {activeTab === 'afip' && (
                <>
                  <select
                    value={filterEstado}
                    onChange={(e) => setFilterEstado(e.target.value)}
                    className="h-9 rounded-[8px] border border-gray-200 bg-white px-3 text-sm text-gray-600 focus:border-[#175861] focus:outline-none"
                  >
                    <option value="">Todos los estados</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="pagada">Cobrada</option>
                    <option value="vencida">Vencida</option>
                  </select>
                  <select
                    value={filterTipo}
                    onChange={(e) => setFilterTipo(e.target.value)}
                    className="h-9 rounded-[8px] border border-gray-200 bg-white px-3 text-sm text-gray-600 focus:border-[#175861] focus:outline-none"
                  >
                    <option value="">Todos los tipos</option>
                    <option value="afip">Facturas ARCA</option>
                    <option value="nc">Notas de Crédito</option>
                  </select>
                </>
              )}
              <input
                type="date"
                value={filterDesde}
                onChange={(e) => setFilterDesde(e.target.value)}
                title="Desde"
                className="h-9 rounded-[8px] border border-gray-200 bg-white px-3 text-sm text-gray-600 focus:border-[#175861] focus:outline-none"
              />
              <input
                type="date"
                value={filterHasta}
                onChange={(e) => setFilterHasta(e.target.value)}
                title="Hasta"
                className="h-9 rounded-[8px] border border-gray-200 bg-white px-3 text-sm text-gray-600 focus:border-[#175861] focus:outline-none"
              />
              {(activeTab === 'afip' ? hasFiltrosAfip : hasFiltrosRecibos) && (
                <button
                  onClick={limpiarFiltros}
                  className="h-9 rounded-[8px] px-3 text-sm text-gray-400 transition hover:text-gray-600"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {activeTab === 'afip' ? (
            filtradosAfip.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-7 w-7 opacity-40" />}
                text={
                  hasFiltrosAfip
                    ? 'No se encontraron comprobantes con ese criterio.'
                    : 'Todavía no hay comprobantes ARCA emitidos.'
                }
              />
            ) : (
              <>
                {selectedNc.size > 0 && (
                  <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-[#F3F8F7] px-4 py-2.5">
                    <span className="text-sm font-medium text-[#175861]">
                      {selectedNc.size} seleccionada{selectedNc.size === 1 ? '' : 's'}
                    </span>
                    {selectedNc.size > 1 && (
                      <button
                        onClick={() => setLoteNcOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
                        style={{ background: '#175861' }}
                      >
                        <CornerDownLeft className="h-4 w-4" />
                        Emitir NC en lote
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedNc(new Set())}
                      className="text-sm text-gray-500 transition hover:text-gray-700"
                    >
                      Limpiar selección
                    </button>
                  </div>
                )}
                <TablaScrollX>
                  <table className="w-full min-w-[2300px] text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                        <th className="w-10 px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label="Seleccionar todas las facturas elegibles"
                            className="h-4 w-4 cursor-pointer accent-[#175861] disabled:opacity-40"
                            disabled={elegiblesNc.length === 0}
                            checked={
                              elegiblesNc.length > 0 &&
                              elegiblesNc.every((f) => selectedNc.has(f.id))
                            }
                            onChange={toggleTodosNc}
                          />
                        </th>
                        <th className="px-4 py-3">Ente emisor</th>
                        <th className="px-4 py-3">CUIT emisor</th>
                        <th className="px-4 py-3">Nº Op. SC</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Tipo comprobante</th>
                        <th className="px-4 py-3">Letra</th>
                        <th className="px-4 py-3">Número de comprobante legal</th>
                        <th className="px-4 py-3">Nº Socio</th>
                        <th className="px-4 py-3">Razón social</th>
                        <th className="px-4 py-3">CUIT/CUIL</th>
                        <th className="px-4 py-3">Vencimiento</th>
                        <th className="px-4 py-3">CAE</th>
                        <th className="px-4 py-3">Venc. CAE</th>
                        <th className="px-4 py-3">Período</th>
                        <th className="px-4 py-3 text-right">Neto</th>
                        <th className="px-4 py-3 text-right">Exento</th>
                        <th className="px-4 py-3 text-right">IVA</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-center">Estado envío ARCA</th>
                        <th className="px-4 py-3 text-center">Estado de cobro</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {afipPaginados.map((f) => {
                        const eligible = esNcEligible(f);
                        return (
                          <tr
                            key={f.id}
                            className={`border-t border-gray-100 transition hover:bg-gray-50/50 ${
                              selectedNc.has(f.id) ? 'bg-[#F3F8F7]' : ''
                            }`}
                          >
                            <td className="w-10 px-4 py-3">
                              <input
                                type="checkbox"
                                aria-label={`Seleccionar comprobante ${f.codigo ?? ''}`}
                                className="h-4 w-4 cursor-pointer accent-[#175861] disabled:cursor-not-allowed disabled:opacity-30"
                                disabled={!eligible}
                                title={
                                  eligible
                                    ? 'Seleccionar para NC en lote'
                                    : 'No elegible (no es factura ARCA con CAE, o ya tiene NC)'
                                }
                                checked={selectedNc.has(f.id)}
                                onChange={() => toggleNc(f.id)}
                              />
                            </td>
                            <td className="px-4 py-3 text-gray-500">{f.entreEmisor}</td>
                            <td className="px-4 py-3 text-gray-500">{f.entreEmisorCuit}</td>
                            <td className="px-4 py-3 text-gray-500">{f.numeroOperacionSC}</td>
                            <td className="px-4 py-3 text-gray-500">{fmtDate(f.emision)}</td>
                            {/* Solo la sigla (FC/NC/ND) — la letra va en su columna. */}
                            <td className="px-4 py-3 text-gray-500">
                              {tipoSiglaSinLetra(f.tipoFactura)}
                            </td>
                            <td className="px-4 py-3 text-gray-500">{f.letra}</td>
                            <td className="px-4 py-3 font-medium" style={{ color: '#101828' }}>
                              {f.codigo ?? '—'}
                              {f.folioLocal && (
                                <div className="text-xs font-normal text-gray-400">
                                  {f.folioLocal}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-500">{f.socioNumeroSocio ?? '—'}</td>
                            <td className="px-4 py-3 font-medium" style={{ color: '#175861' }}>
                              {f.socioRazonSocial}
                            </td>
                            <td className="px-4 py-3 text-gray-500">{f.socioCuitDni}</td>
                            <td className="px-4 py-3 text-gray-500">{fmtDate(f.vencimiento)}</td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-500">
                              {f.cae ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {f.caeVencimiento ? fmtYmd(f.caeVencimiento) : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {f.desde ? (
                                <div>
                                  <div>Desde {fmtDate(f.desde)}</div>
                                  <div>Hasta {fmtDate(f.hasta)}</div>
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">
                              {f.montoNeto ? fmtMoney(f.montoNeto) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">
                              {f.montoExento ? fmtMoney(f.montoExento) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">
                              {f.montoIva ? fmtMoney(f.montoIva) : '—'}
                            </td>
                            <td
                              className="px-4 py-3 text-right font-medium"
                              style={{ color: '#101828' }}
                            >
                              {fmtMoney(f.importe)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {f.rechazada ? (
                                <span
                                  title={f.motivoError ?? undefined}
                                  className="inline-block cursor-help rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700"
                                >
                                  Rechazado
                                </span>
                              ) : (
                                <span className="inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-[#175861]">
                                  Aceptado
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                                  ESTADO_BADGE[f.estado ?? 'pendiente'] ??
                                  'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {ESTADO_LABEL[f.estado ?? 'pendiente'] ?? f.estado}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setPagarFactura(f)}
                                  disabled={f.estado === 'pagada'}
                                  title="Marcar como cobrada"
                                  className="rounded-[6px] p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-[#175861] disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                                {/* Enviar por email (antes duplicaba "Ver PDF"):
                                    manda el comprobante al mail del socio con
                                    el PDF de ARCA adjunto. */}
                                <button
                                  onClick={() => enviarMailFactura(f)}
                                  disabled={!f.codigo || enviandoMailId === f.id}
                                  title={
                                    !f.codigo
                                      ? 'Sin comprobante ARCA para enviar'
                                      : enviandoMailId === f.id
                                        ? 'Enviando…'
                                        : 'Enviar comprobante por email'
                                  }
                                  className="rounded-[6px] p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-[#175861] disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                  <Send className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => abrirPdfFactura(f)}
                                  disabled={!f.codigo}
                                  title={f.codigo ? 'Ver / Descargar PDF' : 'PDF no disponible'}
                                  className="rounded-[6px] p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-[#175861] disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                {f.rechazada &&
                                (f.tipoFactura === 'factura_a' ||
                                  f.tipoFactura === 'factura_b' ||
                                  f.tipoFactura === 'factura_c') ? (
                                  <button
                                    onClick={() => setReenviarFactura(f)}
                                    title="Reenviar factura rechazada"
                                    className="rounded-[6px] p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                                  >
                                    <RefreshCw className="h-4 w-4" />
                                  </button>
                                ) : null}
                                {(f.tipoFactura === 'factura_a' ||
                                  f.tipoFactura === 'factura_b' ||
                                  f.tipoFactura === 'factura_c') &&
                                f.cae ? (
                                  <button
                                    onClick={() => setNcFactura(f)}
                                    title="Emitir Nota de Crédito o Débito"
                                    className="rounded-[6px] p-1.5 text-gray-400 transition hover:bg-amber-50 hover:text-amber-600"
                                  >
                                    <CornerDownLeft className="h-4 w-4" />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TablaScrollX>
                <Pagination
                  page={afipPage}
                  totalItems={filtradosAfip.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                />
              </>
            )
          ) : // Tab: Comprobantes internos
          filtradosRecibos.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-7 w-7 opacity-40" />}
              text={
                hasFiltrosRecibos
                  ? 'No se encontraron comprobantes con ese criterio.'
                  : 'Todavía no hay comprobantes internos emitidos.'
              }
            />
          ) : (
            <>
              <TablaScrollX>
                <table className="w-full min-w-[1700px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                      <th className="px-4 py-3">Ente emisor</th>
                      <th className="px-4 py-3">CUIT emisor</th>
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Nº Op. SC</th>
                      <th className="px-4 py-3">Nº Socio</th>
                      <th className="px-4 py-3">Razón social</th>
                      <th className="px-4 py-3">CUIT/CUIL</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3 text-right">Neto</th>
                      <th className="px-4 py-3 text-right">Exento</th>
                      <th className="px-4 py-3 text-right">IVA</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recibosPaginados.map((f) => (
                      <tr
                        key={f.id}
                        className="border-t border-gray-100 transition hover:bg-gray-50/50"
                      >
                        <td className="px-4 py-3 text-gray-500">{f.entreEmisor}</td>
                        <td className="px-4 py-3 text-gray-500">{f.entreEmisorCuit}</td>
                        <td className="px-4 py-3 font-medium" style={{ color: '#101828' }}>
                          {f.codigo ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{tipoComprobanteLabel(f)}</td>
                        <td className="px-4 py-3 text-gray-500">{f.numeroOperacionSC}</td>
                        <td className="px-4 py-3 text-gray-500">{f.socioNumeroSocio ?? '—'}</td>
                        <td className="px-4 py-3 font-medium" style={{ color: '#175861' }}>
                          {f.socioRazonSocial}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{f.socioCuitDni}</td>
                        <td className="px-4 py-3 text-gray-500">{fmtDate(f.emision)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {f.montoNeto ? fmtMoney(f.montoNeto) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {f.montoExento ? fmtMoney(f.montoExento) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {f.montoIva ? fmtMoney(f.montoIva) : '—'}
                        </td>
                        <td
                          className="px-4 py-3 text-right font-medium"
                          style={{ color: '#101828' }}
                        >
                          {fmtMoney(f.importe)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {(f.codigo?.startsWith('CM-') || f.codigo?.startsWith('CL-')) &&
                              (() => {
                                const agotado =
                                  (acreditadoNcPorFactura.get(f.id) ?? 0) >=
                                  parseFloat(f.importe ?? '0') - 0.001;
                                return (
                                  <button
                                    type="button"
                                    onClick={() => setNcInternaComprobante(f)}
                                    disabled={agotado}
                                    title={
                                      agotado
                                        ? 'Ya acreditado por completo por NC internas'
                                        : 'Emitir Nota de Crédito interna'
                                    }
                                    className="rounded-[6px] p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-[#175861] disabled:opacity-30 disabled:hover:bg-transparent"
                                  >
                                    <CornerDownLeft className="h-4 w-4" />
                                  </button>
                                );
                              })()}
                            <a
                              href={`/ventas/recibo/${f.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Ver / Imprimir recibo"
                              className="rounded-[6px] p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-[#175861]"
                            >
                              <Printer className="h-4 w-4" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TablaScrollX>
              <Pagination
                page={recibosPage}
                totalItems={filtradosRecibos.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
