'use client';

import { Fragment, useState, useTransition, useRef, useEffect, useMemo } from 'react';
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
  Search,
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
import { cargarServicioAction, obtenerPdfFacturaAction } from '@/app/actions/facturacion';
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
  toggleCobroAutomaticoPaywayAction,
  toggleComprobanteInternoAction,
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
import { getLedgerSaldoAFavorAction, type LedgerSaldoAFavorEntry } from '@/app/actions/movimientos';
import { buscarRankeado } from '@/lib/buscador';
import { formatArgentinaDate, formatArgentinaDateTime, formatNaiveDateTime } from '@/lib/dates';
import { escribirTabEnUrl, type SocioTabId } from '@/lib/tab-url';
import { precioSinIva } from '@/lib/iva';
import { ASTILLEROS } from '../astilleros';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { inputCls, Field } from '@/components/shared/forma-pago';
import { TablaScrollX } from '@/components/shared/tabla-scroll-x';

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
  direccionNumero: string | null;
  ciudad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  contactoEmergencia: string | null;
  razonSocial: string | null;
  cuit: string | null;
  direccionFiscal: string | null;
  direccionFiscalNumero: string | null;
  ciudadFiscal: string | null;
  provinciaFiscal: string | null;
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
  // Tilde "Comprobante interno" (Datos Impositivos): default del toggle
  // Interno/Fiscal en Cargar Servicio.
  comprobanteInterno: boolean;
  // Tilde "Cobro Automático Payway" (Datos Impositivos): adhesión general al
  // débito automático. Requiere tarjeta cargada.
  cobroAutomaticoPayway: boolean;
  // Fecha (YYYY-MM-DD) del último destilde; null si nunca se destildó o si se
  // re-tildó después.
  cobroAutomaticoBaja: string | null;
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
  facturaId: string | null;
  facturaCodigo: string | null;
  facturaArchivo: string | null;
  facturaTipo: string | null;
  facturaTipoRecibo: 'fiscal' | 'interno' | null;
  comprobanteInterno: boolean;
  // Fecha de vencimiento (YYYY-MM-DD): la guardada en la factura fiscal, o —
  // para comprobantes internos, que no la guardan — emisión + plazo de pago
  // de la tarifa. Null si el cargo no tiene comprobante.
  fechaVencimiento: string | null;
  // Cuánto de este cargo cubre puntualmente una Nota de Crédito de SU propia
  // factura (no una bolsa común) — ver src/lib/nc-cobertura.ts. Null si
  // ninguna NC aplica a este cargo.
  montoCubiertoNc: string | null;
  // Cuánto de este cargo cubre puntualmente un pago de Cobranzas aplicado a
  // SU comprobante (pagos parciales targeted) — ver cobranza-cobertura.ts.
  montoCubiertoRecibo: string | null;
  // Para movimientos de PAGO targeted: cuánto de su haber ya está aplicado a
  // comprobantes puntuales — solo el excedente entra al pool genérico.
  haberComprometido: string | null;
  // true si este movimiento ES el asiento de una NC ya aplicada arriba —
  // no debe sumar al pool genérico de cobertura (ver calcularSaldoYEstado).
  esMovimientoNc: boolean;
  // Nº de operación de los Servicios Contratados que originaron el cargo —
  // más de uno si el comprobante agrupa varios SC. Null en pagos, notas y
  // cargos anteriores al modelo "los cargos nacen al emitir".
  numeroOperacion: number[] | null;
  // true = este pago es un adelanto sin comprobante (Cobranzas -> "Continuar
  // sin comprobantes"). No debe saldar OTRO cargo solo en la inferencia por
  // fila — ver calcularSaldoYEstado (pedido 2026-08-11).
  esAdelanto: boolean;
};

type Servicio = {
  id: string;
  nombre: string;
  tipo: string;
  tipoCobro: 'fijo' | 'variable';
  // Solo para Variable: 'diaria' = el precio es por día y al cargar el
  // servicio se pide la cantidad de días. Null en Fijo.
  tarifaVariable: 'diaria' | 'mensual' | null;
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
  servicioPoliticaBajaAnticipada: 'mes_completo' | 'proporcional' | null;
  espacioId: string | null;
  numeroOperacion: number;
  fechaAsignacion: string;
  fechaInicio: string;
  fechaBaja: string | null;
  concepto: string | null;
  comprobanteInterno: boolean;
  // true = los cargos de este contrato entran al débito automático Payway
  // (si además el socio está adherido en Datos Impositivos).
  debitoAutomatico: boolean;
  // Solo para contratos de tarifa Variable diaria: días contratados.
  cantidadDias: number | null;
  // true = el contrato ya tiene al menos un cargo emitido. Distingue
  // "Concluido" (Variable facturada, se cerró sola) de "Dado de baja".
  tieneCargo: boolean;
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

type TabId = SocioTabId;
const TAB_POR_DEFECTO: TabId = 'generales';

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
  anulado_nc: 'bg-purple-50 text-purple-700',
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
  pagado: 'Cobrado',
  parcial: 'Parcial',
  facturado: 'Pendiente',
  no_pagado: 'Pendiente',
  vencido: 'Vencido',
  anulado_nc: 'Anulado (NC)',
};

// Agrega a cada movimiento (orden desc: más nuevo primero) el saldo acumulado y
// el estado MOSTRADO. Un cargo figura "Anulado (NC)" cuando lo cubre puntualmente
// una Nota de Crédito de SU PROPIA factura (`montoCubiertoNc`, calculado en el
// server — ver src/lib/nc-cobertura.ts — nunca una bolsa común: una NC que anula
// una factura de $X no puede "sobrar" para cubrir cargos que nunca tuvo
// intención de cancelar). "Cobrado" es cuando lo cubren pagos reales (pool
// genérico FIFO), "Parcial" cuando lo cubierto (NC + pagos) es menor al total
// del cargo, y "Pendiente" cuando todavía no se le asignó nada — asignando del
// más viejo al más nuevo. Es cálculo de display: no cambia el estado guardado
// (la facturación sigue mirando el real). No confundir con la columna
// "Situación" (En Plazo / Vencido), que compara la fecha de vencimiento contra
// hoy — son dos ejes independientes.
//
// Los movimientos con `esMovimientoNc` (el propio asiento-crédito de una NC ya
// aplicada puntualmente arriba) NO suman al pool genérico — si no, esa plata
// "sobra" y vuelve a cubrir cargos no relacionados (el bug original).
//
// Un cargo ya `pagado` (cobranza/Payway/factura marcada pagada) CONSUME su parte
// del pool: su pago ya está comprometido con ese cargo. Si no se descontara, ese
// haber quedaría como "crédito fantasma" cubriendo otros cargos más nuevos y
// mostrándolos pagados de más (doble conteo). Así el total de cargos que figuran
// impagos queda consistente con el saldo neto (Σdebe − Σhaber). Ojo: lo que ya le
// acreditó una NC de su propia factura NO sale del pool (es crédito puntual), y
// una NC emitida DESPUÉS del cobro reescribe el estado a Parcial/Anulado — si no,
// la fila quedaba "Cobrado" para siempre ignorando la acreditación.
//
// Devuelve además `pendiente` por fila: lo que falta cobrar de ese cargo una vez
// descontada la cobertura (NC + pagos targeted + pool). Es la columna "Importe
// pendiente"; en un cargo cancelado al 100% da 0.
function calcularSaldoYEstado<
  T extends {
    tipo: string | null;
    debe: string | null;
    haber: string | null;
    estado: string | null;
    montoCubiertoNc: string | null;
    montoCubiertoRecibo: string | null;
    haberComprometido: string | null;
    esMovimientoNc: boolean;
    esAdelanto: boolean;
  },
