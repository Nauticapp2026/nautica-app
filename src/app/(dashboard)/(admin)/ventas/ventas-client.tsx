'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  CreditCard,
  Download,
  Edit3,
  FileDown,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';

import {
  crearComprobanteInternoAction,
  crearComprobanteInternoLoteAction,
  createBatchInvoicesAction,
  createInvoiceAction,
  emitirNotaCreditoAction,
  getSocioPendientesAction,
  getSocioPendientesInternoAction,
  markInvoicePaidAction,
  type BatchResult,
  type ComprobanteInternoLoteResult,
  type EmitirNcMotivo,
  type MovimientoPendiente,
} from '@/app/actions/facturacion';
import { reintentarCobroPaywayAction } from '@/app/actions/payway';
import { toast } from 'sonner';
import { formatArgentinaDate } from '@/lib/dates';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
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
};

type LoteMovimiento = {
  id: string;
  concepto: string | null;
  debe: string | null;
  servicioNombre: string | null;
  tipoServicio: string | null;
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

type CobroPayway = {
  id: string;
  socioId: string;
  socioNombre: string;
  monto: number; // centavos
  estado: 'aprobado' | 'rechazado' | 'pendiente' | 'error';
  errorMensaje: string | null;
  movimientosIds: string[];
  createdAt: string;
};

const ESTADO_OPTS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'pagada', label: 'Pagada' },
  { value: 'vencida', label: 'Vencida' },
];

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
};

const TIPO_FACTURA_OPTS = [
  { value: 'factura_c', label: 'Factura C (Monotributo)' },
  { value: 'factura_b', label: 'Factura B (Consumidor Final)' },
  { value: 'factura_a', label: 'Factura A (Responsable Inscripto)' },
];

