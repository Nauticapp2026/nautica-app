'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Download, Edit3, FileText, Plus, Send, X } from 'lucide-react';

import {
  createBatchInvoicesAction,
  createInvoiceAction,
  getSocioPendientesAction,
  markInvoicePaidAction,
  type BatchResult,
  type MovimientoPendiente,
} from '@/app/actions/facturacion';

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
};

type Socio = {
  id: string;
  nombre: string;
  email: string;
  numeroDocumento: string;
  pendientes: number;
  pendienteTotal: string;
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
};

const TIPO_FACTURA_OPTS = [
  { value: 'factura_c', label: 'Factura C (Monotributo)' },
  { value: 'factura_b', label: 'Factura B (Consumidor Final)' },
  { value: 'factura_a', label: 'Factura A (Responsable Inscripto)' },
];

const CONDICION_VENTA_OPTS = [
  { value: 'contado', label: 'Contado' },
  { value: 'cuenta_corriente', label: 'Cuenta corriente' },
  { value: 'dias_30', label: '30 días' },
  { value: 'transferencia_bancaria', label: 'Transferencia bancaria' },
  { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { value: 'mercadopago', label: 'Mercado Pago' },
];

const MEDIO_PAGO_OPTS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { value: 'debito_automatico', label: 'Débito automático' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
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

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

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

// ─── Modal: Nueva factura ───────────────────────────────────────────────────

function NuevaFacturaModal({
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
    setForm((f) => ({ ...f, socioId }));
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
        setSuccess(`Factura emitida ${res.comprobanteNro ?? ''}`);
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
              Nueva factura
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Emití una factura tomando los movimientos pendientes del socio
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Cliente / Proveedor*
              </label>
              <select className={inputCls} value={form.socioId} onChange={handleSocioChange}>
                <option value="">Seleccioná un socio...</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                    {s.pendientes > 0
                      ? ` — ${s.pendientes} pendiente${s.pendientes > 1 ? 's' : ''} (${fmtMoney(s.pendienteTotal)})`
                      : ''}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Tipo de comprobante*
              </label>
              <select className={inputCls} value={form.tipoFactura} onChange={set('tipoFactura')}>
                {TIPO_FACTURA_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Descripción*
              </label>
              <input
                className={inputCls}
                placeholder="Detalle de la factura"
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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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
                Total a facturar
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
              {isPending ? 'Emitiendo...' : 'Emitir factura'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Factura en lote ─────────────────────────────────────────────────

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
  const elegibles = useMemo(() => socios.filter((s) => s.pendientes > 0), [socios]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [form, setForm] = useState({
    tipoFactura: 'factura_c',
    condicionVenta: 'contado',
    medioPago: 'efectivo',
    fecha: todayIso(),
    vencimiento: addDays(todayIso(), 30),
    desde: firstOfMonthIso(),
    hasta: lastOfMonthIso(),
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const set =
    <K extends keyof typeof form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const totalEstimado = elegibles
    .filter((s) => selectedIds.has(s.id))
    .reduce((sum, s) => sum + parseFloat(s.pendienteTotal || '0'), 0);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === elegibles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(elegibles.map((s) => s.id)));
    }
  }

  function handleClose() {
    setError(null);
    setResult(null);
    setSelectedIds(new Set());
    onClose();
  }

  function handleSubmit() {
    if (selectedIds.size === 0) {
      setError('Seleccioná al menos un socio con pendientes.');
      return;
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await createBatchInvoicesAction({
        socioIds: Array.from(selectedIds),
        tipoFactura: form.tipoFactura as never,
        condicionVenta: form.condicionVenta as never,
        medioPago: form.medioPago as never,
        fecha: form.fecha,
        vencimiento: form.vencimiento,
        desde: form.desde,
        hasta: form.hasta,
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
              Emití una factura por cada socio con movimientos pendientes
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Tipo de factura
                  </label>
                  <select
                    className={inputCls}
                    value={form.tipoFactura}
                    onChange={set('tipoFactura')}
                  >
                    {TIPO_FACTURA_OPTS.map((o) => (
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
                    Condición de venta
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

              <div className="grid grid-cols-2 gap-3">
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
                    onChange={set('fecha')}
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
                    value={form.vencimiento}
                    onChange={set('vencimiento')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Período desde
                  </label>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.desde}
                    onChange={set('desde')}
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-semibold"
                    style={{ color: '#101828' }}
                  >
                    Período hasta
                  </label>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.hasta}
                    onChange={set('hasta')}
                  />
                </div>
              </div>

              <div className="rounded-[10px] border border-gray-100 bg-white">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#101828' }}>
                      Socios con pendientes ({elegibles.length})
                    </p>
                    <p className="text-xs text-gray-400">
                      Seleccionados: {selectedIds.size} — Total estimado: {fmtMoney(totalEstimado)}
                    </p>
                  </div>
                  {elegibles.length > 0 && (
                    <button
                      onClick={toggleAll}
                      className="text-xs font-medium underline underline-offset-2"
                      style={{ color: '#175861' }}
                    >
                      {selectedIds.size === elegibles.length ? 'Ninguno' : 'Todos'}
                    </button>
                  )}
                </div>
                {elegibles.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">
                    No hay socios con movimientos pendientes.
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    {elegibles.map((s) => (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-4 py-2.5 text-sm last:border-0 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                          checked={selectedIds.has(s.id)}
                          onChange={() => toggle(s.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium" style={{ color: '#101828' }}>
                            {s.nombre}
                          </p>
                          <p className="truncate text-xs text-gray-400">{s.email}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium" style={{ color: '#175861' }}>
                            {fmtMoney(s.pendienteTotal)}
                          </p>
                          <p className="text-xs text-gray-400">
                            {s.pendientes} movimiento{s.pendientes > 1 ? 's' : ''}
                          </p>
                        </div>
                      </label>
                    ))}
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
                <p className="font-semibold">{result.succeeded.length} facturas emitidas</p>
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
                disabled={isPending || selectedIds.size === 0}
                className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: '#175861' }}
              >
                {isPending
                  ? 'Emitiendo...'
                  : `Emitir ${selectedIds.size} factura${selectedIds.size === 1 ? '' : 's'}`}
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

// ─── Componente principal ──────────────────────────────────────────────────

export function FacturacionClient({
  facturas,
  socios,
  kpis,
}: {
  facturas: Factura[];
  socios: Socio[];
  kpis: Kpis;
}) {
  const [search, setSearch] = useState('');
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [loteOpen, setLoteOpen] = useState(false);
  const [pagarFactura, setPagarFactura] = useState<Factura | null>(null);

  const filtradas = useMemo(() => {
    if (!search.trim()) return facturas;
    const q = search.toLowerCase();
    return facturas.filter((f) => {
      const tipo = TIPO_FACTURA_LABEL[f.tipoFactura ?? ''] ?? f.tipoFactura ?? '';
      return (
        (f.codigo ?? '').toLowerCase().includes(q) ||
        tipo.toLowerCase().includes(q) ||
        f.socioNombre.toLowerCase().includes(q) ||
        (f.descripcion ?? '').toLowerCase().includes(q)
      );
    });
  }, [facturas, search]);

  return (
    <div className="space-y-6 p-8">
      <NuevaFacturaModal open={nuevaOpen} onClose={() => setNuevaOpen(false)} socios={socios} />
      <LoteModal open={loteOpen} onClose={() => setLoteOpen(false)} socios={socios} />
      <MarcarPagadaModal
        open={!!pagarFactura}
        onClose={() => setPagarFactura(null)}
        factura={pagarFactura}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Facturación</h1>
          <p className="page-subtitle mt-1">Gestión de facturas y cobros</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setLoteOpen(true)}
            className="flex items-center gap-2 rounded-[10px] border border-[#d1d5dc] bg-white px-4 py-2.5 text-sm font-semibold text-[#364153] transition hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Factura en lote
          </button>
          <button
            onClick={() => setNuevaOpen(true)}
            className="flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: '#175861' }}
          >
            <Plus className="h-4 w-4" />
            Nueva factura
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard value={String(kpis.pendientes)} label="Pendientes de cobro" />
        <KpiCard value={String(kpis.pagadasMes)} label="Pagadas este mes" />
        <KpiCard value={String(kpis.vencidas)} label="Vencidas" />
        <KpiCard value={fmtMoney(kpis.totalFacturado)} label="Total facturado" />
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por factura o por tipo..."
            className="h-10 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
          />
        </div>

        {filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <FileText className="h-7 w-7 opacity-40" />
            </div>
            <p className="text-sm">
              {search
                ? 'No se encontraron facturas con ese criterio.'
                : 'Todavía no hay facturas emitidas.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
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
              {filtradas.map((f) => (
                <tr key={f.id} className="border-t border-gray-100 transition hover:bg-gray-50/50">
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
                  <td className="px-4 py-3 text-right font-medium" style={{ color: '#101828' }}>
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