>(movimientos: T[]): (T & { saldo: number; estadoDisplay: string | null; pendiente: number })[] {
  const asc = [...movimientos].reverse();
  let acum = 0;
  // Partido en dos baldes, igual que calcularPoolRestante (reconciliar-cuenta.ts,
  // fuente de verdad de este mismo criterio): un adelanto sin comprobante suma
  // a `poolAdelanto` pero NO se usa para inferir "Cobrado" en otro cargo — solo
  // `poolNormal` (excedente de un cobro real) puede hacerlo. Sigue disponible
  // entero hasta que el club lo aplique a mano o el débito automático lo
  // consuma de verdad (pedido 2026-08-11).
  let poolNormal = 0;
  let poolAdelanto = 0;
  for (const m of movimientos) {
    if (m.esMovimientoNc) continue;
    // De un pago de Cobranzas targeted solo entra al pool el excedente no
    // aplicado a comprobantes puntuales (adelanto / saldo a favor).
    const aporte = parseFloat(m.haber ?? '0') - parseFloat(m.haberComprometido ?? '0');
    if (m.esAdelanto) poolAdelanto += aporte;
    else poolNormal += aporte;
    // Contraasiento de anulación de recibo: su debe anula el haber del pago
    // anulado (que sigue sumando arriba) — el neto del par es cero y esa
    // plata no cubre ningún cargo. Resta del mismo balde que sumó el pago
    // anulado (un adelanto anulado siempre tiene esAdelanto=true).
    if (m.tipo === 'anulacion_recibo') {
      if (m.esAdelanto) poolAdelanto -= parseFloat(m.debe ?? '0');
      else poolNormal -= parseFloat(m.debe ?? '0');
    }
  }
  // Consume `poolNormal` primero; si no alcanza, sigue con `poolAdelanto` —
  // solo para un cargo YA `pagado` (hecho consumado: evita inflar la
  // cobertura de otros cargos, no depende de si eso vino de un adelanto).
  function consumirPool(monto: number): void {
    const deNormal = Math.min(poolNormal, monto);
    poolNormal -= deNormal;
    poolAdelanto -= monto - deNormal;
  }
  const conSaldo = asc.map((m) => {
    const venta = parseFloat(m.debe ?? '0');
    const cobranza = parseFloat(m.haber ?? '0');
    acum = acum + venta - cobranza;
    let estadoDisplay = m.estado;
    const montoNc = parseFloat(m.montoCubiertoNc ?? '0');
    const montoRecibo = parseFloat(m.montoCubiertoRecibo ?? '0');
    // Lo que falta cobrar de ESTE cargo. Las filas que no son un cargo (pagos,
    // asientos de NC, contraasientos) no deben nada.
    let pendiente = 0;
    if (venta > 0 && m.tipo !== 'anulacion_recibo') {
      if (m.estado === 'pagado') {
        // Ya pagado: consume el pool (su pago ya está comprometido con ese
        // cargo), no se reescribe. Lo que le aplicó una NC de su factura o un
        // recibo targeted no está en el pool: solo el resto.
        consumirPool(Math.max(0, venta - montoNc - montoRecibo));
        // Una NC parcial emitida DESPUÉS de que el cargo se cobró le acredita
        // una parte: la fila tiene que mostrarlo en vez de quedar "Cobrado"
        // para siempre.
        if (montoNc >= venta - 0.001) estadoDisplay = 'anulado_nc';
        else if (montoNc > 0.001) estadoDisplay = 'parcial';
      } else if (montoNc >= venta - 0.001) {
        // Cubierto puntualmente por la NC de su propia factura.
        estadoDisplay = 'anulado_nc';
      } else if (montoNc + montoRecibo >= venta - 0.001) {
        // Cubierto entero entre la NC y pagos targeted de Cobranzas.
        estadoDisplay = 'pagado';
      } else if (montoNc + montoRecibo + poolNormal >= venta - 0.001) {
        // La cobertura targeted cubre una parte, el pool genérico (sin contar
        // adelantos) completa el resto.
        estadoDisplay = montoNc > 0.001 ? 'anulado_nc' : 'pagado';
        consumirPool(venta - montoNc - montoRecibo);
      } else if (montoNc + montoRecibo + poolNormal > 0.001) {
        // Cubierto solo en parte: consume todo lo que queda de poolNormal y no
        // alcanza para el resto de este cargo ni para otro más nuevo.
        estadoDisplay = 'parcial';
        pendiente = venta - montoNc - montoRecibo - poolNormal;
        poolNormal = 0;
      } else {
        // Sin nada asignado todavía: debe todo.
        pendiente = venta;
      }
    }
    return { ...m, saldo: acum, estadoDisplay, pendiente: Math.max(0, pendiente) };
  });
  return conSaldo.reverse();
}

/**
 * Historial del saldo a favor: de dónde salió cada peso de crédito y en qué se
 * usó. Panel lateral y no un tab nuevo — el tab de cuenta corriente ya es denso
 * y esto es una consulta puntual sobre la card de saldo.
 */