function derivarTipoFactura(
  guarderiaCondicion: string | null,
  socioCondicion: string | null,
): string {
  if (guarderiaCondicion !== 'responsable_inscripto') return 'factura_c';
  if (socioCondicion === 'responsable_inscripto') return 'factura_a';
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

const ESTADO_LABEL: Record<string, string> = {
  pagada: 'Pagada',
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

const fmtDate = formatArgentinaDate;

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

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return socios;
    return socios.filter((s) => {
      if (s.nombre.toLowerCase().includes(q)) return true;
      if (s.numeroSocio != null && String(s.numeroSocio).includes(q)) return true;
      if (s.embarcaciones.some((e) => e.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [socios, query]);

  function select(socioId: string) {
    onChange(socioId);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        className={inputCls}
        placeholder="Buscar por nombre, Nº de socio o embarcación..."
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
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <span className="font-medium" style={{ color: '#101828' }}>
                  {s.nombre}
                </span>
                {(s.numeroSocio != null || s.embarcaciones.length > 0) && (
                  <span className="text-xs text-gray-400">
                    {s.numeroSocio != null ? `Nº ${s.numeroSocio}` : ''}
                    {s.numeroSocio != null && s.embarcaciones.length > 0 ? ' · ' : ''}
                    {s.embarcaciones.join(', ')}
                  </span>
                )}
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
}: {
  open: boolean;
  onClose: () => void;
  socios: Socio[];
  guarderiaCondicionIva: string | null;
}) {
  const router = useRouter();
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
  const [movimientos, setMovimientos] = useState<MovimientoPendiente[]>([]);
  const [selectedMovs, setSelectedMovs] = useState<Set<string>>(() => new Set());
  const [loadingMovs, setLoadingMovs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSocioChange(socioId: string) {
    const socio = socios.find((s) => s.id === socioId);
    const tipoFactura = derivarTipoFactura(
      guarderiaCondicionIva,
      socio ? condicionIvaEfectiva(socio) : null,
    );
    setForm((f) => ({ ...f, socioId, tipoFactura }));
    setMovimientos([]);
    setSelectedMovs(new Set());
    setError(null);
    if (!socioId) return;
    setLoadingMovs(true);
    getSocioPendientesAction(socioId)
      .then((res) => {
        if (res.error) {
          setError(res.error);
        } else {
          const movs = res.movimientos ?? [];
          setMovimientos(movs);
          setSelectedMovs(new Set(movs.map((m) => m.id)));
        }
      })
      .finally(() => setLoadingMovs(false));
  }

  const totalSeleccionado = useMemo(
    () =>
      movimientos
        .filter((m) => selectedMovs.has(m.id))
        .reduce((s, m) => s + parseFloat(m.debe || '0'), 0),
    [movimientos, selectedMovs],
  );

  const isValid = Boolean(
    form.socioId &&
    form.descripcion.trim() &&
    form.fecha &&
    form.vencimiento &&
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
    setError(null);
    setSuccess(null);
    onClose();
  }

  function handleSubmit() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await createInvoiceAction({
        socioId: form.socioId,
        tipoFactura: form.tipoFactura as never,
        condicionVenta: form.condicionVenta as never,
        medioPago: form.medioPago as never,
        estado: form.estado as never,
        descripcion: form.descripcion,
        fecha: form.fecha,
        vencimiento: form.vencimiento,
        desde: form.desde,
        hasta: form.hasta,
        movimientoIds: Array.from(selectedMovs),
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

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Socio*
              </label>
              <SocioCombobox socios={socios} value={form.socioId} onChange={handleSocioChange} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
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

          {/* Checklist de movimientos pendientes */}
          {form.socioId && (
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
                  Este socio no tiene movimientos pendientes.
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
                        </p>
                        <p className="text-xs text-gray-400">{fmtDate(m.fecha)}</p>
                      </div>
                      <p className="text-sm font-medium" style={{ color: '#175861' }}>
                        {fmtMoney(m.debe)}
                      </p>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Tipo de comprobante
              </label>
              <input
                className={`${inputCls} cursor-not-allowed bg-gray-50 text-gray-700`}
                value={
                  TIPO_FACTURA_OPTS.find((o) => o.value === form.tipoFactura)?.label ??
                  form.tipoFactura
                }
                readOnly
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
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
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Descripción*
              </label>
              <input
                className={inputCls}
                placeholder="Detalle del comprobante"
                value={form.descripcion}
                onChange={set('descripcion')}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Estado*
              </label>
              <select className={inputCls} value={form.estado} onChange={set('estado')}>
                {ESTADO_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
              Forma de pago
            </label>
            <select className={inputCls} value={form.medioPago} onChange={set('medioPago')}>
              {MEDIO_PAGO_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Fecha*
              </label>
              <input type="date" className={inputCls} value={form.fecha} onChange={set('fecha')} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Vencimiento*
              </label>
              <input
                type="date"
                className={inputCls}
                value={form.vencimiento}
                onChange={set('vencimiento')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Período desde*
              </label>
              <input type="date" className={inputCls} value={form.desde} onChange={set('desde')} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Período hasta*
              </label>
              <input type="date" className={inputCls} value={form.hasta} onChange={set('hasta')} />
            </div>
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
          {/* Total destacado */}
          {form.socioId && selectedMovs.size > 0 && (
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
              {isPending ? 'Emitiendo...' : 'Emitir comprobante'}
            </button>
          </div>
        </div>
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
  const [socioId, setSocioId] = useState('');
  const [fecha, setFecha] = useState(todayIso);
  const [movimientos, setMovimientos] = useState<MovimientoPendiente[]>([]);
  const [selectedMovs, setSelectedMovs] = useState<Set<string>>(() => new Set());
  const [loadingMovs, setLoadingMovs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSocioChange(id: string) {
    setSocioId(id);
    setMovimientos([]);
    setSelectedMovs(new Set());
    setError(null);
    if (!id) return;
    setLoadingMovs(true);
    getSocioPendientesInternoAction(id)
      .then((res) => {
        if (res.error) {
          setError(res.error);
        } else {
          const movs = res.movimientos ?? [];
          setMovimientos(movs);
          setSelectedMovs(new Set(movs.map((m) => m.id)));
        }
      })
      .finally(() => setLoadingMovs(false));
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
      const res = await crearComprobanteInternoAction({
        socioId,
        fecha,
        movimientoIds: Array.from(selectedMovs),
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
              Consolidá los cargos Interno pendientes del socio en un solo comprobante
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Socio*
              </label>
              <SocioCombobox socios={socios} value={socioId} onChange={handleSocioChange} />
            </div>
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
          </div>

          {socioId && (
            <div className="rounded-[10px] border border-gray-100 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                    Cargos internos pendientes
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
                  Este socio no tiene cargos internos pendientes.
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
                        </p>
                        <p className="text-xs text-gray-400">{fmtDate(m.fecha)}</p>
                      </div>
                      <p className="text-sm font-medium" style={{ color: '#175861' }}>
                        {fmtMoney(m.debe)}
                      </p>
                    </label>
                  ))}
                </div>
              )}
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
          {socioId && selectedMovs.size > 0 && (
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
              {isPending ? 'Emitiendo...' : 'Emitir comprobante'}
            </button>
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
}: {
  open: boolean;
  onClose: () => void;
  socios: Socio[];
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
        .map((s) => ({
          socioId: s.id,
          movimientoIds: s.movsFiltrados.filter((m) => isMovSel(s.id, m.id)).map((m) => m.id),
        }))
        .filter((s) => s.movimientoIds.length > 0);

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
        .map((s) => ({
          socioId: s.id,
          movimientoIds: s.movimientos.filter((m) => isMovSel(s.id, m.id)).map((m) => m.id),
        }))
        .filter((s) => s.movimientoIds.length > 0);

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
              Marcar como pagada
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

const MOTIVO_OPTS = [
  { value: 'anulacion_total', label: 'Anulación total' },
  { value: 'descuento_parcial', label: 'Descuento parcial' },
  { value: 'devolucion_servicio', label: 'Devolución de servicio' },
];

function NotaCreditoModal({
  open,
  onClose,
  factura,
}: {
  open: boolean;
  onClose: () => void;
  factura: Factura | null;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState<EmitirNcMotivo>('anulacion_total');
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
  const needsImporte = motivo !== 'anulacion_total';

  function handleSubmit() {
    if (!factura) return;
    setError(null);
    const importeNum = needsImporte ? parseFloat(importe.replace(',', '.')) : undefined;
    startTransition(async () => {
      const res = await emitirNotaCreditoAction({
        facturaOriginalId: factura.id,
        motivo,
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
              Emitir Nota de Crédito
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
                <p className="font-semibold text-teal-900">NC emitida correctamente</p>
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
              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Motivo
                </label>
                <select
                  className={inputCls}
                  value={motivo}
                  onChange={(e) => {
                    setMotivo(e.target.value as EmitirNcMotivo);
                    setImporte('');
                  }}
                >
                  {MOTIVO_OPTS.map((o) => (
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
                      (máx. {fmtMoney(factura.importe)})
                    </span>
                  </label>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    placeholder={`0,00 (máx ${importeOriginal.toFixed(2)})`}
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
                  {isPending ? 'Emitiendo...' : 'Emitir NC'}
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
}: {
  open: boolean;
  onClose: () => void;
  facturas: Factura[];
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
  cobrosPayway,
  guarderiaCondicionIva,
}: {
  facturas: Factura[];
  socios: Socio[];
  sociosInterno: SocioInterno[];
  kpis: Kpis;
  posConfigurado: boolean;
  certificadoOk: boolean;
  cobrosPayway: CobroPayway[];
  guarderiaCondicionIva: string | null;
}) {
  const [activeTab, setActiveTab] = useState<'afip' | 'recibos' | 'payway'>('afip');
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
          const q = search.toLowerCase();
          const tipo = TIPO_FACTURA_LABEL[f.tipoFactura ?? ''] ?? f.tipoFactura ?? '';
          const ok =
            (f.codigo ?? '').toLowerCase().includes(q) ||
            (f.folioLocal ?? '').toLowerCase().includes(q) ||
            tipo.toLowerCase().includes(q) ||
            f.socioNombre.toLowerCase().includes(q) ||
            (f.descripcion ?? '').toLowerCase().includes(q);
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

  // Tabla Recibos internos
  const filtradosRecibos = useMemo(() => {
    return facturas
      .filter((f) => f.tipoFactura === 'recibo')
      .filter((f) => {
        if (search.trim()) {
          const q = search.toLowerCase();
          const ok =
            (f.codigo ?? '').toLowerCase().includes(q) ||
            f.socioNombre.toLowerCase().includes(q) ||
            (f.descripcion ?? '').toLowerCase().includes(q);
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
      const cols = ['Número', 'Cliente', 'Fecha', 'Total', 'Descripción'];
      const rows = filtradosRecibos.map((f) =>
        [
          f.codigo ?? '',
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
      />
      <LoteModal open={loteOpen} onClose={() => setLoteOpen(false)} socios={socios} />
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
      <NotaCreditoModal open={!!ncFactura} onClose={() => setNcFactura(null)} factura={ncFactura} />
      <LoteNotaCreditoModal
        open={loteNcOpen}
        onClose={() => {
          setLoteNcOpen(false);
          setSelectedNc(new Set());
        }}
        facturas={facturasSeleccionadas}
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
              <DropdownMenuItem onSelect={() => setComprobanteInternoOpen(true)}>
                Comprobante interno manual
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setComprobanteInternoLoteOpen(true)}>
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
        <KpiCard value={String(kpis.pagadasMes)} label="Pagadas este mes" />
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
          Recibos internos
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {facturas.filter((f) => f.tipoFactura === 'recibo').length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('payway')}
          className={`px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'payway'
              ? 'border-b-2 border-[#175861] text-[#175861]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Débito automático
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {cobrosPayway.length}
          </span>
        </button>
      </div>

      {/* Tab: Débito automático Payway */}
      {activeTab === 'payway' && <PaywayCobrosList cobros={cobrosPayway} />}

      {/* Tabla afip / recibos */}
      {activeTab !== 'payway' && (
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
                    <option value="pagada">Pagada</option>
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
                    <button
                      onClick={() => setLoteNcOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
                      style={{ background: '#175861' }}
                    >
                      <CornerDownLeft className="h-4 w-4" />
                      Emitir NC en lote
                    </button>
                    <button
                      onClick={() => setSelectedNc(new Set())}
                      className="text-sm text-gray-500 transition hover:text-gray-700"
                    >
                      Limpiar selección
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
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
                        <th className="px-4 py-3">Número</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Cliente</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Vencimiento</th>
                        <th className="px-4 py-3">Período</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-center">Estado</th>
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
                            <td className="px-4 py-3 font-medium" style={{ color: '#101828' }}>
                              {f.codigo ?? '—'}
                              {f.folioLocal && (
                                <div className="text-xs font-normal text-gray-400">
                                  {f.folioLocal}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {TIPO_FACTURA_LABEL[f.tipoFactura ?? ''] ?? '—'}
                            </td>
                            <td className="px-4 py-3 font-medium" style={{ color: '#175861' }}>
                              {f.socioNombre}
                            </td>
                            <td className="px-4 py-3 text-gray-500">{fmtDate(f.emision)}</td>
                            <td className="px-4 py-3 text-gray-500">{fmtDate(f.vencimiento)}</td>
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
                            <td
                              className="px-4 py-3 text-right font-medium"
                              style={{ color: '#101828' }}
                            >
                              {fmtMoney(f.importe)}
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
                                  title="Marcar como pagada"
                                  className="rounded-[6px] p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-[#175861] disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                                {f.archivo ? (
                                  <a
                                    href={f.archivo}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Ver PDF"
                                    className="rounded-[6px] p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-[#175861]"
                                  >
                                    <Send className="h-4 w-4" />
                                  </a>
                                ) : (
                                  <button
                                    disabled
                                    title="PDF no disponible"
                                    className="rounded-[6px] p-1.5 text-gray-400 opacity-30"
                                  >
                                    <Send className="h-4 w-4" />
                                  </button>
                                )}
                                {f.archivo ? (
                                  <a
                                    href={f.archivo}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download
                                    title="Descargar"
                                    className="rounded-[6px] p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-[#175861]"
                                  >
                                    <Download className="h-4 w-4" />
                                  </a>
                                ) : (
                                  <button
                                    disabled
                                    title="PDF no disponible"
                                    className="rounded-[6px] p-1.5 text-gray-400 opacity-30"
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                )}
                                {(f.tipoFactura === 'factura_a' ||
                                  f.tipoFactura === 'factura_b' ||
                                  f.tipoFactura === 'factura_c') &&
                                f.cae ? (
                                  <button
                                    onClick={() => setNcFactura(f)}
                                    title="Emitir Nota de Crédito"
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
                </div>
                <Pagination
                  page={afipPage}
                  totalItems={filtradosAfip.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                />
              </>
            )
          ) : // Tab: Recibos internos
          filtradosRecibos.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-7 w-7 opacity-40" />}
              text={
                hasFiltrosRecibos
                  ? 'No se encontraron recibos con ese criterio.'
                  : 'Todavía no hay recibos internos emitidos.'
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Fecha</th>
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
                        <td className="px-4 py-3 font-medium" style={{ color: '#101828' }}>
                          {f.codigo ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: '#175861' }}>
                          {f.socioNombre}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{fmtDate(f.emision)}</td>
                        <td
                          className="px-4 py-3 text-right font-medium"
                          style={{ color: '#101828' }}
                        >
                          {fmtMoney(f.importe)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end">
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
              </div>
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

// ─── Panel cobros Payway ─────────────────────────────────────────────────────

const COBRO_ESTADO_BADGE: Record<string, string> = {
  aprobado: 'bg-teal-50 text-[#175861]',
  rechazado: 'bg-red-50 text-red-700',
  error: 'bg-orange-50 text-orange-700',
  pendiente: 'bg-amber-50 text-amber-700',
};

const COBRO_ESTADO_LABEL: Record<string, string> = {
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  error: 'Error',
  pendiente: 'Pendiente',
};

function PaywayCobrosList({ cobros }: { cobros: CobroPayway[] }) {
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [isPending, startTransition] = useTransition();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const router = useRouter();

  const filtrados = useMemo(() => {
    return cobros.filter((c) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!c.socioNombre.toLowerCase().includes(q)) return false;
      }
      if (filterEstado && c.estado !== filterEstado) return false;
      return true;
    });
  }, [cobros, search, filterEstado]);

  const totalAprobado = cobros
    .filter((c) => c.estado === 'aprobado')
    .reduce((acc, c) => acc + c.monto / 100, 0);
  const countRechazados = cobros.filter(
    (c) => c.estado === 'rechazado' || c.estado === 'error',
  ).length;

  function handleReintentar(cobro: CobroPayway) {
    setRetryingId(cobro.id);
    startTransition(async () => {
      const res = await reintentarCobroPaywayAction(cobro.id);
      setRetryingId(null);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Cobro aprobado y movimientos marcados como pagados.');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Total cobrado</p>
          <p className="mt-1 text-xl font-bold" style={{ color: '#175861' }}>
            {fmtMoney(totalAprobado)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Aprobados</p>
          <p className="mt-1 text-xl font-bold text-[#101828]">
            {cobros.filter((c) => c.estado === 'aprobado').length}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500">Con error / Rechazados</p>
          <p className="mt-1 text-xl font-bold text-red-600">{countRechazados}</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por socio..."
            className="h-10 flex-1 rounded-[10px] border border-gray-200 bg-white px-4 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
          />
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="h-10 rounded-[10px] border border-gray-200 bg-white px-3 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
          >
            <option value="">Todos los estados</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
            <option value="error">Error</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </div>

        {filtrados.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="h-7 w-7 opacity-40" />}
            text={
              search || filterEstado
                ? 'No se encontraron cobros con ese criterio.'
                : 'Todavía no hay cobros de débito automático.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-4 py-3">Socio</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-gray-100 transition hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: '#175861' }}>
                      {c.socioNombre}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(c.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: '#101828' }}>
                      {fmtMoney(c.monto / 100)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${COBRO_ESTADO_BADGE[c.estado] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {COBRO_ESTADO_LABEL[c.estado] ?? c.estado}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-gray-400">
                      {c.errorMensaje ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        {(c.estado === 'rechazado' || c.estado === 'error') && (
                          <button
                            onClick={() => handleReintentar(c)}
                            disabled={isPending && retryingId === c.id}
                            title="Reintentar cobro"
                            className="flex items-center gap-1.5 rounded-[6px] border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${isPending && retryingId === c.id ? 'animate-spin' : ''}`}
                            />
                            Reintentar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
