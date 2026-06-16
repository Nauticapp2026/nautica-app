'use client';

import { useMemo, useState, useTransition } from 'react';
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
  Trash2,
  X,
} from 'lucide-react';

import {
  createBatchInvoicesAction,
  createInvoiceAction,
  emitirNotaCreditoAction,
  getSocioPendientesAction,
  markInvoicePaidAction,
  ventanillaEmitirFacturaAction,
  type BatchResult,
  type EmitirNcMotivo,
  type MovimientoPendiente,
  type VentanillaItem,
} from '@/app/actions/facturacion';
import { reintentarCobroPaywayAction } from '@/app/actions/payway';
import { toast } from 'sonner';
import { formatArgentinaDate } from '@/lib/dates';
import { EmptyState } from '@/components/shared/empty-state';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Factura = {
  id: string;
  codigo: string | null;
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

type Socio = {
  id: string;
  nombre: string;
  email: string;
  numeroDocumento: string;
  condicionIva: string | null;
  pendientes: number;
  pendienteTotal: string;
  movimientos: LoteMovimiento[];
};

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function lastOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
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

  function handleSocioChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const socioId = e.target.value;
    const socio = socios.find((s) => s.id === socioId);
    const tipoFactura = derivarTipoFactura(guarderiaCondicionIva, socio?.condicionIva ?? null);
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
        setSuccess(`Comprobante emitido ${res.comprobanteNro ?? ''}`);
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
                Cliente*
              </label>
              <select className={inputCls} value={form.socioId} onChange={handleSocioChange}>
                <option value="">Seleccioná un socio...</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Número documento
              </label>
              <input
                className={`${inputCls} cursor-not-allowed bg-gray-50 text-gray-500`}
                value={socioSeleccionado?.numeroDocumento ?? ''}
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
                    Conceptos a facturar
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

                      return (
                        <div key={s.id} className="border-b border-gray-50 last:border-0">
                          {/* Fila del socio */}
                          <div className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50">
                            <input
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
  const [result, setResult] = useState<{ comprobanteNro?: string; pdfUrl?: string } | null>(null);
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
        setResult({ comprobanteNro: res.comprobanteNro, pdfUrl: res.pdfUrl });
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

// ─── Modal: ventanilla (consumo + factura en un paso) ─────────────────────

type LineaItem = { descripcion: string; cantidad: string; importe: string };

function VentanillaModal({
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
  const [socioId, setSocioId] = useState('');
  const [tipoFactura, setTipoFactura] = useState(() =>
    derivarTipoFactura(guarderiaCondicionIva, null),
  );
  const [condicionVenta, setCondicionVenta] = useState('contado');
  const [medioPago, setMedioPago] = useState('efectivo');
  const [fecha, setFecha] = useState(todayIso);
  const [vencimiento, setVencimiento] = useState(() => addDays(todayIso(), 30));
  const [lineas, setLineas] = useState<LineaItem[]>([
    { descripcion: '', cantidad: '1', importe: '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ comprobanteNro?: string; pdfUrl?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const total = lineas.reduce((s, l) => {
    const cant = parseFloat(l.cantidad) || 0;
    const imp = parseFloat(l.importe.replace(',', '.')) || 0;
    return s + cant * imp;
  }, 0);

  const isValid =
    Boolean(socioId) &&
    lineas.every((l) => l.descripcion.trim() && parseFloat(l.importe.replace(',', '.')) > 0);

  function addLinea() {
    setLineas((prev) => [...prev, { descripcion: '', cantidad: '1', importe: '' }]);
  }

  function removeLinea(i: number) {
    setLineas((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateLinea(i: number, field: keyof LineaItem, value: string) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }

  function handleClose() {
    setSocioId('');
    setLineas([{ descripcion: '', cantidad: '1', importe: '' }]);
    setError(null);
    setResult(null);
    onClose();
  }

  function handleSubmit() {
    setError(null);
    const items: VentanillaItem[] = lineas.map((l) => ({
      descripcion: l.descripcion.trim(),
      cantidad: parseFloat(l.cantidad) || 1,
      importeUnitario: parseFloat(l.importe.replace(',', '.')) || 0,
    }));
    startTransition(async () => {
      const res = await ventanillaEmitirFacturaAction({
        socioId,
        tipoFactura: tipoFactura as never,
        condicionVenta: condicionVenta as never,
        medioPago: medioPago as never,
        fecha,
        vencimiento,
        items,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult({ comprobanteNro: res.comprobanteNro, pdfUrl: res.pdfUrl });
        router.refresh();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Ventanilla — todo en un paso
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Cargá el consumo y emití la factura AFIP al instante
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
                <p className="font-semibold text-teal-900">Comprobante emitido</p>
                {result.comprobanteNro && (
                  <p className="text-sm text-teal-700">Nro: {result.comprobanteNro}</p>
                )}
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
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {/* Socio + parámetros */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Socio
                  </label>
                  <select
                    className={inputCls}
                    value={socioId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSocioId(id);
                      const socio = socios.find((s) => s.id === id);
                      setTipoFactura(
                        derivarTipoFactura(guarderiaCondicionIva, socio?.condicionIva ?? null),
                      );
                    }}
                  >
                    <option value="">Seleccioná un socio...</option>
                    {socios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Tipo de comprobante
                  </label>
                  <input
                    className={`${inputCls} cursor-not-allowed bg-gray-50 text-gray-700`}
                    value={
                      TIPO_FACTURA_OPTS.find((o) => o.value === tipoFactura)?.label ?? tipoFactura
                    }
                    readOnly
                  />
                </div>
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
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Vencimiento
                  </label>
                  <input
                    type="date"
                    className={inputCls}
                    value={vencimiento}
                    onChange={(e) => setVencimiento(e.target.value)}
                  />
                </div>
              </div>

              {/* Ítems */}
              <div>
                <label className="mb-2 block text-xs font-semibold" style={{ color: '#101828' }}>
                  Ítems
                </label>
                <div className="space-y-2">
                  {lineas.map((l, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        className={`${inputCls} flex-1`}
                        placeholder="Descripción"
                        value={l.descripcion}
                        onChange={(e) => updateLinea(i, 'descripcion', e.target.value)}
                      />
                      <input
                        className="h-11 w-16 shrink-0 rounded-[10px] border border-gray-200 bg-white px-3 text-center text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
                        placeholder="Cant"
                        inputMode="numeric"
                        value={l.cantidad}
                        onChange={(e) => updateLinea(i, 'cantidad', e.target.value)}
                      />
                      <input
                        className="h-11 w-28 shrink-0 rounded-[10px] border border-gray-200 bg-white px-3 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
                        placeholder="Precio"
                        inputMode="decimal"
                        value={l.importe}
                        onChange={(e) => updateLinea(i, 'importe', e.target.value)}
                      />
                      {lineas.length > 1 && (
                        <button
                          onClick={() => removeLinea(i)}
                          className="shrink-0 rounded-[8px] p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addLinea}
                  className="mt-2 flex items-center gap-1 text-sm font-medium transition hover:opacity-70"
                  style={{ color: '#175861' }}
                >
                  <Plus className="h-4 w-4" />
                  Agregar ítem
                </button>
              </div>

              {total > 0 && (
                <div className="flex justify-end">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Total a facturar</p>
                    <p className="text-lg font-bold" style={{ color: '#101828' }}>
                      {fmtMoney(total)}
                    </p>
                  </div>
                </div>
              )}

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
                  disabled={isPending || !isValid}
                  className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: '#175861' }}
                >
                  {isPending ? 'Emitiendo...' : 'Emitir comprobante'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────

export function FacturacionClient({
  facturas,
  socios,
  kpis,
  posConfigurado,
  certificadoOk,
  cobrosPayway,
  guarderiaCondicionIva,
}: {
  facturas: Factura[];
  socios: Socio[];
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
  const [ventanillaOpen, setVentanillaOpen] = useState(false);
  const [pagarFactura, setPagarFactura] = useState<Factura | null>(null);
  const [ncFactura, setNcFactura] = useState<Factura | null>(null);

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
      <MarcarPagadaModal
        open={!!pagarFactura}
        onClose={() => setPagarFactura(null)}
        factura={pagarFactura}
      />
      <NotaCreditoModal open={!!ncFactura} onClose={() => setNcFactura(null)} factura={ncFactura} />
      <VentanillaModal
        open={ventanillaOpen}
        onClose={() => setVentanillaOpen(false)}
        socios={socios}
        guarderiaCondicionIva={guarderiaCondicionIva}
      />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Comprobantes</h1>
          <p className="page-subtitle mt-1">Gestión de comprobantes y cobros</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {puedeFacturar && (
            <button
              onClick={() => setVentanillaOpen(true)}
              className="flex items-center justify-center gap-2 rounded-[10px] border border-[#d1d5dc] bg-white px-4 py-2.5 text-sm font-semibold text-[#364153] transition hover:bg-gray-50"
            >
              <Send className="h-4 w-4" />
              Ventanilla
            </button>
          )}
          <button
            onClick={() => setLoteOpen(true)}
            disabled={!puedeFacturar}
            title={
              !puedeFacturar
                ? 'Configurá los datos de facturación y confirmá el certificado AFIP para poder facturar.'
                : undefined
            }
            className="flex items-center justify-center gap-2 rounded-[10px] border border-[#d1d5dc] bg-white px-4 py-2.5 text-sm font-semibold text-[#364153] transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
          >
            <Plus className="h-4 w-4" />
            Factura en lote
          </button>
          <button
            onClick={() => setNuevaOpen(true)}
            disabled={!puedeFacturar}
            title={
              !puedeFacturar
                ? 'Configurá los datos de facturación y confirmá el certificado AFIP para poder facturar.'
                : undefined
            }
            className="flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40"
            style={{ background: '#175861' }}
          >
            <Plus className="h-4 w-4" />
            Nuevo comprobante
          </button>
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
              El certificado de enlace con AFIP todavía no está confirmado. Andá a{' '}
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
          Comprobantes AFIP
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
                    <option value="afip">Facturas AFIP</option>
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
                    : 'Todavía no hay comprobantes AFIP emitidos.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
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
                    {filtradosAfip.map((f) => (
                      <tr
                        key={f.id}
                        className="border-t border-gray-100 transition hover:bg-gray-50/50"
                      >
                        <td className="px-4 py-3 font-medium" style={{ color: '#101828' }}>
                          {f.codigo ?? '—'}
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
                              ESTADO_BADGE[f.estado ?? 'pendiente'] ?? 'bg-gray-100 text-gray-600'
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
                    ))}
                  </tbody>
                </table>
              </div>
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
                  {filtradosRecibos.map((f) => (
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
                      <td className="px-4 py-3 text-right font-medium" style={{ color: '#101828' }}>
                        {fmtMoney(f.importe)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <a
                            href={`/facturacion/recibo/${f.id}`}
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