function LedgerSaldoAFavorPanel({
  socioId,
  socioNombre,
  disponible,
  onClose,
}: {
  socioId: string;
  socioNombre: string;
  disponible: number;
  onClose: () => void;
}) {
  const [entradas, setEntradas] = useState<LedgerSaldoAFavorEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    getLedgerSaldoAFavorAction(socioId).then((res) => {
      if (!vigente) return;
      if (res.error) setError(res.error);
      else setEntradas(res.entradas ?? []);
    });
    return () => {
      vigente = false;
    };
  }, [socioId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Historial de saldo a favor
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {socioNombre} — disponible hoy: {fmt(disponible)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="flex-1 overflow-y-auto p-6">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : entradas == null ? (
            <p className="py-8 text-center text-sm text-gray-400">Cargando historial…</p>
          ) : entradas.length === 0 ? (
            <EmptyState
              icon={<DollarSign className="h-7 w-7 opacity-40" />}
              text="Este socio todavía no generó saldo a favor."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Concepto</th>
                  <th className="px-3 py-3 text-right">Monto</th>
                  <th className="px-3 py-3 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {entradas.map((e, i) => (
                  <tr key={`${e.movimientoId}-${i}`} className="border-t border-gray-100">
                    <td className="px-3 py-3 whitespace-nowrap text-gray-500">
                      {e.fecha ? formatArgentinaDate(e.fecha) : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-medium" style={{ color: '#175861' }}>
                        {e.concepto}
                      </span>
                      <span
                        className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.tipo === 'generado'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {e.tipo === 'generado' ? 'Generado' : 'Usado'}
                      </span>
                    </td>
                    <td
                      className="px-3 py-3 text-right font-medium whitespace-nowrap"
                      style={{ color: e.tipo === 'generado' ? '#15803d' : '#B42318' }}
                    >
                      {e.tipo === 'generado' ? '+' : '−'}
                      {fmt(e.monto)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold whitespace-nowrap text-[#101828]">
                      {fmt(e.saldoResultante)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
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

// 'recibo' agrupa RC-/CI- (cobranza), CM-/CL-/CA- (comprobante interno) y RB-
// — ninguno tiene validez fiscal en sí mismo. "Recibo" queda reservado para
// Cobranzas (RC- fiscal / CI- interno): `facturaTipoRecibo` (se completa al
// registrar la cobranza) dice de qué tipo era la deuda que cancela. Todo el
// resto es "Comprobante interno" — nunca "Recibo interno", que es otro
// documento.
function tipoComprobanteLabel(m: {
  facturaTipo: string | null;
  facturaTipoRecibo: 'fiscal' | 'interno' | null;
  facturaCodigo: string | null;
}): string {
  if (m.facturaTipo === 'recibo') {
    if (!(m.facturaCodigo?.startsWith('RC-') || m.facturaCodigo?.startsWith('CI-'))) {
      return 'Comprobante interno';
    }
    return m.facturaTipoRecibo === 'fiscal' ? 'Recibo fiscal' : 'Recibo interno';
  }
  return TIPO_COMPROBANTE_LABEL[m.facturaTipo ?? ''] ?? m.facturaTipo ?? '—';
}

// El link de PDF que TusFacturas devuelve al emitir es temporal y vence (su
// página muestra "no se ha encontrado información…"). Igual que en Ventas
// (abrirPdfFactura), pedimos uno fresco en cada click. La pestaña se abre
// ANTES del await para que el bloqueador de popups no la frene.
async function abrirPdfFacturaFiscal(facturaId: string) {
  const win = window.open('about:blank', '_blank');
  const res = await obtenerPdfFacturaAction(facturaId);
  if (res.error || !res.url) {
    win?.close();
    toast.error(res.error ?? 'No se pudo obtener el PDF.');
    return;
  }
  if (win) win.location.href = res.url;
  else window.open(res.url, '_blank');
}

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

function esTarifaDiaria(s: Servicio | undefined): boolean {
  return s?.tipoCobro === 'variable' && s.tarifaVariable === 'diaria';
}

function ServicioCombobox({
  servicios,
  value,
  onChange,
  interno = false,
}: {
  servicios: Servicio[];
  value: string;
  onChange: (servicioId: string) => void;
  // Contratos Interno se cobran a precio base, sin IVA — el precio mostrado
  // acompaña.
  interno?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const seleccionado = servicios.find((s) => s.id === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // El precio del tarifario ya es el final (IVA incluido): se muestra tal cual,
  // sea el contrato interno o fiscal.
  function precioMostrar(s: Servicio): number {
    return parseFloat(s.precio ?? '0');
  }

  function labelDe(s: Servicio): string {
    if (!s.precio) return s.nombre;
    return `${s.nombre} — ${fmt(precioMostrar(s))}${esTarifaDiaria(s) ? ' por día' : ''}`;
  }

  const grupos = useMemo(() => {
    const filtrados = buscarRankeado(servicios, query, {
      textos: (s) => [s.nombre, CATEGORIA_SERVICIO_LABEL[s.tipo]],
    });
    const map = new Map<string, Servicio[]>();
    for (const s of filtrados) {
      if (!map.has(s.tipo)) map.set(s.tipo, []);
      map.get(s.tipo)!.push(s);
    }
    return Object.keys(CATEGORIA_SERVICIO_LABEL)
      .filter((tipo) => map.has(tipo))
      .map((tipo) => ({ tipo, items: map.get(tipo)! }));
  }, [servicios, query]);

  function select(servicioId: string) {
    onChange(servicioId);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        className={inputCls}
        placeholder="Buscar por nombre o categoría..."
        value={open ? query : seleccionado ? labelDe(seleccionado) : ''}
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
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-[10px] border border-gray-200 bg-white shadow-lg">
          {grupos.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">Sin resultados</p>
          ) : (
            grupos.map(({ tipo, items }) => (
              <div key={tipo}>
                <p className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase">
                  {CATEGORIA_SERVICIO_LABEL[tipo] ?? tipo}
                </p>
                {items.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => select(s.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span style={{ color: '#101828' }}>{s.nombre}</span>
                    {s.precio && (
                      <span className="text-xs text-gray-400">
                        {fmt(precioMostrar(s))}
                        {esTarifaDiaria(s) ? ' por día' : ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AgregarServicioModal({
  open,
  onClose,
  socioId,
  socioNombre,
  servicios,
  comprobanteInternoDefault,
  internosHabilitados,
  debitoInternoHabilitado,
  debitoDefault,
}: {
  open: boolean;
  onClose: () => void;
  socioId: string;
  socioNombre: string;
  servicios: Servicio[];
  // Tilde "Comprobante interno" de Datos Impositivos del socio: define con
  // qué opción arranca el toggle Interno/Fiscal.
  comprobanteInternoDefault: boolean;
  // false = el club no habilitó medios de cobro para comprobantes internos:
  // la opción Interno se apaga.
  internosHabilitados: boolean;
  // false = el club no admite 'Débito automático' como medio para
  // comprobantes internos (Gestión de cobranza): con canal Interno el tilde
  // de débito queda bloqueado.
  debitoInternoHabilitado: boolean;
  // true = el socio está adherido al Cobro Automático Payway (con tarjeta
  // activa): se muestra el tilde de débito, marcado por default.
  debitoDefault: boolean;
}) {
  const router = useRouter();
  const [servicioId, setServicioId] = useState('');
  const [concepto, setConcepto] = useState('');
  const [fechaInicio, setFechaInicio] = useState(todayISODate);
  const [fechaBaja, setFechaBaja] = useState('');
  const [comprobante, setComprobante] = useState<'interno' | 'fiscal'>(
    comprobanteInternoDefault && internosHabilitados ? 'interno' : 'fiscal',
  );
  const [debito, setDebito] = useState(debitoDefault);
  const [cantidadDias, setCantidadDias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState(false);
  const [isPending, startTransition] = useTransition();

  const seleccionado = servicios.find((s) => s.id === servicioId);
  const esDiaria = esTarifaDiaria(seleccionado);
  const diasNum = Number(cantidadDias);
  const diasValidos = Number.isInteger(diasNum) && diasNum >= 1;

  // Canal Interno sin 'Débito automático' entre los medios de la Gestión de
  // cobranza: el tilde de débito no se puede marcar (el club no admite ningún
  // medio compatible con cobro automático para comprobantes internos).
  const debitoBloqueado = comprobante === 'interno' && !debitoInternoHabilitado;

  const isValid = Boolean(servicioId && fechaInicio) && (!esDiaria || diasValidos);

  function handleClose() {
    setServicioId('');
    setConcepto('');
    setFechaInicio(todayISODate());
    setFechaBaja('');
    setComprobante(comprobanteInternoDefault && internosHabilitados ? 'interno' : 'fiscal');
    setDebito(debitoDefault);
    setCantidadDias('');
    setError(null);
    setResult(false);
    onClose();
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await cargarServicioAction({
        socioId,
        servicioId,
        concepto,
        comprobante,
        fechaInicio,
        fechaBaja: fechaBaja || null,
        cantidadDias: esDiaria ? diasNum : null,
        // Sin adhesión del socio el tilde no se muestra: se manda undefined y
        // el server resuelve el default (false). Con el tilde bloqueado
        // (Interno sin débito habilitado) va false, esté como esté el estado.
        debitoAutomatico: debitoDefault ? (debitoBloqueado ? false : debito) : undefined,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult(true);
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
                <p className="font-semibold text-teal-900">Listo, el servicio quedó asignado</p>
                <p className="text-sm text-teal-700">
                  El comprobante se genera desde Ventas cuando corresponda facturarlo.
                </p>
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
                  Concepto
                </label>
                <ServicioCombobox
                  servicios={servicios}
                  value={servicioId}
                  onChange={setServicioId}
                  interno={comprobante === 'interno'}
                />
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
                    Fecha de inicio del servicio
                  </label>
                  <input
                    type="date"
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
                    className={inputCls}
                    value={fechaBaja}
                    onChange={(e) => setFechaBaja(e.target.value)}
                  />
                </div>
              </div>

              {esDiaria && (
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Cantidad de días
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={inputCls}
                    placeholder="Ej: 5"
                    value={cantidadDias}
                    onChange={(e) => setCantidadDias(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-gray-400">
                    {diasValidos && seleccionado?.precio
                      ? `Total a cobrar: ${fmt(
                          parseFloat(seleccionado.precio) * diasNum,
                        )} (tarifa diaria × ${diasNum} ${diasNum === 1 ? 'día' : 'días'})`
                      : 'Esta tarifa es por día: se cobra el precio del tarifario multiplicado por los días que indiques.'}
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Comprobante
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!internosHabilitados}
                    onClick={() => setComprobante('interno')}
                    className={`rounded-[10px] border px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
                  {!internosHabilitados
                    ? 'Los comprobantes internos están deshabilitados: el club no tiene medios de cobro habilitados en Mi Perfil → Datos Impositivos → Gestión de cobranza.'
                    : comprobante === 'interno'
                      ? 'Marca los cargos como no fiscales (NO se facturan por ARCA). Vas a poder emitirles un Comprobante interno desde Ventas cuando corresponda.'
                      : 'Los cargos se facturan por ARCA cuando corresponda (manual o automático), como el resto.'}
                </p>
              </div>

              {debitoDefault && (
                <label
                  className={`flex items-start gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 ${
                    debitoBloqueado ? 'opacity-60' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={debito && !debitoBloqueado}
                    disabled={debitoBloqueado}
                    onChange={(e) => setDebito(e.target.checked)}
                    className="mt-0.5 h-4 w-4 cursor-pointer accent-[#175861] disabled:cursor-not-allowed"
                  />
                  <span>
                    <span className="block text-sm font-medium" style={{ color: '#101828' }}>
                      Incluir este servicio en el débito automático
                    </span>
                    <span className="block text-xs text-gray-500">
                      {debitoBloqueado
                        ? 'Bloqueado: el club no admite Débito automático como medio para comprobantes internos. Habilitalo en Mi Perfil → Datos Impositivos → Gestión de cobranza (comprobantes internos).'
                        : 'El socio está adherido al Cobro Automático Payway: este servicio se cobra con su tarjeta. Destildalo si este servicio en particular se cobra por otro medio.'}
                    </span>
                  </span>
                </label>
              )}

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
        ? await moveOcupanteAction({
            origenId: emb.espacioId!,
            destinoId,
            socioId,
            embarcacionId: emb.id,
          })
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

  if (espaciosFiltrados.length === 0 && !tieneEspacio) {
    return (
      <div className="border-t border-gray-100 pt-4 text-sm text-gray-500">
        No hay espacios disponibles
        {esloraBarcoM != null
          ? ` con eslora igual o mayor a ${esloraBarcoM % 1 === 0 ? esloraBarcoM : esloraBarcoM.toFixed(2)} m (la eslora de esta embarcación).`
          : ' para asignar.'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
      <div className="flex-1">
        <EspacioCombobox
          espacios={espaciosFiltrados}
          value={destinoId}
          onChange={setDestinoId}
          disabled={pending}
          placeholder={tieneEspacio ? 'Buscar otro espacio…' : 'Buscar un espacio…'}
        />
      </div>
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

// Cuando el socio todavía no tiene ninguna embarcación cargada, igual se le
// puede reservar un espacio de antemano (ej. va a traer el barco después).
// Sin embarcación no hay eslora para filtrar: se muestran todos los
// disponibles, sin acotar por tamaño.
function EspacioSinEmbarcacionRow({
  socioId,
  espaciosDisponibles,
}: {
  socioId: string;
  espaciosDisponibles: EspacioOption[];
}) {
  const router = useRouter();
  const [destinoId, setDestinoId] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!destinoId) {
      toast.error('Seleccioná un espacio.');
      return;
    }
    startTransition(async () => {
      const res = await assignEspacioToSocioAction({ socioId, espacioId: destinoId });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Espacio asignado.');
      setDestinoId('');
      router.refresh();
    });
  }

  if (espaciosDisponibles.length === 0) {
    return <p className="mt-4 text-sm text-gray-500">No hay espacios disponibles para asignar.</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex-1">
        <EspacioCombobox
          espacios={espaciosDisponibles}
          value={destinoId}
          onChange={setDestinoId}
          disabled={pending}
          placeholder="Buscar un espacio…"
        />
      </div>
      <button
        onClick={submit}
        disabled={!destinoId || pending}
        className="shrink-0 rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: '#175861' }}
      >
        {pending ? 'Guardando…' : 'Asignar'}
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
          <EspacioSinEmbarcacionRow socioId={socioId} espaciosDisponibles={espaciosDisponibles} />
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
  internosHabilitados = true,
  debitoInternoHabilitado = true,
  saldoAFavorDisponible = 0,
  initialTab = TAB_POR_DEFECTO,
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
  // false = el club no habilitó ningún medio de cobro para comprobantes
  // internos (Mi Perfil → Gestión de cobranza): se apagan los puntos donde
  // nace un comprobante interno.
  internosHabilitados?: boolean;
  // false = el club no tiene 'debito_automatico' entre los medios de la
  // Gestión de cobranza (comprobantes internos): el tilde de débito de un
  // Servicio Contratado Interno queda bloqueado (ej. club solo-Efectivo).
  debitoInternoHabilitado?: boolean;
  // Crédito sin usar del socio (pool FIFO, calculado en el server). Es el mismo
  // número que Cobranzas ofrece aplicar al cobrar — no el neto crudo
  // (haber − debe), que da $0 en cuanto hay más deuda que crédito.
  saldoAFavorDisponible?: number;
  // Pestaña inicial leída del `?tab=` por el Server Component: refrescar (F5)
  // vuelve a la misma vista en vez de saltar a Generales.
  initialTab?: TabId;
}) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  function cambiarTab(id: TabId) {
    setActiveTab(id);
    escribirTabEnUrl(id, TAB_POR_DEFECTO);
  }
  const [modalServicioOpen, setModalServicioOpen] = useState(false);
  // Historial del saldo a favor: se carga al abrirlo (recorre toda la cuenta).
  const [ledgerOpen, setLedgerOpen] = useState(false);

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
    direccionNumero: socio.direccionNumero ?? '',
    ciudad: socio.ciudad ?? '',
    provincia: socio.provincia ?? '',
    codigoPostal: socio.codigoPostal ?? '',
    contactoEmergencia: socio.contactoEmergencia ?? '',
    razonSocial: socio.razonSocial ?? '',
    cuit: socio.cuit ?? '',
    direccionFiscal: socio.direccionFiscal ?? '',
    direccionFiscalNumero: socio.direccionFiscalNumero ?? '',
    ciudadFiscal: socio.ciudadFiscal ?? '',
    provinciaFiscal: socio.provinciaFiscal ?? '',
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
      direccionNumero: socio.direccionNumero ?? '',
      ciudad: socio.ciudad ?? '',
      provincia: socio.provincia ?? '',
      codigoPostal: socio.codigoPostal ?? '',
      contactoEmergencia: socio.contactoEmergencia ?? '',
      razonSocial: socio.razonSocial ?? '',
      cuit: socio.cuit ?? '',
      direccionFiscal: socio.direccionFiscal ?? '',
      direccionFiscalNumero: socio.direccionFiscalNumero ?? '',
      ciudadFiscal: socio.ciudadFiscal ?? '',
      provinciaFiscal: socio.provinciaFiscal ?? '',
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
  // Crédito sin usar: viene del server (pool FIFO), NO del neto crudo. Con el
  // neto, un socio con deuda vieja y un adelanto sin aplicar mostraba $0 acá
  // mientras el modal de cobranza le ofrecía usar ese crédito.
  const totalAFavor = saldoAFavorDisponible;

  // Predicado de filtros de la tabla de cuenta corriente.
  function pasaFiltrosCC(m: Movimiento, estadoEf?: string | null): boolean {
    const est = estadoEf ?? m.estado;
    const fecha = m.fecha ? m.fecha.slice(0, 10) : '';
    if (ccFechaDesde && (!fecha || fecha < ccFechaDesde)) return false;
    if (ccFechaHasta && (!fecha || fecha > ccFechaHasta)) return false;
    if (ccEstado === 'pagado' && est !== 'pagado') return false;
    if (ccEstado === 'anulado_nc' && est !== 'anulado_nc') return false;
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

  // Cards Ventas/Cobranzas: reflejan los movimientos filtrados. Una Nota de
  // Crédito no es una cobranza: RESTA de las ventas (y la ND suma, como
  // cualquier cargo). El contraasiento de una anulación de recibo no es una
  // venta: RESTA de las cobranzas. Cobranzas queda con los cobros reales
  // netos de anulaciones.
  const totalIngresos = movimientosFiltrados.reduce(
    (sum, m) =>
      m.tipo === 'anulacion_recibo'
        ? sum
        : sum +
          parseFloat(m.debe ?? '0') -
          (m.tipo === 'nota_credito' ? parseFloat(m.haber ?? '0') : 0),
    0,
  );
  const totalPagosACuenta = movimientosFiltrados.reduce(
    (sum, m) =>
      m.tipo === 'nota_credito'
        ? sum
        : m.tipo === 'anulacion_recibo'
          ? sum - parseFloat(m.debe ?? '0')
          : sum + parseFloat(m.haber ?? '0'),
    0,
  );

  return (
    <div className="p-4 md:p-8">
      <AgregarServicioModal
        // key: si cambia un tilde de Datos Impositivos, remonta el modal para
        // que el toggle Interno/Fiscal y el tilde de débito arranquen con el
        // default nuevo.
        key={`${socio.comprobanteInterno ? 'ci-interno' : 'ci-fiscal'}-${socio.cobroAutomaticoPayway ? 'da-on' : 'da-off'}`}
        open={modalServicioOpen}
        onClose={() => setModalServicioOpen(false)}
        socioId={socio.id}
        socioNombre={nombre}
        servicios={servicios}
        comprobanteInternoDefault={socio.comprobanteInterno}
        internosHabilitados={internosHabilitados}
        debitoInternoHabilitado={debitoInternoHabilitado}
        debitoDefault={socio.cobroAutomaticoPayway && (paywayToken?.activo ?? false)}
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
              onClick={() => cambiarTab(id)}
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
            <div className="grid grid-cols-[2fr_1fr] gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Calle</label>
                <input
                  className={inputCls}
                  value={editForm.direccion}
                  onChange={setField('direccion')}
                  readOnly={!editando}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Número</label>
                <input
                  className={inputCls}
                  value={editForm.direccionNumero}
                  onChange={setField('direccionNumero')}
                  readOnly={!editando}
                  placeholder="—"
                />
              </div>
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
            internosHabilitados={internosHabilitados}
            tieneTarjeta={paywayToken?.activo ?? false}
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
          internosHabilitados={internosHabilitados}
          debitoInternoHabilitado={debitoInternoHabilitado}
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
                <option value="pagado">Cobrado</option>
                <option value="anulado_nc">Anulado (NC)</option>
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
                  style={{ background: totalPendiente > 0.005 ? '#FEF0E6' : '#E6F8EC' }}
                >
                  {totalPendiente > 0.005 ? (
                    <AlertTriangle className="h-5 w-5" style={{ color: '#E87040' }} />
                  ) : (
                    <DollarSign className="h-5 w-5" style={{ color: '#15803d' }} />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                    {totalPendiente > 0.005 ? 'Saldo cliente' : 'Saldo a favor'}
                  </p>
                  <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
                    {totalPendiente > 0.005 ? fmt(totalPendiente) : fmt(totalAFavor)}
                  </p>
                  {/* Deuda y crédito sin usar pueden convivir: un adelanto
                      aplicado a un comprobante nuevo no cancela una deuda
                      vieja. Con deuda, el crédito se informa aparte. */}
                  {totalPendiente > 0.005 && totalAFavor > 0.005 && (
                    <p className="text-xs font-medium text-green-600">
                      + {fmt(totalAFavor)} a favor sin usar
                    </p>
                  )}
                  {totalAFavor > 0.005 && (
                    <button
                      type="button"
                      onClick={() => setLedgerOpen(true)}
                      className="mt-0.5 text-xs font-medium text-[#175861] hover:underline"
                    >
                      Ver historial
                    </button>
                  )}
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
              <TablaScrollX>
                <table className="w-full min-w-[1500px] text-sm">
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
                      <th className="px-4 py-3">Nº de operación</th>
                      <th className="px-4 py-3">Detalle</th>
                      <th className="px-4 py-3">Vencimiento</th>
                      <th className="px-4 py-3">Situación</th>
                      <th className="px-4 py-3 text-right">Ventas</th>
                      <th className="px-4 py-3 text-right">Cobranzas</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      {/* Cuánto falta cobrar de ESE comprobante (clave con
                          pagos parciales). Cancelado al 100% → $0. */}
                      <th className="px-4 py-3 text-right">Importe pendiente</th>
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
                              colSpan={12}
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
                          : m.concepto?.trim() || m.servicioNombre || '—';
                        return (
                          <tr
                            key={m.id}
                            className="border-t border-gray-100 transition hover:bg-gray-50/50"
                          >
                            <td className="px-4 py-3 text-gray-500">{fmtDate(m.fecha)}</td>
                            <td className="px-4 py-3 text-gray-500">
                              {m.comprobanteInterno && !m.facturaTipo
                                ? 'Comprobante interno'
                                : m.facturaTipo
                                  ? tipoComprobanteLabel(m)
                                  : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              <div className="flex items-center justify-between gap-1.5">
                                <span>{m.facturaCodigo ?? '—'}</span>
                                {m.facturaArchivo &&
                                  // Interno (link a página propia, empieza con
                                  // '/') o sin id: link directo. Fiscal: el PDF
                                  // de TusFacturas vence, se pide fresco.
                                  (m.facturaArchivo.startsWith('/') || !m.facturaId ? (
                                    <a
                                      href={m.facturaArchivo}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Ver comprobante"
                                      className="shrink-0 text-gray-400 hover:text-[#175861]"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </a>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => abrirPdfFacturaFiscal(m.facturaId!)}
                                      title="Ver comprobante"
                                      className="shrink-0 text-gray-400 hover:text-[#175861]"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </button>
                                  ))}
                              </div>
                            </td>
                            {/* Sin relleno de ceros: se muestra el número tal
                                cual (pedido 2026-08-10). Servicios Contratados
                                y el listado de Ventas siguen mostrándolo
                                completado a 6 dígitos. */}
                            <td className="px-4 py-3 text-gray-500">
                              {m.numeroOperacion != null && m.numeroOperacion.length > 0
                                ? m.numeroOperacion.join(', ')
                                : '—'}
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
                                  className={`inline-block rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${
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
                            {/* NC: no es una cobranza — resta en la columna
                                Ventas (importe negativo) y no aparece en
                                Cobranzas. ND: suma en Ventas como un cargo.
                                Contraasiento de anulación de recibo: no es
                                una venta — resta en la columna Cobranzas. */}
                            <td className="px-4 py-3 text-right font-medium text-[#101828]">
                              {m.tipo === 'nota_credito' && cobranza > 0
                                ? `-${fmt(cobranza)}`
                                : venta > 0 && m.tipo !== 'anulacion_recibo'
                                  ? fmt(venta)
                                  : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-green-700">
                              {m.tipo === 'anulacion_recibo' && venta > 0
                                ? `-${fmt(venta)}`
                                : cobranza > 0 && m.tipo !== 'nota_credito'
                                  ? fmt(cobranza)
                                  : '—'}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-semibold ${
                                m.saldo < 0
                                  ? 'text-green-700'
                                  : m.saldo > 0
                                    ? 'text-[#101828]'
                                    : 'text-gray-500'
                              }`}
                            >
                              {fmt(Math.abs(m.saldo))}
                            </td>
                            {/* Importe pendiente: lo que falta cobrar de este
                                comprobante. Solo aplica a cargos — un pago o
                                una anulación no deben nada. Mismo verde/rojo
                                que Cobranzas y Vencido/Vencida, para que la
                                tabla no mezcle dos tonos por el mismo sentido. */}
                            <td className="px-4 py-3 text-right font-medium">
                              {venta > 0 && m.tipo !== 'anulacion_recibo' ? (
                                <span
                                  className={
                                    m.pendiente > 0.005 ? 'text-red-700' : 'text-green-700'
                                  }
                                >
                                  {fmt(m.pendiente)}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {m.tipo === 'anulacion_recibo' ? (
                                  <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium whitespace-nowrap text-gray-500">
                                    Anulación
                                  </span>
                                ) : (
                                  <span
                                    className={`inline-block rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${
                                      ESTADO_BADGE[m.estadoDisplay ?? ''] ??
                                      'bg-gray-100 text-gray-500'
                                    }`}
                                  >
                                    {ESTADO_LABEL[m.estadoDisplay ?? ''] ?? m.estadoDisplay ?? '—'}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </TablaScrollX>
              <Pagination
                page={ccPage}
                totalItems={movimientosFiltrados.length}
                pageSize={CC_PAGE_SIZE}
                onPageChange={setCcPage}
              />
            </>
          )}

          {ledgerOpen && (
            <LedgerSaldoAFavorPanel
              socioId={socio.id}
              socioNombre={nombre}
              disponible={totalAFavor}
              onClose={() => setLedgerOpen(false)}
            />
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
                // Este badge es el ESTADO del acceso, no el permiso de navegar.
                // Decía "Autorizado a Navegar" para todo acceso vigente, así que
                // se lo atribuía también a quien el socio NO autorizó a navegar
                // (y se duplicaba con la pastilla "Navega" en los que sí).
                // El permiso de navegar lo dice `esNavegante` y nada más.
                const estadoLabel =
                  n.estado === 'usado'
                    ? 'Ingresó'
                    : n.estado === 'revocado'
                      ? 'Cancelado'
                      : 'Autorizado';
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
                          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-blue-700">
                            Autorizado a navegar
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
                // La autorización caducó: se sigue listando (es historial del
                // socio) pero se distingue de un pantallazo.
                const vencido =
                  iv.validoHasta != null && iv.validoHasta.slice(0, 10) < todayISODate();
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
                        {iv.validoHasta && (
                          <span className={vencido ? 'text-gray-400' : undefined}>
                            Válido hasta {fmtDate(iv.validoHasta)}
                          </span>
                        )}
                        {iv.telefono && <span>Tel. {iv.telefono}</span>}
                        {iv.dni && <span>DNI {iv.dni}</span>}
                      </div>
                      {iv.motivo && <p className="mt-0.5 text-xs text-gray-400">{iv.motivo}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {vencido && (
                        <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium whitespace-nowrap text-gray-500">
                          Vencido
                        </span>
                      )}
                      <span className="inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-medium whitespace-nowrap text-[#175861]">
                        {tipoLabel}
                      </span>
                    </div>
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

// ─── Combobox: buscar espacio ───────────────────────────────────────────────
// Mismo patrón que el buscador de socio en Ventas (SocioCombobox): un input
// con lupa que al enfocar muestra el listado filtrado, en vez de un <select>
// nativo — pedido del cliente 2026-08-11, para no tener que scrollear un
// dropdown largo buscando el espacio.

function EspacioCombobox({
  espacios,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  espacios: EspacioOption[];
  value: string;
  onChange: (espacioId: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const seleccionado = espacios.find((e) => e.id === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function subtituloDe(e: EspacioOption): string {
    const partes: string[] = [];
    if (e.eslora) partes.push(`${e.eslora} ${e.unidadMetraje === 'pies' ? 'pies' : 'm'}`);
    if (e.precio) {
      partes.push(fmt(Number(e.precio)));
    }
    return partes.join(' · ');
  }

  const filtrados = useMemo(
    () => buscarRankeado(espacios, query, { textos: (e) => [e.label] }),
    [espacios, query],
  );

  function select(espacioId: string) {
    onChange(espacioId);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        className={`${inputCls} pl-9`}
        placeholder={placeholder}
        value={open ? query : (seleccionado?.label ?? '')}
        disabled={disabled}
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
            filtrados.map((e) => (
              <button
                type="button"
                key={e.id}
                onClick={() => select(e.id)}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <span className="shrink-0 font-medium" style={{ color: '#101828' }}>
                  {e.label}
                </span>
                <span className="truncate text-xs text-gray-400">{subtituloDe(e)}</span>
              </button>
            ))
          )}
        </div>
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
  internosHabilitados,
  tieneTarjeta,
}: {
  socio: SocioData;
  editForm: {
    razonSocial: string;
    cuit: string;
    direccionFiscal: string;
    direccionFiscalNumero: string;
    ciudadFiscal: string;
    provinciaFiscal: string;
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
      | 'direccionFiscalNumero'
      | 'ciudadFiscal'
      | 'provinciaFiscal'
      | 'condicionIva'
      | 'condicionIibb'
      | 'emailFacturacion',
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  handleGuardar: () => void;
  handleCancelar: () => void;
  editError: string | null;
  isSaving: boolean;
  internosHabilitados: boolean;
  // true = el socio tiene una tarjeta cargada y activa en Payway.
  tieneTarjeta: boolean;
}) {
  const router = useRouter();
  const [facturaFiscal, setFacturaFiscal] = useState(socio.facturaFiscal);
  const [comprobanteInterno, setComprobanteInterno] = useState(socio.comprobanteInterno);
  const [cobroAutomatico, setCobroAutomatico] = useState(socio.cobroAutomaticoPayway);
  const [cobroAutomaticoBaja, setCobroAutomaticoBaja] = useState(socio.cobroAutomaticoBaja);
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

  function handleToggleComprobanteInterno(checked: boolean) {
    setComprobanteInterno(checked);
    startToggle(async () => {
      const res = await toggleComprobanteInternoAction(socio.id, checked);
      if (res?.error) {
        toast.error(res.error);
        setComprobanteInterno(!checked);
      } else {
        toast.success(
          checked
            ? 'Los servicios nuevos arrancan como Interno'
            : 'Los servicios nuevos arrancan como Fiscal (ARCA)',
        );
        router.refresh();
      }
    });
  }

  function handleToggleCobroAutomatico(checked: boolean) {
    setCobroAutomatico(checked);
    startToggle(async () => {
      const res = await toggleCobroAutomaticoPaywayAction(socio.id, checked);
      if (res?.error) {
        toast.error(res.error);
        setCobroAutomatico(!checked);
      } else {
        setCobroAutomaticoBaja(checked ? null : todayISODate());
        toast.success(
          checked
            ? 'Cobro automático Payway activado. Los servicios nuevos se incluyen en el débito.'
            : 'Cobro automático Payway desactivado.',
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

      {/* Check comprobante interno */}
      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#101828' }}>
            Comprobante interno
          </p>
          <p className="text-xs text-gray-500">
            {internosHabilitados
              ? 'Activado: al cargarle un servicio, el modal arranca en Interno (no va por ARCA). Desactivado: arranca en Fiscal (ARCA). Se puede cambiar en cada carga.'
              : 'Deshabilitado: el club no tiene medios de cobro habilitados para comprobantes internos. Se configuran en Mi Perfil → Datos Impositivos → Gestión de cobranza.'}
          </p>
        </div>
        <input
          type="checkbox"
          checked={comprobanteInterno}
          disabled={isToggling || (!internosHabilitados && !comprobanteInterno)}
          onChange={(e) => handleToggleComprobanteInterno(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[#175861] disabled:cursor-not-allowed"
        />
      </div>

      {/* Check cobro automático Payway */}
      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#101828' }}>
            Cobro Automático Payway
          </p>
          <p className="text-xs text-gray-500">
            {tieneTarjeta
              ? 'Activado: los servicios fiscales de este socio se cobran automáticamente con la tarjeta cargada. Cada Servicio Contratado se puede excluir puntualmente.'
              : 'Para activar esta opción, primero cargá la tarjeta de crédito del socio en la pestaña Débito automático.'}
            {!cobroAutomatico && cobroAutomaticoBaja && (
              <span className="mt-0.5 block text-amber-700">
                Fecha de baja: {fmtYmd(cobroAutomaticoBaja)}
              </span>
            )}
          </p>
        </div>
        <input
          type="checkbox"
          checked={cobroAutomatico}
          disabled={isToggling || (!tieneTarjeta && !cobroAutomatico)}
          onChange={(e) => handleToggleCobroAutomatico(e.target.checked)}
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
        <div className="grid grid-cols-[2fr_1fr] gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Calle fiscal</label>
            <input
              className={inputCls}
              value={editForm.direccionFiscal}
              onChange={setField('direccionFiscal')}
              readOnly={!editando}
              placeholder="—"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Número</label>
            <input
              className={inputCls}
              value={editForm.direccionFiscalNumero}
              onChange={setField('direccionFiscalNumero')}
              readOnly={!editando}
              placeholder="—"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Ciudad fiscal
            </label>
            <input
              className={inputCls}
              value={editForm.ciudadFiscal}
              onChange={setField('ciudadFiscal')}
              readOnly={!editando}
              placeholder="—"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Provincia fiscal
            </label>
            <input
              className={inputCls}
              value={editForm.provinciaFiscal}
              onChange={setField('provinciaFiscal')}
              readOnly={!editando}
              placeholder="—"
            />
          </div>
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
  internosHabilitados,
  debitoInternoHabilitado,
}: {
  movimientos: Movimiento[];
  serviciosContratados: ServicioContratado[];
  socioId: string;
  onCargarServicio: () => void;
  internosHabilitados: boolean;
  debitoInternoHabilitado: boolean;
}) {
  const router = useRouter();
  const [editingSC, setEditingSC] = useState<ServicioContratado | null>(null);

  const hoy = todayISODate();
  // Estados posibles: Vigente / Concluido (Variable ya facturada) / Dado de
  // baja. Un contrato con fecha de inicio a futuro también se muestra
  // Vigente — ya está contratado, solo que factura desde esa fecha.
  function esVigente(sc: ServicioContratado): boolean {
    // Variable se factura una sola vez: al emitirse queda con fechaBaja y
    // deja de estar vigente en el momento, sin esperar a que termine el día.
    if (sc.servicioTipoCobro === 'variable' && sc.fechaBaja) return false;
    return !sc.fechaBaja || sc.fechaBaja >= hoy;
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
                <th className="pr-4 pb-2">Concepto</th>
                <th className="pr-4 pb-2">Categoría</th>
                <th className="pr-4 pb-2">Facturación</th>
                <th className="pr-4 pb-2">Cobro</th>
                <th className="pr-4 pb-2">Débito autom.</th>
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
                return (
                  <Fragment key={sc.id}>
                    <tr className="border-b border-gray-50 last:border-0">
                      <td className="py-3 pr-4">
                        <span className="font-medium" style={{ color: '#101828' }}>
                          {sc.servicioNombre}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {sc.servicioTipo
                          ? (CATEGORIA_SERVICIO_LABEL[sc.servicioTipo] ?? sc.servicioTipo)
                          : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            sc.comprobanteInterno
                              ? 'bg-gray-100 text-gray-600'
                              : 'bg-[#EFF8F7] text-[#175861]'
                          }`}
                        >
                          {sc.comprobanteInterno ? 'Interno' : 'Legal'}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {sc.servicioTipoCobro ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                sc.servicioTipoCobro === 'fijo'
                                  ? 'bg-[#EFF8F7] text-[#175861]'
                                  : 'bg-[#FFF4E6] text-[#B45309]'
                              }`}
                            >
                              {sc.servicioTipoCobro === 'fijo' ? 'Fijo' : 'Variable'}
                            </span>
                            {sc.cantidadDias != null && (
                              <span className="text-xs text-gray-400">
                                {sc.cantidadDias} {sc.cantidadDias === 1 ? 'día' : 'días'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {sc.debitoAutomatico ? (
                          <span className="rounded-full bg-[#EFF8F7] px-2 py-0.5 text-[10px] font-semibold text-[#175861]">
                            Sí
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                            No
                          </span>
                        )}
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
                        ) : sc.servicioTipoCobro === 'variable' && sc.tieneCargo ? (
                          // Variable que se cerró sola al facturarse: terminó
                          // su ciclo, no es una baja del admin.
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Concluido
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                            Dado de baja
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
                            onClick={() => setEditingSC(sc)}
                            className="rounded-[8px] border border-gray-200 p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                            title="Editar servicio contratado"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingSC && (
        <EditServicioContratadoModal
          sc={editingSC}
          movimientos={movimientos.filter((m) => m.servicioId === editingSC.servicioId)}
          internosHabilitados={internosHabilitados}
          debitoInternoHabilitado={debitoInternoHabilitado}
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
// cambiado desde la última vez que se le cobró) y a los días usados del MES
// DONDE CAE LA FECHA DE BAJA: del día 1 de ese mes (o de la fecha de inicio,
// si el servicio arrancó ese mismo mes) hasta la baja inclusive.
function calcularProporcional(
  ultimoMonto: number,
  fechaBaja: string,
  fechaInicio: string | null,
): { monto: number; diasUsados: number; diasMes: number } {
  const baja = new Date(`${fechaBaja}T00:00:00`);
  const diasMes = new Date(baja.getFullYear(), baja.getMonth() + 1, 0).getDate();
  let desde = 1;
  if (fechaInicio) {
    const inicio = new Date(`${fechaInicio}T00:00:00`);
    if (inicio.getFullYear() === baja.getFullYear() && inicio.getMonth() === baja.getMonth()) {
      desde = inicio.getDate();
    }
  }
  const diasUsados = Math.max(0, baja.getDate() - desde + 1);
  const monto = Math.round((diasUsados / diasMes) * ultimoMonto * 100) / 100;
  return { monto, diasUsados, diasMes };
}

function EditServicioContratadoModal({
  sc,
  movimientos,
  internosHabilitados,
  debitoInternoHabilitado,
  onClose,
  onSaved,
}: {
  sc: ServicioContratado;
  movimientos: Movimiento[];
  internosHabilitados: boolean;
  // false = sin 'Débito automático' entre los medios de la Gestión de
  // cobranza: con canal Interno el tilde de débito queda bloqueado.
  debitoInternoHabilitado: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fechaInicio, setFechaInicio] = useState(sc.fechaInicio);
  const [fechaBaja, setFechaBaja] = useState(sc.fechaBaja ?? '');
  const [concepto, setConcepto] = useState(sc.concepto ?? '');
  const [comprobante, setComprobante] = useState<'interno' | 'fiscal'>(
    sc.comprobanteInterno ? 'interno' : 'fiscal',
  );
  const [debito, setDebito] = useState(sc.debitoAutomatico);
  const [cobrar, setCobrar] = useState(true);
  const [montoOverride, setMontoOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Solo se ofrece cobrar cuando la baja recién se está dando de alta (el
  // contrato estaba abierto y ahora se le pone fecha de baja) — no al
  // simplemente corregir una fecha en un contrato que ya estaba cerrado.
  const esBajaNueva = sc.fechaBaja === null && fechaBaja !== '';

  // Canal Interno sin 'Débito automático' entre los medios de la Gestión de
  // cobranza: el tilde de débito no se puede marcar.
  const debitoBloqueado = comprobante === 'interno' && !debitoInternoHabilitado;

  const ultimoMov = [...movimientos]
    .filter((m) => m.fecha)
    .sort((a, b) => (b.fecha! > a.fecha! ? 1 : -1))[0];
  const ultimoMonto = ultimoMov ? parseFloat(ultimoMov.debe ?? '0') || 0 : 0;
  // El precio del tarifario ya es el final (IVA incluido), igual para interno y
  // fiscal.
  const precioCompleto = sc.servicioPrecio != null ? Number(sc.servicioPrecio) : 0;
  const proporcional = fechaBaja
    ? calcularProporcional(ultimoMonto || precioCompleto, fechaBaja, fechaInicio || null)
    : { monto: precioCompleto, diasUsados: 0, diasMes: 0 };
  const esMesCompleto = sc.servicioPoliticaBajaAnticipada === 'mes_completo';
  const montoSugerido = esMesCompleto ? precioCompleto : proporcional.monto;
  const montoFinal = montoOverride !== null ? parseFloat(montoOverride) || 0 : montoSugerido;

  function handleGuardar() {
    setError(null);
    if (!fechaInicio) {
      setError('La fecha de inicio es obligatoria.');
      return;
    }
    if (fechaBaja && fechaBaja < fechaInicio) {
      setError('La fecha de baja no puede ser anterior a la fecha de inicio.');
      return;
    }
    startTransition(async () => {
      const res = await updateSocioServicioAction({
        id: sc.id,
        fechaInicio,
        fechaBaja: fechaBaja || null,
        concepto: concepto.trim() || null,
        comprobanteInterno: comprobante === 'interno',
        debitoAutomatico: debitoBloqueado ? false : debito,
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
              className={inputCls}
              value={fechaBaja}
              onChange={(e) => {
                setFechaBaja(e.target.value);
                // El sugerido depende de la fecha de baja: al cambiarla se
                // descarta el monto tipeado a mano para recalcular.
                setMontoOverride(null);
              }}
            />
            <p className="mt-1 text-xs text-gray-400">
              Vacío = sigue vigente. Puede ser una fecha pasada (baja retroactiva), mientras no sea
              anterior a la fecha de inicio.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: '#101828' }}>
              Detalle del servicio
            </label>
            <input
              className={inputCls}
              placeholder="Descripción opcional"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold" style={{ color: '#101828' }}>
              Comprobante
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                // Con la config de cobranzas vacía no se puede PASAR a
                // Interno; si el contrato ya era Interno, se deja como está.
                disabled={!internosHabilitados && !sc.comprobanteInterno}
                onClick={() => setComprobante('interno')}
                className={`rounded-[10px] border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
                className={`rounded-[10px] border px-3 py-2 text-sm font-medium transition ${
                  comprobante === 'fiscal'
                    ? 'border-[#175861] bg-[#EFF8F7] text-[#175861]'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Fiscal (ARCA)
              </button>
            </div>
          </div>

          <label
            className={`flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 ${
              debitoBloqueado ? 'opacity-60' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={debito && !debitoBloqueado}
              disabled={debitoBloqueado}
              onChange={(e) => setDebito(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-[#175861] disabled:cursor-not-allowed"
            />
            <span className="text-xs text-gray-600">
              <span className="block font-semibold" style={{ color: '#101828' }}>
                Incluir este servicio en el débito automático
              </span>
              {debitoBloqueado
                ? 'Bloqueado: el club no admite Débito automático como medio para comprobantes internos. Habilitalo en Mi Perfil → Datos Impositivos → Gestión de cobranza (comprobantes internos).'
                : 'Solo tiene efecto si el socio está adherido al Cobro Automático Payway (Datos Impositivos) con tarjeta cargada.'}
            </span>
          </label>

          {esBajaNueva && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={cobrar}
                  onChange={(e) => setCobrar(e.target.checked)}
                />
                Cobrar por esta baja — política:{' '}
                <strong>
                  {esMesCompleto
                    ? 'mes completo'
                    : `proporcional (${proporcional.diasUsados}/${proporcional.diasMes} días)`}
                </strong>
              </label>
              {cobrar && (
                <>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={montoOverride ?? montoSugerido.toFixed(2)}
                    onChange={(e) => setMontoOverride(e.target.value)}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 mt-2 h-10 w-full rounded-[8px] border bg-white px-3 text-center text-lg font-bold focus-visible:ring-[3px] focus-visible:outline-none"
                    style={{ color: '#101828' }}
                  />
                  <p className="mt-1.5 text-xs text-gray-500">
                    El cobro queda pendiente y se incluirá en el próximo comprobante que se emita al
                    socio (manual o automático).
                  </p>
                </>
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
