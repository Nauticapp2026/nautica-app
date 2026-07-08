'use client';

import { Fragment, useState, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  User,
  Anchor,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Users,
  Clock,
  FileText,
  Package,
  Pencil,
  Ship,
  Star,
  TrendingUp,
  AlertTriangle,
  Eye,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { updateMovimientoAction } from '@/app/actions/movimientos';
import { cargarServicioAction } from '@/app/actions/facturacion';
import {
  createEmbarcacionAction,
  deleteEmbarcacionAction,
  setPrincipalAction,
  updateEmbarcacionAction,
} from '@/app/actions/embarcaciones';
import { assignEspacioToSocioAction, moveOcupanteAction } from '@/app/actions/espacios';
import { toast } from 'sonner';
import {
  deleteSocioAction,
  deleteSocioDocumentoAction,
  toggleFacturaFiscalAction,
  updateNumeroSocioAction,
  updateSocioAction,
  updateSocioServicioAction,
  updateSocioStatusAction,
  uploadSocioDocumentoAction,
} from '@/app/actions/socios';
import {
  guardarTarjetaSocioAction,
  eliminarTarjetaSocioAction,
  type GuardarTarjetaData,
} from '@/app/actions/payway';
import { formatArgentinaDate, formatArgentinaDateTime, formatNaiveDateTime } from '@/lib/dates';
import { precioConIva, precioSinIva } from '@/lib/iva';
import { ASTILLEROS } from '../astilleros';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import {
  inputCls,
  Field,
  sanitizeMontoInput,
  montoToNumberStr,
} from '@/components/shared/forma-pago';

// ─── Types ───────────────────────────────────────────────────────────────────

type SocioData = {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
  telefono: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  direccion: string | null;
  ciudad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  contactoEmergencia: string | null;
  razonSocial: string | null;
  cuit: string | null;
  direccionFiscal: string | null;
  condicionIva: string | null;
  condicionIvaPersonal: string | null;
  condicionIibb: string | null;
  emailFacturacion: string | null;
  estadoSocio: string | null;
  deuda: string | null;
  memberSince: string;
  membershipStatus: 'active' | 'suspended' | 'removed' | 'inactivo' | null;
  numeroSocio: number | null;
  facturaFiscal: boolean;
};

type Embarcacion = {
  id: string;
  nombre: string;
  matricula: string | null;
  astillero: string | null;
  modelo: string | null;
  seguro: string | null;
  esloraM: string | null;
  esPrincipal: boolean;
  espacioId: string | null;
  espacioLabel: string | null;
};

type Movimiento = {
  id: string;
  fecha: string | null;
  concepto: string | null;
  tipo: string | null;
  estado: string | null;
  debe: string | null;
  haber: string | null;
  servicioNombre: string | null;
  servicioId: string | null;
  servicioTipo: string | null;
  servicioTipoCobro: 'fijo' | 'variable' | null;
  servicioAlicuotaIva: string | null;
  plazoPagoDias: number | null;
  facturaCodigo: string | null;
  facturaArchivo: string | null;
  facturaTipo: string | null;
  comprobanteInterno: boolean;
  // Fecha de vencimiento (YYYY-MM-DD) = emisión de factura + plazo de pago de la
  // tarifa. Null si el cargo no está facturado (o es comprobante interno).
  fechaVencimiento: string | null;
};

type Servicio = {
  id: string;
  nombre: string;
  precio: string | null;
  alicuotaIva: string | null;
};

// Servicio Contratado: un registro por contrato (socio + servicio), con su
// propia ventana de vigencia — no confundir con `Movimiento` (un cobro).
type ServicioContratado = {
  id: string;
  servicioId: string;
  servicioNombre: string | null;
  servicioTipo: string | null;
  servicioTipoCobro: 'fijo' | 'variable' | null;
  servicioPrecio: string | null;
  servicioAlicuotaIva: string | null;
  servicioPoliticaBajaAnticipada: 'mes_completo' | 'proporcional';
  espacioId: string | null;
  numeroOperacion: number;
  fechaAsignacion: string;
  fechaInicio: string;
  fechaBaja: string | null;
};

type Navegante = {
  id: string;
  nombre: string;
  apellido: string | null;
  estado: string | null;
  desde: string | null;
  hasta: string | null;
  arribadaEn: string | null;
  createdAt: string;
  esNavegante: boolean;
};

type InvitadoSocio = {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
  dni: string | null;
  motivo: string | null;
  tipo: string | null;
  estado: string | null;
  validoHasta: string | null;
  createdAt: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const CONDICION_IVA_OPTS = [
  { value: 'responsable_inscripto', label: 'IVA Responsable Inscripto' },
  { value: 'exento', label: 'IVA Sujeto Exento' },
  { value: 'monotributo', label: 'Responsable Monotributo' },
  { value: 'consumidor_final', label: 'Consumidor Final' },
  { value: 'proveedor_exterior', label: 'Proveedor del Exterior' },
  { value: 'cliente_exterior', label: 'Cliente del Exterior' },
  { value: 'iva_no_alcanzado', label: 'IVA No Alcanzado' },
];

const CONDICION_IIBB_OPTS = [
  { value: 'convenio_multilateral', label: 'Convenio Multilateral' },
  { value: 'local', label: 'Local' },
  { value: 'exento', label: 'Exento' },
  { value: 'no_gravado', label: 'No Gravado' },
  { value: 'no_corresponde', label: 'No Corresponde' },
];

const TIPO_DOC_OPTS = [
  { value: 'dni', label: 'DNI' },
  { value: 'cuit', label: 'CUIT' },
  { value: 'cuil', label: 'CUIL' },
  { value: 'pasaporte', label: 'Pasaporte' },
  { value: 'cdi', label: 'CDI' },
];

const TABS = [
  { id: 'generales', label: 'Generales', icon: User },
  { id: 'impositivos', label: 'Datos Impositivos', icon: FileText },
  { id: 'embarcacion', label: 'Embarcación', icon: Anchor },
  { id: 'servicios-contratados', label: 'Servicios Contratados', icon: Package },
  { id: 'cuenta-corriente', label: 'Cuenta Corriente', icon: CreditCard },
  { id: 'navegantes', label: 'Accesos Externos', icon: Users },
  { id: 'invitados', label: 'Invitados', icon: UserCheck },
  { id: 'salidas', label: 'Salidas', icon: Clock },
  { id: 'documentacion', label: 'Documentación', icon: FileText },
  { id: 'payway', label: 'Débito automático', icon: CreditCard },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number) {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

const fmtDate = formatArgentinaDate;

function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Formatea una fecha-calendario "YYYY-MM-DD" como "DD/MM/YYYY" sin pasar por
// new Date() (que la interpretaría como medianoche UTC y restaría un día en AR).
function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

const ESTADO_BADGE: Record<string, string> = {
  pagado: 'bg-gray-900 text-white',
  parcial: 'bg-blue-50 text-blue-700',
  facturado: 'bg-amber-50 text-amber-700',
  no_pagado: 'bg-amber-50 text-amber-700',
  vencido: 'bg-red-100 text-red-700',
};

const MEMBERSHIP_STATUS_CLASSES: Record<'active' | 'inactivo', string> = {
  active: 'border-green-200 bg-green-50 text-green-700',
  inactivo: 'border-gray-200 bg-gray-100 text-gray-500',
};

const MEMBERSHIP_STATUS_LABEL: Record<'active' | 'inactivo', string> = {
  active: 'Activo',
  inactivo: 'Inactivo',
};

const ESTADO_LABEL: Record<string, string> = {
  pagado: 'Pagado',
  parcial: 'Parcial',
  facturado: 'Pendiente',
  no_pagado: 'Pendiente',
  vencido: 'Vencido',
};

// Agrega a cada movimiento (orden desc: más nuevo primero) el saldo acumulado y
// el estado MOSTRADO. Un cargo figura "Pagado" cuando los pagos (haber) alcanzan
// a cubrirlo, "Parcial" cuando lo cobrado es menor al total del cargo, y
// "Pendiente" cuando todavía no se le asignó ningún pago — asignando del más
// viejo al más nuevo (FIFO). Es cálculo de display: no cambia el estado
// guardado (la facturación sigue mirando el real). No confundir con la
// columna "Situación" (En Plazo / Vencido), que compara la fecha de
// vencimiento contra hoy — son dos ejes independientes.
//
// Un cargo ya `pagado` (cobranza/Payway/factura marcada pagada) CONSUME su parte
// del pool de haberes: su pago ya está comprometido con ese cargo. Si no se
// descontara, ese haber quedaría como "crédito fantasma" cubriendo otros cargos
// más nuevos y mostrándolos pagados de más (doble conteo). Así el total de cargos
// que figuran impagos queda consistente con el saldo neto (Σdebe − Σhaber).
function calcularSaldoYEstado<
  T extends { debe: string | null; haber: string | null; estado: string | null },
>(movimientos: T[]): (T & { saldo: number; estadoDisplay: string | null })[] {
  const asc = [...movimientos].reverse();
  let acum = 0;
  let poolHaber = movimientos.reduce((acc, m) => acc + parseFloat(m.haber ?? '0'), 0);
  const conSaldo = asc.map((m) => {
    const venta = parseFloat(m.debe ?? '0');
    const cobranza = parseFloat(m.haber ?? '0');
    acum = acum + venta - cobranza;
    let estadoDisplay = m.estado;
    if (venta > 0) {
      if (m.estado === 'pagado') {
        // Ya pagado: consume el pool (su haber está comprometido), no se reescribe.
        poolHaber -= venta;
      } else if (poolHaber >= venta - 0.001) {
        // Cubierto por cobertura FIFO.
        estadoDisplay = 'pagado';
        poolHaber -= venta;
      } else if (poolHaber > 0.001) {
        // Cubierto solo en parte: consume todo el pool restante y no alcanza
        // para el resto de este cargo ni para ningún otro más nuevo.
        estadoDisplay = 'parcial';
        poolHaber = 0;
      }
    }
    return { ...m, saldo: acum, estadoDisplay };
  });
  return conSaldo.reverse();
}

// Etiquetas de tipo de comprobante para la columna/filtro de cuenta corriente.
const TIPO_COMPROBANTE_LABEL: Record<string, string> = {
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  recibo: 'Recibo',
  nota_credito_a: 'Nota de crédito A',
  nota_credito_b: 'Nota de crédito B',
  nota_credito_c: 'Nota de crédito C',
};

// Categorías del Tarifario (tipoServicioEnum) — mismos labels que tarifario-client.tsx.
const CATEGORIA_SERVICIO_LABEL: Record<string, string> = {
  espacio_guarda: 'Espacio de guarda',
  cuota_social: 'Cuota social',
  membresia: 'Membresía',
  expensas_ordinarias: 'Expensas ordinarias',
  expensas_extraordinarias: 'Expensas extraordinarias',
  servicio_extra: 'Servicio extra',
};

// ─── Agregar Servicio Modal ───────────────────────────────────────────────────

function AgregarServicioModal({
  open,
  onClose,
  socioId,
  socioNombre,
  servicios,
}: {
  open: boolean;
  onClose: () => void;
  socioId: string;
  socioNombre: string;
  servicios: Servicio[];
}) {
  const router = useRouter();
  const [servicioId, setServicioId] = useState('');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayISODate);
  const [fechaInicio, setFechaInicio] = useState(todayISODate);
  const [fechaBaja, setFechaBaja] = useState('');
  const [comprobante, setComprobante] = useState<'interno' | 'fiscal'>('interno');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ comprobante: 'interno' | 'fiscal' } | null>(null);
  const [isPending, startTransition] = useTransition();

  const isValid = Boolean(servicioId && monto && fechaInicio);

  function handleServicioChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setServicioId(id);
    const s = servicios.find((s) => s.id === id);
    if (s?.precio) {
      const conIva = precioConIva(parseFloat(s.precio), parseFloat(s.alicuotaIva ?? '0'));
      setMonto(conIva.toFixed(2));
    }
  }

  function handleClose() {
    setServicioId('');
    setConcepto('');
    setMonto('');
    setFecha(todayISODate());
    setFechaInicio(todayISODate());
    setFechaBaja('');
    setComprobante('interno');
    setError(null);
    setResult(null);
    onClose();
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await cargarServicioAction({
        socioId,
        servicioId,
        concepto,
        monto: montoToNumberStr(monto),
        fecha,
        comprobante,
        fechaInicio,
        fechaBaja: fechaBaja || null,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult({ comprobante: res.comprobante! });
        router.refresh();
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Cargar Servicio
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Registrá un servicio del tarifario para {socioNombre}
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
            <div className="flex items-start gap-3 rounded-[10px] bg-teal-50 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
              <div>
                <p className="font-semibold text-teal-900">Servicio cargado</p>
                {result.comprobante === 'interno' ? (
                  <p className="text-sm text-teal-700">
                    Marcado como no fiscal. Vas a poder emitirle un Comprobante interno desde
                    Ventas.
                  </p>
                ) : (
                  <p className="text-sm text-teal-700">
                    Se facturará por ARCA (manual o automático), como el resto.
                  </p>
                )}
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
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Servicio
                </label>
                <select className={inputCls} value={servicioId} onChange={handleServicioChange}>
                  <option value="">Seleccione un servicio</option>
                  {servicios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                      {s.precio
                        ? ` — ${fmt(precioConIva(parseFloat(s.precio), parseFloat(s.alicuotaIva ?? '0')))}`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Detalle del servicio
                </label>
                <input
                  className={inputCls}
                  placeholder="Descripción opcional"
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Monto
                  </label>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={monto}
                    onChange={(e) => setMonto(sanitizeMontoInput(e.target.value))}
                  />
                </div>
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
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Fecha de inicio del servicio
                  </label>
                  <input
                    type="date"
                    max={todayISODate()}
                    className={inputCls}
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Fecha de baja <span className="font-normal text-gray-400">(opcional)</span>
                  </label>
                  <input
                    type="date"
                    max={todayISODate()}
                    min={fechaInicio}
                    className={inputCls}
                    value={fechaBaja}
                    onChange={(e) => setFechaBaja(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Comprobante
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setComprobante('interno')}
                    className={`rounded-[10px] border px-3 py-2.5 text-sm font-medium transition ${
                      comprobante === 'interno'
                        ? 'border-[#175861] bg-[#EFF8F7] text-[#175861]'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Interno
                  </button>
                  <button
                    type="button"
                    onClick={() => setComprobante('fiscal')}
                    className={`rounded-[10px] border px-3 py-2.5 text-sm font-medium transition ${
                      comprobante === 'fiscal'
                        ? 'border-[#175861] bg-[#EFF8F7] text-[#175861]'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Fiscal (ARCA)
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  {comprobante === 'interno'
                    ? 'Marca el cargo como no fiscal (NO se factura por ARCA). Podés emitirle un Comprobante interno desde Ventas cuando quieras.'
                    : 'El cargo se factura por ARCA después (manual o automático), como el resto.'}
                </p>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
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
                  disabled={isPending || !isValid}
                  className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: '#175861' }}
                >
                  {isPending ? 'Guardando...' : 'Cargar Servicio'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export type DocumentoItem = {
  id: string;
  nombre: string;
  tipo: 'carnet_nautico' | 'matricula' | 'seguro' | null;
  createdAt: string;
  signedUrl: string | null;
};

const TIPO_DOC_LABEL: Record<'carnet_nautico' | 'matricula' | 'seguro', string> = {
  carnet_nautico: 'Certificado Náutico',
  matricula: 'Matrícula',
  seguro: 'Seguro',
};

export type SalidaItem = {
  id: string;
  desde: string | null;
  hasta: string | null;
  arribadaEn: string | null;
  estado: 'activo' | 'usado' | 'revocado' | null;
  motivo: string | null;
  embarcacion: string | null;
  createdAt: string;
};

const fmtFechaHoraSalida = formatArgentinaDateTime;

// ─── Embarcaciones tab ───────────────────────────────────────────────────────

function EspacioEmbarcacionRow({
  socioId,
  emb,
  espaciosDisponibles,
}: {
  socioId: string;
  emb: Embarcacion;
  espaciosDisponibles: EspacioOption[];
}) {
  const router = useRouter();
  const [destinoId, setDestinoId] = useState('');
  const [pending, startTransition] = useTransition();

  const tieneEspacio = emb.espacioId != null;

  // Filtrar espacios cuya eslora >= eslora del barco (en metros).
  const esloraBarcoM = emb.esloraM != null ? Number(emb.esloraM) : null;
  const espaciosFiltrados =
    esloraBarcoM != null
      ? espaciosDisponibles.filter((e) => {
          if (e.eslora == null) return true;
          const esloraEspacioM =
            e.unidadMetraje === 'pies' ? Number(e.eslora) * 0.3048 : Number(e.eslora);
          return esloraEspacioM + 0.01 >= esloraBarcoM;
        })
      : espaciosDisponibles;

  function submit() {
    if (!destinoId) {
      toast.error('Seleccioná un espacio.');
      return;
    }
    startTransition(async () => {
      const res = tieneEspacio
        ? await moveOcupanteAction({ origenId: emb.espacioId!, destinoId })
        : await assignEspacioToSocioAction({
            socioId,
            espacioId: destinoId,
            embarcacionId: emb.id,
          });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(tieneEspacio ? 'Espacio cambiado.' : 'Espacio asignado.');
      setDestinoId('');
      router.refresh();
    });
  }

  if (espaciosFiltrados.length === 0 && !tieneEspacio) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
      <select
        value={destinoId}
        onChange={(e) => setDestinoId(e.target.value)}
        disabled={pending}
        className="h-10 flex-1 rounded-[10px] border border-gray-200 bg-white px-3 text-sm text-[#101828] focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none disabled:opacity-50"
      >
        <option value="">{tieneEspacio ? 'Cambiar espacio…' : 'Asignar espacio…'}</option>
        {espaciosFiltrados.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
            {e.precio
              ? ` — $${precioConIva(Number(e.precio), Number(e.alicuotaIva ?? 0)).toLocaleString('es-AR')}`
              : ''}
          </option>
        ))}
      </select>
      <button
        onClick={submit}
        disabled={!destinoId || pending}
        className="shrink-0 rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: '#175861' }}
      >
        {pending ? 'Guardando…' : tieneEspacio ? 'Cambiar' : 'Asignar'}
      </button>
    </div>
  );
}

const EMBARCACION_VACIA = {
  nombre: '',
  matricula: '',
  astillero: '',
  modelo: '',
  seguro: '',
  esloraM: '',
};

function EmbarcacionesTab({
  socioId,
  embarcaciones,
  espaciosDisponibles,
}: {
  socioId: string;
  embarcaciones: Embarcacion[];
  espaciosDisponibles: EspacioOption[];
}) {
  const router = useRouter();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [form, setForm] = useState(EMBARCACION_VACIA);
  const [astilleroSel, setAstilleroSel] = useState('');
  const [esPrincipalNueva, setEsPrincipalNueva] = useState(false);
  const [esloraUnidad, setEsloraUnidad] = useState<'m' | 'ft'>('m');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const hayMultiples = embarcaciones.length > 1;

  function startEdit(e: Embarcacion) {
    setError(null);
    setEditandoId(e.id);
    setAgregando(false);
    setEsloraUnidad('m');
    const ast = e.astillero ?? '';
    const sel = ASTILLEROS.includes(ast as (typeof ASTILLEROS)[number]) ? ast : ast ? 'Otro' : '';
    setAstilleroSel(sel);
    setForm({
      nombre: e.nombre,
      matricula: e.matricula ?? '',
      astillero: ast,
      modelo: e.modelo ?? '',
      seguro: e.seguro ?? '',
      esloraM: e.esloraM ?? '',
    });
  }

  function cancel() {
    setEditandoId(null);
    setAgregando(false);
    setForm(EMBARCACION_VACIA);
    setAstilleroSel('');
    setEsloraUnidad('m');
    setEsPrincipalNueva(false);
    setError(null);
  }

  function startAgregar() {
    setError(null);
    setEditandoId(null);
    setForm(EMBARCACION_VACIA);
    setEsloraUnidad('m');
    setEsPrincipalNueva(false);
    setAgregando(true);
  }

  function setField(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({
        ...f,
        [k]: k === 'matricula' ? e.target.value.toUpperCase() : e.target.value,
      }));
  }

  function switchEsloraUnidad(nueva: 'm' | 'ft') {
    if (nueva === esloraUnidad) return;
    setForm((f) => {
      const n = parseFloat(f.esloraM);
      if (!f.esloraM || isNaN(n)) return f;
      const converted = nueva === 'ft' ? n * 3.28084 : n * 0.3048;
      return { ...f, esloraM: converted.toFixed(2) };
    });
    setEsloraUnidad(nueva);
  }

  function esloraParaGuardar(): string {
    if (esloraUnidad === 'm') return form.esloraM;
    const n = parseFloat(form.esloraM);
    if (isNaN(n)) return '';
    return (n * 0.3048).toFixed(2);
  }

  function guardarEdicion(id: string) {
    setError(null);
    startSaving(async () => {
      const res = await updateEmbarcacionAction({ id, ...form, esloraM: esloraParaGuardar() });
      if (res.error) {
        setError(res.error);
        return;
      }
      cancel();
      router.refresh();
    });
  }

  function guardarNueva() {
    setError(null);
    startSaving(async () => {
      const res = await createEmbarcacionAction({
        socioId,
        ...form,
        esloraM: esloraParaGuardar(),
        esPrincipal: esPrincipalNueva,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      cancel();
      router.refresh();
    });
  }

  function eliminar(id: string) {
    setError(null);
    startSaving(async () => {
      const res = await deleteEmbarcacionAction(id);
      if (res.error) {
        setError(res.error);
        setConfirmDeleteId(null);
        return;
      }
      setConfirmDeleteId(null);
      router.refresh();
    });
  }

  function hacerPrincipal(id: string) {
    startSaving(async () => {
      const res = await setPrincipalAction(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  // ── Bloque de campos reutilizado en edición y alta ──
  const camposForm = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">Nombre</label>
        <input className={inputCls} value={form.nombre} onChange={setField('nombre')} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">Matrícula</label>
        <input className={inputCls} value={form.matricula} onChange={setField('matricula')} />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">Astillero</label>
        <select
          className={inputCls}
          value={astilleroSel}
          onChange={(e) => {
            const v = e.target.value;
            setAstilleroSel(v);
            if (v !== 'Otro') setForm((f) => ({ ...f, astillero: v }));
            else setForm((f) => ({ ...f, astillero: '' }));
          }}
        >
          <option value="">Seleccionar…</option>
          {ASTILLEROS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
          <option value="Otro">Otro</option>
        </select>
        {astilleroSel === 'Otro' && (
          <input
            className={`${inputCls} mt-2`}
            placeholder="Escribí el astillero"
            value={form.astillero}
            onChange={(e) => setForm((f) => ({ ...f, astillero: e.target.value }))}
          />
        )}
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">Modelo</label>
        <input className={inputCls} value={form.modelo} onChange={setField('modelo')} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">Seguro</label>
        <input className={inputCls} value={form.seguro} onChange={setField('seguro')} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">Eslora</label>
        <div className="flex gap-2">
          <input
            className={inputCls}
            type="number"
            min="0"
            step="0.01"
            placeholder={esloraUnidad === 'm' ? 'ej: 9.50' : 'ej: 31.2'}
            value={form.esloraM}
            onChange={setField('esloraM')}
          />
          <div className="flex shrink-0 overflow-hidden rounded-[10px] border border-gray-200">
            <button
              type="button"
              onClick={() => switchEsloraUnidad('m')}
              className={`px-3 text-xs font-semibold transition ${
                esloraUnidad === 'm'
                  ? 'bg-[#175861] text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              m
            </button>
            <button
              type="button"
              onClick={() => switchEsloraUnidad('ft')}
              className={`px-3 text-xs font-semibold transition ${
                esloraUnidad === 'ft'
                  ? 'bg-[#175861] text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              ft
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Tarjeta por cada embarcación existente */}
      {embarcaciones.map((emb) => {
        const esteEditando = editandoId === emb.id;
        return (
          <div key={emb.id} className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
                  {esteEditando ? 'Editar embarcación' : emb.nombre}
                </p>
                {hayMultiples && emb.esPrincipal && !esteEditando && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                    <Star className="h-3 w-3 fill-teal-600 text-teal-600" />
                    Principal
                  </span>
                )}
              </div>
              {!esteEditando && !agregando && editandoId === null && (
                <button
                  onClick={() => startEdit(emb)}
                  className="shrink-0 justify-center rounded-[10px] border border-[#d1d5dc] px-4 py-2 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
                >
                  Editar
                </button>
              )}
              {esteEditando && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={cancel}
                    disabled={isSaving}
                    className="flex-1 justify-center rounded-[10px] border border-[#d1d5dc] px-4 py-2 text-sm font-medium text-[#364153] transition hover:bg-gray-50 disabled:opacity-40 sm:flex-none"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => guardarEdicion(emb.id)}
                    disabled={isSaving}
                    className="flex-1 justify-center rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40 sm:flex-none"
                    style={{ background: '#175861' }}
                  >
                    {isSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              )}
            </div>

            {esteEditando ? (
              <div className="space-y-4">
                {camposForm}
                {error && (
                  <div className="rounded-[10px] border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-medium text-red-700">{error}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                      Nombre
                    </label>
                    <p className="text-sm font-medium" style={{ color: '#101828' }}>
                      {emb.nombre}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                      Matrícula
                    </label>
                    <p className="text-sm" style={{ color: '#101828' }}>
                      {emb.matricula ?? '—'}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                      Astillero
                    </label>
                    <p className="text-sm" style={{ color: '#101828' }}>
                      {emb.astillero ?? '—'}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                      Modelo
                    </label>
                    <p className="text-sm" style={{ color: '#101828' }}>
                      {emb.modelo ?? '—'}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                      Seguro
                    </label>
                    <p className="text-sm" style={{ color: '#101828' }}>
                      {emb.seguro ?? '—'}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                      Eslora
                    </label>
                    <p className="text-sm" style={{ color: '#101828' }}>
                      {emb.esloraM ? `${emb.esloraM} m` : '—'}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                      Espacio
                    </label>
                    <p className="text-sm" style={{ color: '#101828' }}>
                      {emb.espacioLabel ?? '—'}
                    </p>
                  </div>
                </div>

                <EspacioEmbarcacionRow
                  socioId={socioId}
                  emb={emb}
                  espaciosDisponibles={espaciosDisponibles}
                />

                <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                  {hayMultiples && !emb.esPrincipal && (
                    <button
                      onClick={() => hacerPrincipal(emb.id)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#d1d5dc] bg-white px-3 py-1.5 text-xs font-medium text-[#364153] transition hover:bg-gray-50 disabled:opacity-40"
                    >
                      <Star className="h-3.5 w-3.5" />
                      Hacer principal
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDeleteId(emb.id)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Formulario de nueva embarcación */}
      {agregando && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Nueva embarcación
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={cancel}
                disabled={isSaving}
                className="flex-1 justify-center rounded-[10px] border border-[#d1d5dc] px-4 py-2 text-sm font-medium text-[#364153] transition hover:bg-gray-50 disabled:opacity-40 sm:flex-none"
              >
                Cancelar
              </button>
              <button
                onClick={guardarNueva}
                disabled={isSaving}
                className="flex-1 justify-center rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40 sm:flex-none"
                style={{ background: '#175861' }}
              >
                {isSaving ? 'Guardando...' : 'Crear'}
              </button>
            </div>
          </div>
          <div className="space-y-4">
            {camposForm}
            {embarcaciones.length >= 1 && (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={esPrincipalNueva}
                  onChange={(e) => setEsPrincipalNueva(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-[#175861]"
                />
                <span className="text-sm font-medium text-gray-700">Principal</span>
              </label>
            )}
            {error && (
              <div className="rounded-[10px] border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-medium text-red-700">{error}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {embarcaciones.length === 0 && !agregando && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          <EmptyState
            icon={<Ship className="h-7 w-7 opacity-40" />}
            text="Este socio no tiene embarcación registrada."
          />
        </div>
      )}

      {/* Botón agregar */}
      {!agregando && (
        <div className="flex justify-end">
          <button
            onClick={startAgregar}
            className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold text-white"
            style={{ background: '#175861' }}
          >
            <Plus className="h-4 w-4" />
            Agregar embarcación
          </button>
        </div>
      )}

      {/* Diálogo confirmar eliminación */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: '#101828' }}>
                  Eliminar embarcación
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Se va a eliminar la embarcación. Las tareas y salidas asociadas dejan de tener
                  referencia, pero no se borran.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={isSaving}
                className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] hover:bg-gray-50 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={() => eliminar(confirmDeleteId)}
                disabled={isSaving}
                className="flex-1 rounded-[10px] bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {isSaving ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Documentación tab ───────────────────────────────────────────────────────

const TIPO_DOC_OPTS_DETAIL: { value: 'carnet_nautico' | 'matricula' | 'seguro'; label: string }[] =
  [
    { value: 'carnet_nautico', label: 'Certificado Náutico' },
    { value: 'matricula', label: 'Matrícula' },
    { value: 'seguro', label: 'Seguro' },
  ];

function DocumentacionTab({
  socioId,
  documentos,
}: {
  socioId: string;
  documentos: DocumentoItem[];
}) {
  const router = useRouter();
  const [pendientes, setPendientes] = useState<
    { file: File; tipo: 'carnet_nautico' | 'matricula' | 'seguro' }[]
  >([]);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isUploading, startUploading] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).map((f) => ({ file: f, tipo: 'carnet_nautico' as const }));
    setPendientes((prev) => [...prev, ...next]);
  }

  function updatePendiente(
    idx: number,
    patch: Partial<{ tipo: 'carnet_nautico' | 'matricula' | 'seguro' }>,
  ) {
    setPendientes((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function removePendiente(idx: number) {
    setPendientes((prev) => prev.filter((_, i) => i !== idx));
  }

  function subir() {
    if (pendientes.length === 0) return;
    setError(null);
    startUploading(async () => {
      for (let i = 0; i < pendientes.length; i++) {
        const p = pendientes[i];
        setProgreso(`Subiendo ${i + 1}/${pendientes.length}: ${p.file.name}`);
        const fd = new FormData();
        fd.append('socioId', socioId);
        fd.append('tipo', p.tipo);
        fd.append('file', p.file);
        const res = await uploadSocioDocumentoAction(fd);
        if (res.error) {
          setError(`Falló "${p.file.name}": ${res.error}`);
          setProgreso(null);
          router.refresh();
          return;
        }
      }
      setPendientes([]);
      setProgreso(null);
      router.refresh();
    });
  }

  function eliminar(id: string) {
    setError(null);
    startDeleting(async () => {
      const res = await deleteSocioDocumentoAction(id);
      if (res.error) {
        setError(res.error);
        setConfirmDeleteId(null);
        return;
      }
      setConfirmDeleteId(null);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
      {/* Header — mismo patrón que la tab Generales */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
          Documentación
        </p>
        <label
          className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: '#175861' }}
        >
          <Paperclip className="h-4 w-4" />
          Subir documento
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div className="space-y-4">
        {/* Pendientes de subir */}
        {pendientes.length > 0 && (
          <div className="space-y-2 rounded-[10px] border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-500">
              {pendientes.length} archivo(s) seleccionado(s) — elegí el tipo y subí
            </p>
            {pendientes.map((p, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-[8px] border border-gray-200 bg-white px-3 py-2"
              >
                <FileText className="h-4 w-4 shrink-0 text-[#669E9D]" />
                <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{p.file.name}</span>
                <select
                  className="h-8 rounded-[6px] border border-gray-200 bg-white px-2 text-xs text-[#101828]"
                  value={p.tipo}
                  onChange={(e) =>
                    updatePendiente(idx, {
                      tipo: e.target.value as 'carnet_nautico' | 'matricula' | 'seguro',
                    })
                  }
                >
                  {TIPO_DOC_OPTS_DETAIL.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removePendiente(idx)}
                  title="Quitar"
                  className="rounded-[6px] p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setPendientes([])}
                disabled={isUploading}
                className="rounded-[10px] border border-[#d1d5dc] bg-white px-4 py-2 text-sm font-medium text-[#364153] hover:bg-gray-50 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={subir}
                disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: '#175861' }}
              >
                <Upload className="h-4 w-4" />
                {isUploading ? 'Subiendo...' : `Subir ${pendientes.length} archivo(s)`}
              </button>
            </div>
          </div>
        )}

        {progreso && <p className="text-sm text-[#669E9D]">{progreso}</p>}
        {error && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* Lista de documentos cargados */}
        {documentos.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-7 w-7 opacity-40" />}
            text="No hay documentos adjuntos."
          />
        ) : (
          <div className="space-y-2">
            {documentos.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-[10px] border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50"
              >
                <FileText className="h-5 w-5 shrink-0 text-[#669E9D]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#101828]">{d.nombre}</p>
                  <p className="text-xs text-gray-500">
                    {d.tipo ? TIPO_DOC_LABEL[d.tipo] : 'Sin categoría'} ·{' '}
                    {formatArgentinaDate(d.createdAt)}
                  </p>
                </div>
                {d.signedUrl ? (
                  <a
                    href={d.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#175861] hover:bg-gray-50"
                  >
                    Ver
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-gray-400">Sin archivo</span>
                )}
                <button
                  onClick={() => setConfirmDeleteId(d.id)}
                  className="shrink-0 rounded-[8px] p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: '#101828' }}>
                  Eliminar documento
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  El archivo se borra del almacenamiento también. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={isDeleting}
                className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] hover:bg-gray-50 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={() => eliminar(confirmDeleteId)}
                disabled={isDeleting}
                className="flex-1 rounded-[10px] bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type EspacioOption = {
  id: string;
  label: string;
  eslora: string | null;
  unidadMetraje: 'metros' | 'pies' | null;
  precio: string | null;
  alicuotaIva: string | null;
};

type PaywayTokenInfo = {
  lastFour: string;
  paymentMethodId: number;
  activo: boolean;
};

export function SocioDetail({
  socio,
  embarcaciones,
  movimientos,
  servicios,
  navegantes,
  invitados = [],
  documentos = [],
  salidas = [],
  espaciosDisponibles,
  serviciosContratados = [],
  paywayPublicKey = null,
  paywayToken = null,
}: {
  socio: SocioData;
  embarcaciones: Embarcacion[];
  movimientos: Movimiento[];
  servicios: Servicio[];
  navegantes: Navegante[];
  invitados?: InvitadoSocio[];
  documentos?: DocumentoItem[];
  salidas?: SalidaItem[];
  espaciosDisponibles: EspacioOption[];
  serviciosContratados?: ServicioContratado[];
  paywayPublicKey?: string | null;
  paywayToken?: PaywayTokenInfo | null;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('generales');
  const [modalServicioOpen, setModalServicioOpen] = useState(false);

  // Filtros de la tabla de cuenta corriente.
  const [ccFechaDesde, setCcFechaDesde] = useState('');
  const [ccFechaHasta, setCcFechaHasta] = useState('');
  const [ccEstado, setCcEstado] = useState('');
  const [ccTipoComp, setCcTipoComp] = useState('');

  // Paginación client-side de la tabla de CC. El cálculo de saldo/estado (FIFO)
  // y los filtros se siguen haciendo sobre TODO el dataset; solo se pagina el
  // render para no pintar cientos de filas en el DOM. Al cambiar un filtro se
  // vuelve a la primera página.
  const CC_PAGE_SIZE = 20;
  const [ccPage, setCcPage] = useState(1);
  // Orden por fecha de la cuenta corriente. 'desc' = más nuevo primero (default,
  // como venía); 'asc' = más antiguo primero.
  const [ccSortDir, setCcSortDir] = useState<'asc' | 'desc'>('desc');
  // Reset a la primera página cuando cambian los filtros o el orden. Patrón
  // "ajustar estado en render" (recomendado por React) en vez de un efecto.
  const ccFiltroSig = `${ccFechaDesde}|${ccFechaHasta}|${ccEstado}|${ccTipoComp}|${ccSortDir}`;
  const [ccPrevFiltroSig, setCcPrevFiltroSig] = useState(ccFiltroSig);
  if (ccFiltroSig !== ccPrevFiltroSig) {
    setCcPrevFiltroSig(ccFiltroSig);
    setCcPage(1);
  }

  // Generales edit mode
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState({
    nombre: socio.nombre ?? '',
    apellido: socio.apellido ?? '',
    email: socio.email,
    telefono: socio.telefono ?? '',
    tipoDocumento: socio.tipoDocumento ?? '',
    numeroDocumento: socio.numeroDocumento ?? '',
    direccion: socio.direccion ?? '',
    ciudad: socio.ciudad ?? '',
    provincia: socio.provincia ?? '',
    codigoPostal: socio.codigoPostal ?? '',
    contactoEmergencia: socio.contactoEmergencia ?? '',
    razonSocial: socio.razonSocial ?? '',
    cuit: socio.cuit ?? '',
    direccionFiscal: socio.direccionFiscal ?? '',
    condicionIva: socio.condicionIva ?? '',
    condicionIvaPersonal: socio.condicionIvaPersonal ?? '',
    condicionIibb: socio.condicionIibb ?? '',
    emailFacturacion: socio.emailFacturacion ?? '',
    numeroSocio: socio.numeroSocio != null ? String(socio.numeroSocio) : '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminarError, setEliminarError] = useState<string | null>(null);
  const [isEliminando, startEliminando] = useTransition();
  const initialStatus = socio.membershipStatus === 'active' ? 'active' : 'inactivo';
  const [currentStatus, setCurrentStatus] = useState<'active' | 'inactivo'>(initialStatus);
  const [isUpdatingStatus, startUpdatingStatus] = useTransition();
  const router = useRouter();

  function setField(k: keyof typeof editForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setEditForm((f) => ({ ...f, [k]: e.target.value }));
  }

  function handleCancelar() {
    setEditForm({
      nombre: socio.nombre ?? '',
      apellido: socio.apellido ?? '',
      email: socio.email,
      telefono: socio.telefono ?? '',
      tipoDocumento: socio.tipoDocumento ?? '',
      numeroDocumento: socio.numeroDocumento ?? '',
      direccion: socio.direccion ?? '',
      ciudad: socio.ciudad ?? '',
      provincia: socio.provincia ?? '',
      codigoPostal: socio.codigoPostal ?? '',
      contactoEmergencia: socio.contactoEmergencia ?? '',
      razonSocial: socio.razonSocial ?? '',
      cuit: socio.cuit ?? '',
      direccionFiscal: socio.direccionFiscal ?? '',
      condicionIva: socio.condicionIva ?? '',
      condicionIvaPersonal: socio.condicionIvaPersonal ?? '',
      condicionIibb: socio.condicionIibb ?? '',
      emailFacturacion: socio.emailFacturacion ?? '',
      numeroSocio: socio.numeroSocio != null ? String(socio.numeroSocio) : '',
    });
    setEditError(null);
    setEditando(false);
  }

  function handleGuardar() {
    setEditError(null);
    startSaving(async () => {
      const { numeroSocio: numStr, ...profileFields } = editForm;
      const nuevoNumero = numStr.trim() ? parseInt(numStr.trim(), 10) : null;
      const [profileRes, numRes] = await Promise.all([
        updateSocioAction({ socioId: socio.id, ...profileFields }),
        nuevoNumero !== socio.numeroSocio
          ? updateNumeroSocioAction(socio.id, isNaN(nuevoNumero as number) ? null : nuevoNumero)
          : Promise.resolve<{ error?: string }>({}),
      ]);
      const err = profileRes.error || numRes.error;
      if (err) {
        setEditError(err);
      } else {
        setEditando(false);
        router.refresh();
      }
    });
  }

  function handleEliminar() {
    setEliminarError(null);
    startEliminando(async () => {
      const res = await deleteSocioAction(socio.id);
      if (res.error) {
        setEliminarError(res.error);
        return;
      }
      router.push('/usuarios');
    });
  }

  function handleStatusChange(newStatus: 'active' | 'inactivo') {
    startUpdatingStatus(async () => {
      const res = await updateSocioStatusAction(socio.id, newStatus);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setCurrentStatus(newStatus);
      toast.success('Estado actualizado.');
    });
  }

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    handleStatusChange(e.target.value as 'active' | 'inactivo');
  }

  const nombre = [socio.nombre, socio.apellido].filter(Boolean).join(' ') || socio.email;
  const inicial = (socio.nombre?.[0] ?? socio.email[0]).toUpperCase();

  const memberDate = formatArgentinaDate(socio.memberSince);

  // Saldo real del socio: SIEMPRE sobre todos los movimientos (no se filtra por
  // fecha/estado/comprobante). Positivo = nos debe, negativo = saldo a favor.
  const saldoBruto =
    movimientos.reduce((sum, m) => sum + parseFloat(m.debe ?? '0'), 0) -
    movimientos.reduce((sum, m) => sum + parseFloat(m.haber ?? '0'), 0);
  const totalPendiente = Math.max(0, saldoBruto);
  const totalAFavor = saldoBruto < 0 ? Math.abs(saldoBruto) : 0;

  // Predicado de filtros de la tabla de cuenta corriente.
  function pasaFiltrosCC(m: Movimiento, estadoEf?: string | null): boolean {
    const est = estadoEf ?? m.estado;
    const fecha = m.fecha ? m.fecha.slice(0, 10) : '';
    if (ccFechaDesde && (!fecha || fecha < ccFechaDesde)) return false;
    if (ccFechaHasta && (!fecha || fecha > ccFechaHasta)) return false;
    if (ccEstado === 'pagado' && est !== 'pagado') return false;
    if (ccEstado === 'parcial' && est !== 'parcial') return false;
    if (ccEstado === 'en_plazo' && est !== 'facturado' && est !== 'no_pagado') return false;
    if (ccTipoComp === 'sin' && m.facturaTipo) return false;
    if (ccTipoComp && ccTipoComp !== 'sin' && m.facturaTipo !== ccTipoComp) return false;
    return true;
  }
  // Movimientos con saldo acumulado y estado mostrado (ver calcularSaldoYEstado).
  const movimientosCalc = calcularSaldoYEstado(movimientos);

  const movimientosFiltrados = movimientosCalc.filter((m) => pasaFiltrosCC(m, m.estadoDisplay));
  const hayFiltrosCC = Boolean(ccFechaDesde || ccFechaHasta || ccEstado || ccTipoComp);

  // Cards Ventas/Cobranzas: reflejan los movimientos filtrados.
  const totalIngresos = movimientosFiltrados.reduce((sum, m) => sum + parseFloat(m.debe ?? '0'), 0);
  const totalPagosACuenta = movimientosFiltrados.reduce(
    (sum, m) => sum + parseFloat(m.haber ?? '0'),
    0,
  );

  return (
    <div className="p-4 md:p-8">
      <AgregarServicioModal
        open={modalServicioOpen}
        onClose={() => setModalServicioOpen(false)}
        socioId={socio.id}
        socioNombre={nombre}
        servicios={servicios}
      />

      {/* Back */}
      <Link
        href="/usuarios"
        className="mb-6 inline-flex items-center gap-1.5 text-sm transition hover:opacity-70"
        style={{ color: '#669E9D' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Socios
      </Link>

      {/* Avatar + name */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
            style={{ background: '#E87040' }}
          >
            {inicial}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[18px] font-bold" style={{ color: '#101828' }}>
                {nombre}
              </h1>
              {socio.numeroSocio != null && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                  #{socio.numeroSocio}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400">Socio desde {memberDate}</p>
          </div>
        </div>
        <select
          value={currentStatus}
          onChange={handleSelectChange}
          disabled={isUpdatingStatus}
          aria-label="Estado del socio"
          className={`focus:border-ring focus:ring-ring/50 h-9 cursor-pointer rounded-full border px-3 text-xs font-semibold transition focus:ring-[3px] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${MEMBERSHIP_STATUS_CLASSES[currentStatus]}`}
        >
          <option value="active">{MEMBERSHIP_STATUS_LABEL.active}</option>
          <option value="inactivo">{MEMBERSHIP_STATUS_LABEL.inactivo}</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="-mx-4 mb-6 overflow-x-auto border-b border-gray-200 md:mx-0">
        <div className="flex min-w-max gap-0 px-4 whitespace-nowrap md:px-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex shrink-0 items-center gap-2 px-4 pb-3 text-sm font-medium transition ${
                activeTab === id
                  ? 'border-b-2 border-[#175861] text-[#175861]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Generales */}
      {activeTab === 'generales' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Datos Personales
            </p>
            {!editando ? (
              <button
                onClick={() => setEditando(true)}
                className="shrink-0 justify-center rounded-[10px] border border-[#d1d5dc] px-4 py-2 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
              >
                Editar
              </button>
            ) : (
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={handleCancelar}
                  disabled={isSaving}
                  className="flex-1 justify-center rounded-[10px] border border-[#d1d5dc] px-4 py-2 text-sm font-medium text-[#364153] transition hover:bg-gray-50 disabled:opacity-40 sm:flex-none"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardar}
                  disabled={isSaving}
                  className="flex-1 justify-center rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40 sm:flex-none"
                  style={{ background: '#175861' }}
                >
                  {isSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                  N.º de socio
                </label>
                <input
                  type="number"
                  min="1"
                  className={inputCls}
                  value={editForm.numeroSocio}
                  onChange={setField('numeroSocio')}
                  readOnly={!editando}
                  placeholder="—"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Nombre</label>
                <input
                  className={inputCls}
                  value={editForm.nombre}
                  onChange={setField('nombre')}
                  readOnly={!editando}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Apellido</label>
                <input
                  className={inputCls}
                  value={editForm.apellido}
                  onChange={setField('apellido')}
                  readOnly={!editando}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Email</label>
                <input
                  type="email"
                  className={inputCls}
                  value={editForm.email}
                  onChange={setField('email')}
                  readOnly={!editando}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Teléfono</label>
                <input
                  className={inputCls}
                  value={editForm.telefono}
                  onChange={setField('telefono')}
                  readOnly={!editando}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Tipo Documento
                </label>
                <select
                  className={inputCls}
                  value={editForm.tipoDocumento}
                  onChange={setField('tipoDocumento')}
                  disabled={!editando}
                >
                  <option value="">—</option>
                  {TIPO_DOC_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Número</label>
                <input
                  className={inputCls}
                  value={editForm.numeroDocumento}
                  onChange={setField('numeroDocumento')}
                  readOnly={!editando}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Condición frente al IVA
                </label>
                <select
                  className={inputCls}
                  value={editForm.condicionIvaPersonal}
                  onChange={setField('condicionIvaPersonal')}
                  disabled={!editando}
                >
                  <option value="">—</option>
                  {CONDICION_IVA_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-gray-400">
                  Se usa cuando el socio factura con datos personales.
                </p>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">Dirección</label>
              <input
                className={inputCls}
                value={editForm.direccion}
                onChange={setField('direccion')}
                readOnly={!editando}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Ciudad</label>
                <input
                  className={inputCls}
                  value={editForm.ciudad}
                  onChange={setField('ciudad')}
                  readOnly={!editando}
                  placeholder="—"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Provincia
                </label>
                <input
                  className={inputCls}
                  value={editForm.provincia}
                  onChange={setField('provincia')}
                  readOnly={!editando}
                  placeholder="—"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">C.P.</label>
                <input
                  className={inputCls}
                  value={editForm.codigoPostal}
                  onChange={setField('codigoPostal')}
                  readOnly={!editando}
                  placeholder="—"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                Contacto de emergencia
              </label>
              <input
                className={inputCls}
                value={editForm.contactoEmergencia}
                onChange={setField('contactoEmergencia')}
                readOnly={!editando}
                placeholder="—"
              />
            </div>
            {editError && (
              <div className="rounded-[10px] border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-medium text-red-700">{editError}</p>
              </div>
            )}

            {!editando && (
              <div className="border-t border-gray-100 pt-4">
                <button
                  onClick={() => setConfirmEliminar(true)}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar socio
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: '#101828' }}>
                  Eliminar socio
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  ¿Estás seguro que querés eliminar a <strong>{nombre}</strong>? Va a desaparecer
                  del listado, pero se conserva el historial de cuenta corriente y facturación.
                </p>
              </div>
            </div>
            {eliminarError && (
              <div className="mb-3 rounded-[10px] border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-medium text-red-700">{eliminarError}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmEliminar(false);
                  setEliminarError(null);
                }}
                disabled={isEliminando}
                className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminar}
                disabled={isEliminando}
                className="flex-1 rounded-[10px] bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isEliminando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Impositivos */}
      {activeTab === 'impositivos' && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <ImpositivosTab
            socio={socio}
            editForm={editForm}
            editando={editando}
            setEditando={setEditando}
            setField={setField}
            handleGuardar={handleGuardar}
            handleCancelar={handleCancelar}
            editError={editError}
            isSaving={isSaving}
          />
        </div>
      )}

      {/* Embarcación */}
      {activeTab === 'embarcacion' && (
        <div className="space-y-4">
          <EmbarcacionesTab
            socioId={socio.id}
            embarcaciones={embarcaciones}
            espaciosDisponibles={espaciosDisponibles}
          />
        </div>
      )}

      {/* Servicios Contratados */}
      {activeTab === 'servicios-contratados' && (
        <ServiciosContratadosTab
          movimientos={movimientos}
          serviciosContratados={serviciosContratados}
          socioId={socio.id}
          onCargarServicio={() => setModalServicioOpen(true)}
        />
      )}

      {/* Cuenta Corriente */}
      {activeTab === 'cuenta-corriente' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          {/* Header */}
          <div className="mb-5">
            <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Movimientos de cuenta
            </p>
          </div>

          {/* Filtros */}
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Desde</label>
              <input
                type="date"
                value={ccFechaDesde}
                onChange={(e) => setCcFechaDesde(e.target.value)}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-[8px] border bg-white px-3 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Hasta</label>
              <input
                type="date"
                value={ccFechaHasta}
                onChange={(e) => setCcFechaHasta(e.target.value)}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-[8px] border bg-white px-3 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Estado</label>
              <select
                value={ccEstado}
                onChange={(e) => setCcEstado(e.target.value)}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-[8px] border bg-white px-3 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
              >
                <option value="">Todos</option>
                <option value="pagado">Pagado</option>
                <option value="parcial">Parcial</option>
                <option value="en_plazo">Pendiente</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Tipo de comprobante</label>
              <select
                value={ccTipoComp}
                onChange={(e) => setCcTipoComp(e.target.value)}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-[8px] border bg-white px-3 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
              >
                <option value="">Todos</option>
                {Object.entries(TIPO_COMPROBANTE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                <option value="sin">Sin comprobante</option>
              </select>
            </div>
            {hayFiltrosCC && (
              <button
                onClick={() => {
                  setCcFechaDesde('');
                  setCcFechaHasta('');
                  setCcEstado('');
                  setCcTipoComp('');
                }}
                className="h-9 rounded-[8px] border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Metric cards. La card de Saldo se oculta cuando hay filtros aplicados:
              su valor es el saldo TOTAL del socio, que no se corresponde con el
              subconjunto filtrado y resultaría engañoso. */}
          <div
            className={`mb-6 grid grid-cols-1 gap-4 ${
              hayFiltrosCC ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
            }`}
          >
            <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: '#E6F4F1' }}
              >
                <TrendingUp className="h-5 w-5" style={{ color: '#175861' }} />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                  Ingresos por venta
                </p>
                <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
                  {fmt(totalIngresos)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: '#E6F8EC' }}
              >
                <DollarSign className="h-5 w-5" style={{ color: '#15803d' }} />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                  Cobranzas
                </p>
                <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
                  {fmt(totalPagosACuenta)}
                </p>
              </div>
            </div>
            {!hayFiltrosCC && (
              <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: totalAFavor > 0 ? '#E6F8EC' : '#FEF0E6' }}
                >
                  {totalAFavor > 0 ? (
                    <DollarSign className="h-5 w-5" style={{ color: '#15803d' }} />
                  ) : (
                    <AlertTriangle className="h-5 w-5" style={{ color: '#E87040' }} />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                    {totalAFavor > 0 ? 'Saldo a favor' : 'Saldo cliente'}
                  </p>
                  <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
                    {totalAFavor > 0 ? fmt(totalAFavor) : fmt(totalPendiente)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Table */}
          {movimientos.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="h-7 w-7 opacity-40" />}
              text="No hay movimientos en la cuenta corriente."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                      <th className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setCcSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                          title={
                            ccSortDir === 'desc'
                              ? 'Más nuevo primero (clic para más antiguo)'
                              : 'Más antiguo primero (clic para más nuevo)'
                          }
                          className="inline-flex items-center gap-1 font-semibold text-gray-500 uppercase transition hover:text-[#175861]"
                        >
                          Fecha
                          {ccSortDir === 'desc' ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUp className="h-3 w-3" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-3">Tipo de comprobante</th>
                      <th className="px-4 py-3">Nº Comprobante</th>
                      <th className="px-4 py-3">Detalle</th>
                      <th className="px-4 py-3">Vencimiento</th>
                      <th className="px-4 py-3">Situación</th>
                      <th className="px-4 py-3 text-right">Ventas</th>
                      <th className="px-4 py-3 text-right">Cobranzas</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      <th className="px-4 py-3 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Saldo acumulado + estado mostrado ya calculados en
                      // movimientosCalc (FIFO de pagos, queda más nuevo primero).
                      // Acá filtramos y aplicamos el orden por fecha elegido: el
                      // saldo por fila no cambia, solo se invierte el orden visual.
                      const filtradas = movimientosCalc.filter((m) =>
                        pasaFiltrosCC(m, m.estadoDisplay),
                      );
                      const visibles = ccSortDir === 'asc' ? [...filtradas].reverse() : filtradas;
                      if (visibles.length === 0) {
                        return (
                          <tr>
                            <td
                              colSpan={10}
                              className="px-4 py-8 text-center text-sm text-gray-400"
                            >
                              No hay movimientos que coincidan con los filtros.
                            </td>
                          </tr>
                        );
                      }
                      // Paginar el render (no el cálculo). Clamp por si la página
                      // quedó fuera de rango al achicarse el set filtrado.
                      const pageCount = Math.max(1, Math.ceil(visibles.length / CC_PAGE_SIZE));
                      const pageSafe = Math.min(ccPage, pageCount);
                      const pageItems = visibles.slice(
                        (pageSafe - 1) * CC_PAGE_SIZE,
                        pageSafe * CC_PAGE_SIZE,
                      );
                      return pageItems.map((m) => {
                        const venta = parseFloat(m.debe ?? '0');
                        const cobranza = parseFloat(m.haber ?? '0');
                        const esPago = cobranza > 0 && venta === 0;
                        const detalle = esPago
                          ? m.concepto?.trim() || 'Pago a cuenta'
                          : [m.servicioNombre, m.concepto?.trim()].filter(Boolean).join(' — ') ||
                            '—';
                        return (
                          <tr
                            key={m.id}
                            className="border-t border-gray-100 transition hover:bg-gray-50/50"
                          >
                            <td className="px-4 py-3 text-gray-500">{fmtDate(m.fecha)}</td>
                            <td className="px-4 py-3 text-gray-500">
                              {m.comprobanteInterno
                                ? 'Comprobante interno'
                                : m.facturaTipo
                                  ? (TIPO_COMPROBANTE_LABEL[m.facturaTipo] ?? m.facturaTipo)
                                  : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              <div className="flex items-center gap-1.5">
                                <span>{m.facturaCodigo ?? '—'}</span>
                                {m.facturaArchivo && (
                                  <a
                                    href={m.facturaArchivo}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Ver comprobante"
                                    className="shrink-0 text-gray-400 hover:text-[#175861]"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-medium" style={{ color: '#175861' }}>
                              {detalle}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {m.fechaVencimiento ? fmtYmd(m.fechaVencimiento) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {m.fechaVencimiento ? (
                                <span
                                  className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                                    m.fechaVencimiento < todayISODate()
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-green-100 text-green-700'
                                  }`}
                                >
                                  {m.fechaVencimiento < todayISODate() ? 'Vencida' : 'En término'}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-[#101828]">
                              {venta > 0 ? fmt(venta) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-green-700">
                              {cobranza > 0 ? fmt(cobranza) : '—'}
                            </td>
                            <td
                              className="px-4 py-3 text-right font-semibold"
                              style={{
                                color:
                                  m.saldo < 0 ? '#1B9A5A' : m.saldo > 0 ? '#101828' : '#6B7280',
                              }}
                            >
                              {fmt(Math.abs(m.saldo))}
                              {m.saldo < 0 && (
                                <span className="ml-1 text-xs font-normal text-green-600">
                                  a favor
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span
                                  className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                                    ESTADO_BADGE[m.estadoDisplay ?? ''] ??
                                    'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  {ESTADO_LABEL[m.estadoDisplay ?? ''] ?? m.estadoDisplay ?? '—'}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
                <Pagination
                  page={ccPage}
                  totalItems={movimientosFiltrados.length}
                  pageSize={CC_PAGE_SIZE}
                  onPageChange={setCcPage}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Accesos Externos del socio */}
      {activeTab === 'navegantes' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          {navegantes.length === 0 ? (
            <EmptyState
              icon={<Users className="h-7 w-7 opacity-40" />}
              text="No hay accesos externos registrados."
            />
          ) : (
            <div className="space-y-3">
              {navegantes.map((n) => {
                const nombreCompleto = [n.nombre, n.apellido].filter(Boolean).join(' ') || '—';
                const inicial = (n.nombre?.[0] ?? '?').toUpperCase();
                const estadoLabel =
                  n.estado === 'usado'
                    ? 'Ingresó'
                    : n.estado === 'revocado'
                      ? 'Cancelado'
                      : 'Autorizado a Navegar';
                const estadoCls =
                  n.estado === 'usado'
                    ? 'bg-blue-50 text-blue-700'
                    : n.estado === 'revocado'
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-teal-50 text-[#175861]';
                return (
                  <div
                    key={n.id}
                    className="flex items-center gap-4 rounded-[10px] border border-gray-100 bg-gray-50 p-4"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: '#669E9D' }}
                    >
                      {inicial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold" style={{ color: '#101828' }}>
                          {nombreCompleto}
                        </p>
                        {n.esNavegante && (
                          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Navega
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
                        {n.desde && <span>Desde {fmtDate(n.desde)}</span>}
                        {n.hasta && <span>Hasta {fmtDate(n.hasta)}</span>}
                      </div>
                      {n.arribadaEn && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          Ingresó {formatArgentinaDateTime(n.arribadaEn)}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${estadoCls}`}
                    >
                      {estadoLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Invitados del socio */}
      {activeTab === 'invitados' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          {invitados.length === 0 ? (
            <EmptyState
              icon={<UserCheck className="h-7 w-7 opacity-40" />}
              text="No hay invitados registrados."
            />
          ) : (
            <div className="space-y-3">
              {invitados.map((iv) => {
                const nombreCompleto = [iv.nombre, iv.apellido].filter(Boolean).join(' ') || '—';
                const inicial = (iv.nombre?.[0] ?? '?').toUpperCase();
                const tipoLabel = iv.tipo === 'titular' ? 'Invitado' : 'Autorizado';
                return (
                  <div
                    key={iv.id}
                    className="flex items-center gap-4 rounded-[10px] border border-gray-100 bg-gray-50 p-4"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: '#669E9D' }}
                    >
                      {inicial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: '#101828' }}>
                        {nombreCompleto}
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
                        {iv.validoHasta && <span>Válido hasta {fmtDate(iv.validoHasta)}</span>}
                        {iv.telefono && <span>Tel. {iv.telefono}</span>}
                        {iv.dni && <span>DNI {iv.dni}</span>}
                      </div>
                      {iv.motivo && <p className="mt-0.5 text-xs text-gray-400">{iv.motivo}</p>}
                    </div>
                    <span className="inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-[#175861]">
                      {tipoLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Salidas */}
      {activeTab === 'salidas' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          {salidas.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-7 w-7 opacity-40" />}
              text="No hay salidas registradas."
            />
          ) : (
            <div className="space-y-3">
              {salidas.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start justify-between gap-4 rounded-[10px] border border-gray-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[#101828]">
                        {s.embarcacion ?? 'Sin embarcación'}
                      </p>
                      {s.estado === 'revocado' && (
                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
                          Finalizada
                        </span>
                      )}
                    </div>
                    <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-gray-500 sm:grid-cols-3">
                      <span>
                        <strong className="text-gray-400">Salida: </strong>
                        {formatNaiveDateTime(s.desde)}
                      </span>
                      <span>
                        <strong className="text-gray-400">Regreso: </strong>
                        {formatNaiveDateTime(s.hasta)}
                      </span>
                      <span>
                        <strong className="text-gray-400">Arribó: </strong>
                        {fmtFechaHoraSalida(s.arribadaEn)}
                      </span>
                    </div>
                    {s.motivo && <p className="mt-1 text-xs text-gray-500">{s.motivo}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Documentación */}
      {activeTab === 'documentacion' && (
        <DocumentacionTab socioId={socio.id} documentos={documentos} />
      )}

      {/* Débito automático Payway */}
      {activeTab === 'payway' && (
        <PaywayTab
          socioId={socio.id}
          paywayPublicKey={paywayPublicKey}
          paywayToken={paywayToken}
          socioDocType={socio.tipoDocumento}
          socioDocNumber={socio.numeroDocumento}
        />
      )}
    </div>
  );
}

// ─── Espacio asignado card (dentro del tab Embarcación) ───────────────────────

function EspacioAsignadoCard({
  socioId,
  espacioActual,
  espaciosDisponibles,
}: {
  socioId: string;
  espacioActual: EspacioOption | null;
  espaciosDisponibles: EspacioOption[];
}) {
  const router = useRouter();
  const [destinoId, setDestinoId] = useState('');
  const [pending, startTransition] = useTransition();

  const tieneActual = espacioActual != null;
  const hayDisponibles = espaciosDisponibles.length > 0;

  function submit() {
    if (!destinoId) {
      toast.error('Seleccioná un espacio.');
      return;
    }
    startTransition(async () => {
      const res = tieneActual
        ? await moveOcupanteAction({ origenId: espacioActual!.id, destinoId })
        : await assignEspacioToSocioAction({ socioId, espacioId: destinoId });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(tieneActual ? 'Cliente mudado al nuevo espacio.' : 'Espacio asignado.');
      setDestinoId('');
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
      <h2 className="text-base font-bold" style={{ color: '#101828' }}>
        Espacio asignado
      </h2>

      {tieneActual ? (
        <div className="mt-2 mb-4 rounded-[10px] border border-[#CAE6E4] bg-[#ECFDF3] px-4 py-3 text-sm text-[#175861]">
          Espacio actual: <span className="font-semibold">{espacioActual!.label}</span>
        </div>
      ) : (
        <p className="mt-2 mb-4 text-sm text-gray-600">Este socio no tiene espacio asignado.</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className={`${inputCls} flex-1`}
          value={destinoId}
          onChange={(e) => setDestinoId(e.target.value)}
          disabled={pending || !hayDisponibles}
        >
          <option value="">
            {hayDisponibles
              ? tieneActual
                ? 'Seleccione otro espacio disponible…'
                : 'Seleccione un espacio disponible…'
              : tieneActual
                ? 'No hay espacios disponibles compatibles con la eslora del barco.'
                : 'No hay espacios disponibles.'}
          </option>
          {espaciosDisponibles.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={submit}
          disabled={pending || !destinoId}
          className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? tieneActual
              ? 'Mudando…'
              : 'Asignando…'
            : tieneActual
              ? 'Cambiar'
              : 'Asignar'}
        </button>
      </div>
    </div>
  );
}

// ─── Payway Tab ──────────────────────────────────────────────────────────────

// URLs oficiales segun el SDK Node oficial de Payway (sdk-node-payway):
// node_modules/sdk-node-payway/lib/utils/constants.js
//   ENDPOINT_SANDBOX_V2 = "https://developers.decidir.com/api/v2"
//   ENDPOINT_PRD_V2     = "https://ventasonline.payway.com.ar/api/v2"
const PAYWAY_URL_PROD = 'https://ventasonline.payway.com.ar/api/v2';
const PAYWAY_URL_DEV = 'https://developers.decidir.com/api/v2';
// Script: Payway no publica el SDK JS en developers.decidir.com, asi que
// lo bajamos siempre del host prod. La URL pasada a new Decidir(url, true)
// determina a donde van los requests.
const PAYWAY_SDK_PROD = 'https://ventasonline.payway.com.ar/static/v2.6.4/decidir.js';
const PAYWAY_SDK_DEV = 'https://ventasonline.payway.com.ar/static/v2.6.4/decidir.js';

// Sandbox se activa en dev local o cuando NEXT_PUBLIC_PAYWAY_SANDBOX=1.
// La env var permite forzar sandbox en una preview o prod para pruebas
// puntuales sin reescribir el codigo.
const PAYWAY_USE_SANDBOX =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_PAYWAY_SANDBOX === '1';

const CARD_BRAND: Record<number, string> = { 1: 'Visa', 2: 'Mastercard', 65: 'Amex' };

function ImpositivosTab({
  socio,
  editForm,
  editando,
  setEditando,
  setField,
  handleGuardar,
  handleCancelar,
  editError,
  isSaving,
}: {
  socio: SocioData;
  editForm: {
    razonSocial: string;
    cuit: string;
    direccionFiscal: string;
    condicionIva: string;
    condicionIibb: string;
    [key: string]: string;
  };
  editando: boolean;
  setEditando: (v: boolean) => void;
  setField: (
    k:
      | 'razonSocial'
      | 'cuit'
      | 'direccionFiscal'
      | 'condicionIva'
      | 'condicionIibb'
      | 'emailFacturacion',
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  handleGuardar: () => void;
  handleCancelar: () => void;
  editError: string | null;
  isSaving: boolean;
}) {
  const router = useRouter();
  const [facturaFiscal, setFacturaFiscal] = useState(socio.facturaFiscal);
  const [isToggling, startToggle] = useTransition();

  const inputCls =
    'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

  function handleToggleFactura(checked: boolean) {
    setFacturaFiscal(checked);
    startToggle(async () => {
      const res = await toggleFacturaFiscalAction(socio.id, checked);
      if (res?.error) {
        toast.error(res.error);
        setFacturaFiscal(!checked);
      } else {
        toast.success(
          checked ? 'Facturará con datos personales' : 'Facturará con datos impositivos',
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Check facturación */}
      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#101828' }}>
            Usar datos personales para facturación
          </p>
          <p className="text-xs text-gray-500">
            Activado: factura con los datos de Generales (nombre, DNI, dirección). Desactivado:
            factura con los Datos Impositivos (razón social, CUIT).
          </p>
        </div>
        <input
          type="checkbox"
          checked={facturaFiscal}
          disabled={isToggling}
          onChange={(e) => handleToggleFactura(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[#175861] disabled:cursor-not-allowed"
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold" style={{ color: '#101828' }}>
          Datos Impositivos
        </h2>
        {!editando ? (
          <button
            onClick={() => setEditando(true)}
            className="rounded-[8px] border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Editar
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancelar}
              className="rounded-[8px] border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleGuardar}
              disabled={isSaving}
              className="rounded-[8px] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: '#175861' }}
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Razón social</label>
            <input
              className={inputCls}
              value={editForm.razonSocial}
              onChange={setField('razonSocial')}
              readOnly={!editando}
              placeholder="—"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">CUIT</label>
            <input
              className={inputCls}
              value={editForm.cuit}
              onChange={setField('cuit')}
              readOnly={!editando}
              placeholder="—"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">
            Dirección fiscal
          </label>
          <input
            className={inputCls}
            value={editForm.direccionFiscal}
            onChange={setField('direccionFiscal')}
            readOnly={!editando}
            placeholder="—"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">
            Email de facturación
          </label>
          <input
            type="email"
            className={inputCls}
            value={editForm.emailFacturacion}
            onChange={setField('emailFacturacion')}
            readOnly={!editando}
            placeholder="—"
          />
          <p className="mt-1.5 text-xs text-gray-400">
            A esta dirección se envía el comprobante. Si se deja vacío, se usa el email de la
            cuenta.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Condición frente IVA
            </label>
            <select
              className={inputCls}
              value={editForm.condicionIva}
              onChange={setField('condicionIva')}
              disabled={!editando}
            >
              <option value="">—</option>
              {CONDICION_IVA_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Ingresos Brutos
            </label>
            <select
              className={inputCls}
              value={editForm.condicionIibb}
              onChange={setField('condicionIibb')}
              disabled={!editando}
            >
              <option value="">—</option>
              {CONDICION_IIBB_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {editError && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-700">{editError}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ServiciosContratadosTab({
  movimientos,
  serviciosContratados,
  socioId,
  onCargarServicio,
}: {
  movimientos: Movimiento[];
  serviciosContratados: ServicioContratado[];
  socioId: string;
  onCargarServicio: () => void;
}) {
  const router = useRouter();
  const [editingSC, setEditingSC] = useState<ServicioContratado | null>(null);
  const [editingMov, setEditingMov] = useState<Movimiento | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hoy = todayISODate();
  function esVigente(sc: ServicioContratado): boolean {
    return sc.fechaInicio <= hoy && (!sc.fechaBaja || sc.fechaBaja >= hoy);
  }

  const filas = [...serviciosContratados].sort((a, b) =>
    b.fechaAsignacion.localeCompare(a.fechaAsignacion),
  );

  if (filas.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
            Servicios contratados
          </p>
          <button
            onClick={onCargarServicio}
            className="shrink-0 rounded-[10px] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            style={{ background: '#175861' }}
          >
            Cargar Servicio
          </button>
        </div>
        <EmptyState
          icon={<Package className="h-7 w-7 opacity-40" />}
          text="No se han cargado servicios para este socio todavía."
        />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
            Servicios contratados
          </p>
          <button
            onClick={onCargarServicio}
            className="shrink-0 rounded-[10px] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            style={{ background: '#175861' }}
          >
            Cargar Servicio
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
                <th className="pr-4 pb-2">Servicio</th>
                <th className="pr-4 pb-2">Categoría</th>
                <th className="pr-4 pb-2">Fecha de asignación</th>
                <th className="pr-4 pb-2">Nº de operación</th>
                <th className="pr-4 pb-2">Estado</th>
                <th className="pr-4 pb-2">Fecha de inicio</th>
                <th className="pr-4 pb-2">Fecha de baja</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((sc) => {
                const vigente = esVigente(sc);
                const movsDelContrato = movimientos.filter(
                  (m) =>
                    m.servicioId === sc.servicioId &&
                    m.fecha != null &&
                    m.fecha.slice(0, 10) >= sc.fechaInicio &&
                    (!sc.fechaBaja || m.fecha.slice(0, 10) <= sc.fechaBaja),
                );
                return (
                  <Fragment key={sc.id}>
                    <tr className="border-b border-gray-50 last:border-0">
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium" style={{ color: '#101828' }}>
                            {sc.servicioNombre}
                          </span>
                          {sc.servicioTipoCobro && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                sc.servicioTipoCobro === 'fijo'
                                  ? 'bg-[#EFF8F7] text-[#175861]'
                                  : 'bg-[#FFF4E6] text-[#B45309]'
                              }`}
                            >
                              {sc.servicioTipoCobro === 'fijo' ? 'Fijo' : 'Variable'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {sc.servicioTipo
                          ? (CATEGORIA_SERVICIO_LABEL[sc.servicioTipo] ?? sc.servicioTipo)
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">{fmtDate(sc.fechaAsignacion)}</td>
                      <td className="py-3 pr-4 text-gray-600">
                        {String(sc.numeroOperacion).padStart(6, '0')}
                      </td>
                      <td className="py-3 pr-4">
                        {vigente ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Vigente
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                            No vigente
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">{fmtYmd(sc.fechaInicio)}</td>
                      <td className="py-3 pr-4 text-gray-600">
                        {sc.fechaBaja ? fmtYmd(sc.fechaBaja) : '—'}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setExpandedId(expandedId === sc.id ? null : sc.id)}
                            className="rounded-[8px] border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                          >
                            {expandedId === sc.id ? 'Ocultar' : 'Ver movimientos'}
                          </button>
                          <button
                            onClick={() => setEditingSC(sc)}
                            className="rounded-[8px] border border-gray-200 p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                            title="Editar servicio contratado"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === sc.id && (
                      <tr className="border-b border-gray-50 bg-gray-50/60 last:border-0">
                        <td colSpan={8} className="p-4">
                          {movsDelContrato.length === 0 ? (
                            <p className="text-xs text-gray-400">
                              Todavía no hay cobros registrados para este contrato.
                            </p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs font-semibold text-gray-400 uppercase">
                                  <th className="pr-4 pb-2">Fecha</th>
                                  <th className="pr-4 pb-2">Concepto</th>
                                  <th className="pr-4 pb-2 text-right">Precio</th>
                                  <th className="pb-2" />
                                </tr>
                              </thead>
                              <tbody>
                                {movsDelContrato.map((m) => {
                                  const montoConIva = parseFloat(m.debe ?? '0');
                                  const alicuota =
                                    m.servicioAlicuotaIva != null
                                      ? Number(m.servicioAlicuotaIva)
                                      : 0;
                                  return (
                                    <tr key={m.id} className="border-t border-gray-100">
                                      <td className="py-2 pr-4 text-gray-600">
                                        {m.fecha ? fmtDate(m.fecha) : '—'}
                                      </td>
                                      <td className="py-2 pr-4 text-gray-600">
                                        {m.concepto ?? '—'}
                                      </td>
                                      <td
                                        className="py-2 pr-4 text-right"
                                        style={{ color: '#101828' }}
                                      >
                                        {fmt(montoConIva)}
                                        {alicuota > 0 && (
                                          <span className="ml-1 text-xs text-gray-400">c/IVA</span>
                                        )}
                                      </td>
                                      <td className="py-2 text-right">
                                        {!m.facturaCodigo && (
                                          <button
                                            onClick={() => setEditingMov(m)}
                                            className="rounded-[8px] border border-gray-200 p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                                            title="Editar cargo"
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingMov && (
        <EditMovimientoModal
          mov={editingMov}
          onClose={() => setEditingMov(null)}
          onSaved={() => {
            setEditingMov(null);
            router.refresh();
          }}
        />
      )}

      {editingSC && (
        <EditServicioContratadoModal
          sc={editingSC}
          movimientos={movimientos.filter((m) => m.servicioId === editingSC.servicioId)}
          onClose={() => setEditingSC(null)}
          onSaved={() => {
            setEditingSC(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

// Calcula el proporcional en base al último monto REAL cobrado a este socio
// por este servicio (no el precio vigente del tarifario, que puede haber
// cambiado desde la última vez que se le cobró) y a los días transcurridos
// desde ese último cobro. Se limita a como máximo un mes completo, para no
// arrastrar meses atrasados que no se cobraron por otro motivo.
function calcularProporcional(
  ultimoMonto: number,
  ultimaFecha: string | null,
): { monto: number; diasUsados: number; diasMes: number } {
  const hoy = new Date();
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  let diasUsados = diasMes;
  if (ultimaFecha) {
    const msPorDia = 1000 * 60 * 60 * 24;
    const diasDesdeUltimoCobro = Math.round(
      (hoy.getTime() - new Date(ultimaFecha).getTime()) / msPorDia,
    );
    diasUsados = Math.min(diasMes, Math.max(0, diasDesdeUltimoCobro));
  }
  const monto = Math.round((diasUsados / diasMes) * ultimoMonto * 100) / 100;
  return { monto, diasUsados, diasMes };
}

function EditServicioContratadoModal({
  sc,
  movimientos,
  onClose,
  onSaved,
}: {
  sc: ServicioContratado;
  movimientos: Movimiento[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fechaInicio, setFechaInicio] = useState(sc.fechaInicio);
  const [fechaBaja, setFechaBaja] = useState(sc.fechaBaja ?? '');
  const [cobrar, setCobrar] = useState(true);
  const [montoOverride, setMontoOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hoy = todayISODate();
  // Solo se ofrece cobrar cuando la baja recién se está dando de alta (el
  // contrato estaba abierto y ahora se le pone fecha de baja) — no al
  // simplemente corregir una fecha en un contrato que ya estaba cerrado.
  const esBajaNueva = sc.fechaBaja === null && fechaBaja !== '';

  const ultimoMov = [...movimientos]
    .filter((m) => m.fecha)
    .sort((a, b) => (b.fecha! > a.fecha! ? 1 : -1))[0];
  const ultimoMonto = ultimoMov ? parseFloat(ultimoMov.debe ?? '0') || 0 : 0;
  const precioCompleto =
    sc.servicioPrecio != null
      ? precioConIva(Number(sc.servicioPrecio), Number(sc.servicioAlicuotaIva ?? 0))
      : 0;
  const proporcional = calcularProporcional(
    ultimoMonto || precioCompleto,
    ultimoMov?.fecha ?? null,
  );
  const esMesCompleto = sc.servicioPoliticaBajaAnticipada === 'mes_completo';
  const montoSugerido = esMesCompleto ? precioCompleto : proporcional.monto;
  const montoFinal = montoOverride !== null ? parseFloat(montoOverride) || 0 : montoSugerido;

  function handleGuardar() {
    setError(null);
    if (!fechaInicio) {
      setError('La fecha de inicio es obligatoria.');
      return;
    }
    if (fechaInicio > hoy) {
      setError('La fecha de inicio no puede ser futura.');
      return;
    }
    if (fechaBaja) {
      if (fechaBaja > hoy) {
        setError('La fecha de baja no puede ser futura.');
        return;
      }
      if (fechaBaja < fechaInicio) {
        setError('La fecha de baja no puede ser anterior a la fecha de inicio.');
        return;
      }
    }
    startTransition(async () => {
      const res = await updateSocioServicioAction({
        id: sc.id,
        fechaInicio,
        fechaBaja: fechaBaja || null,
        cobro:
          esBajaNueva && cobrar
            ? {
                monto: String(montoFinal),
                concepto: `${esMesCompleto ? 'Mes completo' : 'Proporcional'} por baja de ${sc.servicioNombre ?? 'servicio'}`,
              }
            : null,
      });
      if (res?.error) {
        setError(res.error);
      } else {
        toast.success('Servicio contratado actualizado');
        onSaved();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-base font-bold" style={{ color: '#101828' }}>
              Editar servicio contratado
            </p>
            <p className="text-sm text-gray-500">{sc.servicioNombre}</p>
          </div>
          <button onClick={onClose} className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: '#101828' }}>
              Fecha de inicio del servicio
            </label>
            <input
              type="date"
              max={hoy}
              className={inputCls}
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: '#101828' }}>
              Fecha de baja del servicio
            </label>
            <input
              type="date"
              max={hoy}
              min={fechaInicio}
              className={inputCls}
              value={fechaBaja}
              onChange={(e) => setFechaBaja(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-400">
              Vacío = sigue vigente. No se puede agendar a futuro.
            </p>
          </div>

          {esBajaNueva && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={cobrar}
                  onChange={(e) => setCobrar(e.target.checked)}
                />
                Cobrar por esta baja — política:{' '}
                <strong>{esMesCompleto ? 'mes completo' : 'proporcional'}</strong>
              </label>
              {cobrar && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={montoOverride ?? montoSugerido.toFixed(2)}
                  onChange={(e) => setMontoOverride(e.target.value)}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 mt-2 h-10 w-full rounded-[8px] border bg-white px-3 text-center text-lg font-bold focus-visible:ring-[3px] focus-visible:outline-none"
                  style={{ color: '#101828' }}
                />
              )}
            </div>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-[10px] border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={isPending}
            className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: '#175861' }}
          >
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditMovimientoModal({
  mov,
  onClose,
  onSaved,
}: {
  mov: Movimiento;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [concepto, setConcepto] = useState(mov.concepto ?? '');
  const [fecha, setFecha] = useState(mov.fecha ? mov.fecha.slice(0, 10) : todayISODate());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    if (!fecha) {
      setError('La fecha es requerida.');
      return;
    }
    startTransition(async () => {
      const res = await updateMovimientoAction({
        movimientoId: mov.id,
        concepto,
        fecha,
      });
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <p className="text-base font-bold" style={{ color: '#101828' }}>
            Editar cargo
          </p>
          <button onClick={onClose} className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: '#101828' }}>
              Concepto
            </label>
            <input
              className={inputCls}
              placeholder="Descripción del cargo"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: '#101828' }}>
              Fecha
            </label>
            <input
              type="date"
              className={inputCls}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-[10px] border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending || !fecha}
            className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: '#175861' }}
          >
            {isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaywayTab({
  socioId,
  paywayPublicKey,
  paywayToken,
  socioDocType,
  socioDocNumber,
}: {
  socioId: string;
  paywayPublicKey: string | null;
  paywayToken: PaywayTokenInfo | null;
  socioDocType: string | null;
  socioDocNumber: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const decidirRef = useRef<any>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [holder, setHolder] = useState('');
  const [docType, setDocType] = useState((socioDocType ?? 'dni').toLowerCase());
  const [docNumber, setDocNumber] = useState(socioDocNumber ?? '');
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingDelete, startDelete] = useTransition();
  const [showForm, setShowForm] = useState(!paywayToken);

  useEffect(() => {
    if (scriptReady && paywayPublicKey) {
      const url = PAYWAY_USE_SANDBOX ? PAYWAY_URL_DEV : PAYWAY_URL_PROD;

      // Segundo argumento `true` deshabilita Cybersource (anti-fraude). Si la
      // cuenta no lo tiene habilitado, sin esto el SDK crashea con
      // "i is not a function" al intentar /frauddetectionconf.
      const decidir = new (window as any).Decidir(url, true);
      decidir.setPublishableKey(paywayPublicKey);
      // Doc oficial recomienda 0 (sin timeout) para sandbox y 3000ms para prod
      // (https://documentacion-ventasonline.payway.com.ar). Sandbox a veces
      // tarda mas de 30s y nos cortaba antes de que respondiera.
      decidir.setTimeout(PAYWAY_USE_SANDBOX ? 0 : 3000);
      decidirRef.current = decidir;
    }
  }, [scriptReady, paywayPublicKey]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!docNumber.trim()) {
      setFeedback({
        type: 'error',
        msg: 'Ingresá el número de documento del titular de la tarjeta.',
      });
      return;
    }
    if (!decidirRef.current || !formRef.current) {
      setFeedback({
        type: 'error',
        msg: 'El SDK de Payway no terminó de cargar. Esperá un momento.',
      });
      return;
    }
    setFeedback(null);

    decidirRef.current.createToken(
      formRef.current,
      (status: number, response?: { id?: string; token?: string; error?: unknown }) => {
        if (status !== 200 && status !== 201) {
          const errMsg =
            response?.error == null
              ? ''
              : typeof response.error === 'string'
                ? response.error
                : JSON.stringify(response.error);
          setFeedback({
            type: 'error',
            msg: `Error al tokenizar la tarjeta (${status}): ${errMsg}`,
          });
          return;
        }
        // El SDK de Payway devuelve el token en `id`. Aceptamos `token`
        // como fallback por si en algun ambiente viene con ese nombre.
        const oneTimeToken = response?.id ?? response?.token;
        if (!oneTimeToken) {
          setFeedback({ type: 'error', msg: 'No se pudo obtener el token de la tarjeta.' });
          return;
        }

        const rawNumber = cardNumber.replace(/\s/g, '');
        const bin = rawNumber.slice(0, 6);
        const lastFour = rawNumber.slice(-4);
        const firstDigit = bin[0];
        const paymentMethodId =
          firstDigit === '4' ? 1 : firstDigit === '5' ? 2 : firstDigit === '3' ? 65 : 1;

        const payload: GuardarTarjetaData = {
          socioId,
          token: oneTimeToken,
          paymentMethodId,
          lastFour,
          bin,
        };

        startTransition(async () => {
          const res = await guardarTarjetaSocioAction(payload);
          if (res.error) {
            setFeedback({ type: 'error', msg: res.error });
            toast.error(res.error);
          } else {
            toast.success('Tarjeta registrada correctamente.');
            setShowForm(false);
            router.refresh();
          }
        });
      },
    );
  }

  function handleEliminar() {
    if (!window.confirm('¿Eliminar la tarjeta? El socio dejará de tener débito automático.'))
      return;
    startDelete(async () => {
      const res = await eliminarTarjetaSocioAction(socioId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Tarjeta eliminada.');
        setShowForm(true);
        router.refresh();
      }
    });
  }

  if (!paywayPublicKey) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-8">
        <h2 className="mb-2 text-base font-bold" style={{ color: '#101828' }}>
          Débito automático
        </h2>
        <p className="text-sm text-gray-500">
          Esta guardería no tiene Payway configurado. Cargá las credenciales en{' '}
          <a href="/configuracion?tab=payway" className="text-primary underline">
            Configuración → Payway
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <>
      <Script
        src={PAYWAY_USE_SANDBOX ? PAYWAY_SDK_DEV : PAYWAY_SDK_PROD}
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />

      <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-8">
        <h2 className="mb-1 text-base font-bold" style={{ color: '#101828' }}>
          Débito automático
        </h2>
        <p className="mb-6 text-sm text-gray-500">
          Registrá la tarjeta del socio para cobrarle automáticamente cada mes.
        </p>

        {paywayToken && !showForm && (
          <div className="mb-6 flex items-center justify-between rounded-[10px] border border-[#CAE6E4] bg-[#ECFDF3] px-4 py-3">
            <div className="text-sm text-[#175861]">
              <span className="font-semibold">
                {CARD_BRAND[paywayToken.paymentMethodId] ?? 'Tarjeta'} •••• {paywayToken.lastFour}
              </span>
              {' — '}
              <span>{paywayToken.activo ? 'Débito automático activo' : 'Inactiva'}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="ml-4 text-xs text-[#175861] underline hover:opacity-70"
            >
              Reemplazar
            </button>
          </div>
        )}

        {showForm && (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Número de tarjeta">
                  <input
                    className={inputCls}
                    type="text"
                    inputMode="numeric"
                    placeholder="XXXX XXXX XXXX XXXX"
                    maxLength={19}
                    value={cardNumber}
                    data-decidir="card_number"
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
                      setCardNumber(digits.replace(/(\d{4})(?=\d)/g, '$1 '));
                    }}
                  />
                </Field>
              </div>
              <Field label="Mes de vencimiento">
                <input
                  className={inputCls}
                  type="text"
                  inputMode="numeric"
                  placeholder="MM"
                  maxLength={2}
                  value={expMonth}
                  data-decidir="card_expiration_month"
                  onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field label="Año de vencimiento">
                <input
                  className={inputCls}
                  type="text"
                  inputMode="numeric"
                  placeholder="AA"
                  maxLength={2}
                  value={expYear}
                  data-decidir="card_expiration_year"
                  onChange={(e) => setExpYear(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field label="Código de seguridad (CVV)">
                <input
                  className={inputCls}
                  type="password"
                  inputMode="numeric"
                  placeholder="XXX"
                  maxLength={4}
                  value={cvv}
                  data-decidir="security_code"
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field label="Titular (como figura en la tarjeta)">
                <input
                  className={inputCls}
                  type="text"
                  placeholder="NOMBRE APELLIDO"
                  value={holder}
                  data-decidir="card_holder_name"
                  onChange={(e) => setHolder(e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Tipo de documento">
                <select
                  className={inputCls}
                  value={docType}
                  data-decidir="card_holder_doc_type"
                  onChange={(e) => setDocType(e.target.value)}
                >
                  <option value="dni">DNI</option>
                  <option value="cuit">CUIT</option>
                  <option value="cuil">CUIL</option>
                  <option value="cdi">CDI</option>
                  <option value="lc">LC</option>
                  <option value="le">LE</option>
                  <option value="otro">Otro</option>
                </select>
              </Field>
              <Field label="Número de documento">
                <input
                  className={inputCls}
                  type="text"
                  inputMode="numeric"
                  placeholder="Solo números"
                  value={docNumber}
                  data-decidir="card_holder_doc_number"
                  onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-500">
                  El primer cobro real se generará automáticamente en el próximo ciclo de
                  facturación.
                </p>
              </div>
            </div>

            {feedback && (
              <p
                className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-[#175861]'}`}
              >
                {feedback.msg}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pending || !scriptReady}
                className="bg-primary hover:bg-primary/90 rounded-[10px] px-6 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? 'Procesando…' : !scriptReady ? 'Cargando SDK…' : 'Registrar tarjeta'}
              </button>
              {paywayToken && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFeedback(null);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}

        {paywayToken && !showForm && (
          <div className="mt-8 border-t border-gray-100 pt-6">
            <button
              type="button"
              onClick={handleEliminar}
              disabled={pendingDelete}
              className="rounded-[10px] border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingDelete ? 'Eliminando…' : 'Eliminar tarjeta'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
