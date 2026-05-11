'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  Anchor,
  CreditCard,
  DollarSign,
  Users,
  Clock,
  FileText,
  Ship,
  TrendingUp,
  AlertTriangle,
  Trash2,
  X,
} from 'lucide-react';
import {
  addMovimientoAction,
  eliminarPagoAction,
  informarPagoAction,
  marcarPagadasAction,
} from '@/app/actions/movimientos';
import { deleteSocioAction, updateSocioAction } from '@/app/actions/socios';
import { formatArgentinaDate, formatArgentinaDateTime } from '@/lib/dates';
import { EmptyState } from '@/components/shared/empty-state';

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
  razonSocial: string | null;
  condicionIva: string | null;
  estadoSocio: string | null;
  deuda: string | null;
  memberSince: string;
};

type Embarcacion = {
  id: string;
  nombre: string;
  matricula: string | null;
  modelo: string | null;
  seguro: string | null;
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
};

type Servicio = {
  id: string;
  nombre: string;
  precio: string | null;
};

type Invitado = {
  id: string;
  nombre: string;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
  motivo: string | null;
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

const TIPO_DOC_OPTS = [
  { value: 'dni', label: 'DNI' },
  { value: 'cuit', label: 'CUIT' },
  { value: 'cuil', label: 'CUIL' },
  { value: 'pasaporte', label: 'Pasaporte' },
  { value: 'cdi', label: 'CDI' },
];

const FORMAS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { value: 'debito_automatico', label: 'Débito automático' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
];

const TABS = [
  { id: 'generales', label: 'Generales', icon: User },
  { id: 'embarcacion', label: 'Embarcación', icon: Anchor },
  { id: 'cuenta-corriente', label: 'Cuenta Corriente', icon: CreditCard },
  { id: 'facturacion', label: 'Facturación', icon: DollarSign },
  { id: 'navegantes', label: 'Navegantes', icon: Users },
  { id: 'salidas', label: 'Salidas', icon: Clock },
  { id: 'documentacion', label: 'Documentación', icon: FileText },
] as const;

type TabId = (typeof TABS)[number]['id'];

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number) {
  return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

const fmtDate = formatArgentinaDate;

const ESTADO_BADGE: Record<string, string> = {
  pagado: 'bg-gray-100 text-gray-600',
  facturado: 'bg-amber-100 text-amber-700',
  no_pagado: 'bg-red-100 text-red-700',
};

const ESTADO_LABEL: Record<string, string> = {
  pagado: 'Pagado',
  facturado: 'Facturado',
  no_pagado: 'Pendiente',
};

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Forma de Pago Modal ──────────────────────────────────────────────────────

const EMPTY_PAGO = {
  formaDePago: '',
  bancoTransferencia: '',
  clienteTransferencia: '',
  cbuAliasTransferencia: '',
  montoTransferencia: '',
  fechaTransferencia: '',
  numeroOperacionTransferencia: '',
  observacionesTransferencia: '',
  numeroCheque: '',
  bancoEmisorCheque: '',
  sucursalCheque: '',
  cuitCuilCheque: '',
  titularCheque: '',
  importeCheque: '',
  tipoCheque: '',
  monedaCheque: '',
  cuentaCheque: '',
  observacionesCheque: '',
};

function FormaPagoModal({
  open,
  onClose,
  selectedIds,
  socioId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  socioId: string;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_PAGO);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set =
    (k: keyof typeof EMPTY_PAGO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleClose() {
    setForm(EMPTY_PAGO);
    setError(null);
    onClose();
  }

  function handleSubmit() {
    if (!form.formaDePago) {
      setError('Seleccioná una forma de pago.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await marcarPagadasAction({ ids: selectedIds, socioId, ...form });
      if (res.error) {
        setError(res.error);
      } else {
        handleClose();
        onSuccess();
        router.refresh();
      }
    });
  }

  if (!open) return null;

  const esTransferencia = form.formaDePago === 'transferencia';
  const esCheque = form.formaDePago === 'cheque';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Forma de pago
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Completá los datos de la forma de pago
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

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <Field label="Forma de pago">
            <select className={inputCls} value={form.formaDePago} onChange={set('formaDePago')}>
              <option value="">Seleccione una opción...</option>
              {FORMAS_PAGO.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          {/* Transferencia fields */}
          {esTransferencia && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Banco origen">
                  <input
                    className={inputCls}
                    placeholder="Banco"
                    value={form.bancoTransferencia}
                    onChange={set('bancoTransferencia')}
                  />
                </Field>
                <Field label="Nombre del titular">
                  <input
                    className={inputCls}
                    placeholder="Nombre"
                    value={form.clienteTransferencia}
                    onChange={set('clienteTransferencia')}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="CBU / Alias">
                  <input
                    className={inputCls}
                    placeholder="CBU / Alias"
                    value={form.cbuAliasTransferencia}
                    onChange={set('cbuAliasTransferencia')}
                  />
                </Field>
                <Field label="Monto">
                  <input
                    className={inputCls}
                    placeholder="Monto"
                    value={form.montoTransferencia}
                    onChange={set('montoTransferencia')}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Fecha de transferencia">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.fechaTransferencia}
                    onChange={set('fechaTransferencia')}
                  />
                </Field>
                <Field label="Nro. de operación / ref.">
                  <input
                    className={inputCls}
                    placeholder="Número"
                    value={form.numeroOperacionTransferencia}
                    onChange={set('numeroOperacionTransferencia')}
                  />
                </Field>
              </div>
              <Field label="Observaciones">
                <input
                  className={inputCls}
                  placeholder="Observaciones"
                  value={form.observacionesTransferencia}
                  onChange={set('observacionesTransferencia')}
                />
              </Field>
            </>
          )}

          {/* Cheque fields */}
          {esCheque && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Número de cheque">
                  <input
                    className={inputCls}
                    placeholder="Número"
                    value={form.numeroCheque}
                    onChange={set('numeroCheque')}
                  />
                </Field>
                <Field label="Banco emisor">
                  <input
                    className={inputCls}
                    placeholder="Banco"
                    value={form.bancoEmisorCheque}
                    onChange={set('bancoEmisorCheque')}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Sucursal">
                  <input
                    className={inputCls}
                    placeholder="Sucursal"
                    value={form.sucursalCheque}
                    onChange={set('sucursalCheque')}
                  />
                </Field>
                <Field label="CUIT / CUIL del emisor">
                  <input
                    className={inputCls}
                    placeholder="CUIT/CUIL"
                    value={form.cuitCuilCheque}
                    onChange={set('cuitCuilCheque')}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nombre del titular del cheque">
                  <input
                    className={inputCls}
                    placeholder="Nombre"
                    value={form.titularCheque}
                    onChange={set('titularCheque')}
                  />
                </Field>
                <Field label="Importe del cheque">
                  <input
                    className={inputCls}
                    placeholder="Importe"
                    value={form.importeCheque}
                    onChange={set('importeCheque')}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Tipo de cheque">
                  <select className={inputCls} value={form.tipoCheque} onChange={set('tipoCheque')}>
                    <option value="">Seleccione una opción...</option>
                    <option value="al_dia">Al día</option>
                    <option value="diferido">Diferido</option>
                  </select>
                </Field>
                <Field label="Moneda">
                  <select
                    className={inputCls}
                    value={form.monedaCheque}
                    onChange={set('monedaCheque')}
                  >
                    <option value="">Seleccione una opción...</option>
                    <option value="pesos">Pesos</option>
                    <option value="dolares">Dólares</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Cuenta donde se deposita">
                  <input
                    className={inputCls}
                    placeholder="Cuenta"
                    value={form.cuentaCheque}
                    onChange={set('cuentaCheque')}
                  />
                </Field>
                <Field label="Observaciones">
                  <input
                    className={inputCls}
                    placeholder="Observaciones"
                    value={form.observacionesCheque}
                    onChange={set('observacionesCheque')}
                  />
                </Field>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
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
              disabled={isPending || !form.formaDePago}
              className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: '#175861' }}
            >
              {isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [fecha, setFecha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isValid = Boolean(servicioId && monto);

  function handleServicioChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setServicioId(id);
    const s = servicios.find((s) => s.id === id);
    if (s?.precio) setMonto(s.precio);
  }

  function handleClose() {
    setServicioId('');
    setConcepto('');
    setMonto('');
    setFecha('');
    setError(null);
    onClose();
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await addMovimientoAction({ socioId, servicioId, concepto, monto, fecha });
      if (res.error) {
        setError(res.error);
      } else {
        handleClose();
        router.refresh();
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Agregar servicio
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Registre el servicio consumido por {socioNombre}
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

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
              Servicio
            </label>
            <select className={inputCls} value={servicioId} onChange={handleServicioChange}>
              <option value="">Seleccione un servicio</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                  {s.precio ? ` — ${fmt(parseFloat(s.precio))}` : ''}
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
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Monto
              </label>
              <input
                className={inputCls}
                placeholder="$0,00"
                value={monto ? fmt(parseFloat(monto)) : ''}
                onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ''))}
              />
            </div>
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
              {isPending ? 'Guardando...' : 'Agregar servicio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Informar Pago Modal ──────────────────────────────────────────────────────

function InformarPagoModal({
  open,
  onClose,
  socioId,
  socioNombre,
}: {
  open: boolean;
  onClose: () => void;
  socioId: string;
  socioNombre: string;
}) {
  const router = useRouter();
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isValid = Boolean(concepto.trim() && monto && parseFloat(monto) > 0);

  function handleClose() {
    setConcepto('');
    setMonto('');
    setFecha('');
    setError(null);
    onClose();
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await informarPagoAction({ socioId, concepto, monto, fecha });
      if (res.error) {
        setError(res.error);
      } else {
        handleClose();
        router.refresh();
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Informar pago
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Registre un pago a cuenta de {socioNombre}
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

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
              Concepto / forma de pago
            </label>
            <input
              className={inputCls}
              placeholder="Ej. Pago en efectivo · Transferencia Galicia"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
                Monto
              </label>
              <input
                className={inputCls}
                placeholder="$0,00"
                value={monto ? fmt(parseFloat(monto)) : ''}
                onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ''))}
              />
            </div>
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
              {isPending ? 'Guardando...' : 'Guardar pago'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Eliminar Pago Button ─────────────────────────────────────────────────────

function EliminarPagoButton({ movimientoId, socioId }: { movimientoId: string; socioId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm('¿Anular este pago a cuenta? El saldo del socio se va a recalcular.')) {
      return;
    }
    startTransition(async () => {
      const res = await eliminarPagoAction(movimientoId);
      if (res.error) {
        window.alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  // socioId solo se usa para que el path quede claro al lector; revalidatePath ya lo maneja.
  void socioId;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title="Anular pago"
      className="rounded-[8px] p-1 text-red-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
    >
      <X className="h-4 w-4" />
    </button>
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

export function SocioDetail({
  socio,
  embarcaciones,
  movimientos,
  servicios,
  invitados,
  documentos = [],
  salidas = [],
}: {
  socio: SocioData;
  embarcaciones: Embarcacion[];
  movimientos: Movimiento[];
  servicios: Servicio[];
  invitados: Invitado[];
  documentos?: DocumentoItem[];
  salidas?: SalidaItem[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>('generales');
  const [modalServicioOpen, setModalServicioOpen] = useState(false);
  const [modalPagoOpen, setModalPagoOpen] = useState(false);
  const [modalInformarPagoOpen, setModalInformarPagoOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    razonSocial: socio.razonSocial ?? '',
    condicionIva: socio.condicionIva ?? '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminarError, setEliminarError] = useState<string | null>(null);
  const [isEliminando, startEliminando] = useTransition();
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
      razonSocial: socio.razonSocial ?? '',
      condicionIva: socio.condicionIva ?? '',
    });
    setEditError(null);
    setEditando(false);
  }

  function handleGuardar() {
    setEditError(null);
    startSaving(async () => {
      const res = await updateSocioAction({ socioId: socio.id, ...editForm });
      if (res.error) {
        setEditError(res.error);
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

  const nombre = [socio.nombre, socio.apellido].filter(Boolean).join(' ') || socio.email;
  const inicial = (socio.nombre?.[0] ?? socio.email[0]).toUpperCase();

  const memberDate = formatArgentinaDate(socio.memberSince);

  const totalIngresos = movimientos.reduce((sum, m) => sum + parseFloat(m.debe ?? '0'), 0);
  const totalCargosPendientes = movimientos
    .filter((m) => m.estado === 'no_pagado')
    .reduce((sum, m) => sum + parseFloat(m.debe ?? '0'), 0);
  // Pagos a cuenta: movimientos con haber > 0 que no estan imputados a una
  // factura. Hoy todavia no linkeamos pagos a facturas, asi que tomamos
  // todos los haber como "sin imputar". Cuando se implemente la imputacion,
  // filtrar por una columna `factura_id IS NULL`.
  const totalPagosACuenta = movimientos.reduce((sum, m) => sum + parseFloat(m.haber ?? '0'), 0);
  const totalPendiente = Math.max(0, totalCargosPendientes - totalPagosACuenta);

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-4 md:p-8">
      <AgregarServicioModal
        open={modalServicioOpen}
        onClose={() => setModalServicioOpen(false)}
        socioId={socio.id}
        socioNombre={nombre}
        servicios={servicios}
      />
      <FormaPagoModal
        open={modalPagoOpen}
        onClose={() => setModalPagoOpen(false)}
        selectedIds={Array.from(selectedIds)}
        socioId={socio.id}
        onSuccess={() => setSelectedIds(new Set())}
      />
      <InformarPagoModal
        open={modalInformarPagoOpen}
        onClose={() => setModalInformarPagoOpen(false)}
        socioId={socio.id}
        socioNombre={nombre}
      />

      {/* Back */}
      <Link
        href="/usuarios"
        className="mb-6 inline-flex items-center gap-1.5 text-sm transition hover:opacity-70"
        style={{ color: '#669E9D' }}
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Usuarios
      </Link>

      {/* Avatar + name */}
      <div className="mb-6 flex items-center gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
          style={{ background: '#E87040' }}
        >
          {inicial}
        </div>
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: '#101828' }}>
            {nombre}
          </h1>
          <p className="text-sm text-gray-400">Usuario desde {memberDate}</p>
        </div>
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
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">Dirección</label>
              <input
                className={inputCls}
                value={editForm.direccion}
                onChange={setField('direccion')}
                readOnly={!editando}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Razón social
                </label>
                <input
                  className={inputCls}
                  value={editForm.razonSocial}
                  onChange={setField('razonSocial')}
                  readOnly={!editando}
                />
              </div>
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

      {/* Embarcación */}
      {activeTab === 'embarcacion' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          {embarcaciones.length === 0 ? (
            <EmptyState
              icon={<Ship className="h-7 w-7 opacity-40" />}
              text="Este socio no tiene embarcaciones registradas."
            />
          ) : (
            <div className="space-y-4">
              {embarcaciones.map((e) => (
                <div key={e.id} className="rounded-[10px] border border-gray-100 bg-gray-50 p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">
                        Nombre
                      </label>
                      <p className="text-sm font-medium" style={{ color: '#101828' }}>
                        {e.nombre}
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">
                        Matrícula
                      </label>
                      <p className="text-sm" style={{ color: '#101828' }}>
                        {e.matricula ?? '—'}
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">
                        Modelo
                      </label>
                      <p className="text-sm" style={{ color: '#101828' }}>
                        {e.modelo ?? '—'}
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">
                        Seguro
                      </label>
                      <p className="text-sm" style={{ color: '#101828' }}>
                        {e.seguro ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cuenta Corriente */}
      {activeTab === 'cuenta-corriente' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          {/* Header */}
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Movimientos de cuenta
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setModalInformarPagoOpen(true)}
                className="shrink-0 justify-center rounded-[10px] border border-[#d1d5dc] px-4 py-2 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
              >
                Informar pago
              </button>
              <button
                onClick={() => setModalServicioOpen(true)}
                className="shrink-0 justify-center rounded-[10px] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                style={{ background: '#175861' }}
              >
                Agregar servicio
              </button>
            </div>
          </div>

          {/* Metric cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: '#E6F4F1' }}
              >
                <TrendingUp className="h-5 w-5" style={{ color: '#175861' }} />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                  Ingresos
                </p>
                <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
                  {fmt(totalIngresos)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: '#FEF0E6' }}
              >
                <AlertTriangle className="h-5 w-5" style={{ color: '#E87040' }} />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                  Falta abonar
                </p>
                <p className="text-[18px] font-bold" style={{ color: '#101828' }}>
                  {fmt(totalPendiente)}
                </p>
              </div>
            </div>
          </div>

          {/* Table */}
          {movimientos.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="h-7 w-7 opacity-40" />}
              text="No hay movimientos en la cuenta corriente."
            />
          ) : (
            <>
              {/* Marcar como pagadas */}
              {selectedIds.size > 0 && (
                <div className="mb-3 flex justify-end">
                  <button
                    onClick={() => setModalPagoOpen(true)}
                    className="text-sm font-medium underline underline-offset-2 transition hover:opacity-70"
                    style={{ color: '#175861' }}
                  >
                    Marcar como pagadas
                  </button>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                      <th className="w-10 px-4 py-3"></th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Servicio</th>
                      <th className="px-4 py-3">Concepto</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m) => {
                      const haber = parseFloat(m.haber ?? '0');
                      const debe = parseFloat(m.debe ?? '0');
                      const esPago = haber > 0 && debe === 0;
                      return (
                        <tr
                          key={m.id}
                          className={`border-t border-gray-100 transition hover:bg-gray-50/50 ${
                            selectedIds.has(m.id) ? 'bg-teal-50/40' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            {esPago ? null : (
                              <input
                                type="checkbox"
                                className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                                checked={selectedIds.has(m.id)}
                                onChange={() => toggleId(m.id)}
                              />
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{fmtDate(m.fecha)}</td>
                          <td className="px-4 py-3 font-medium" style={{ color: '#175861' }}>
                            {esPago ? 'Pago a cuenta' : (m.servicioNombre ?? '—')}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{m.concepto ?? '—'}</td>
                          <td
                            className="px-4 py-3 text-right font-medium"
                            style={{ color: esPago ? '#1B9A5A' : '#101828' }}
                          >
                            {esPago ? `−${fmt(haber)}` : fmt(debe)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span
                                className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                                  ESTADO_BADGE[m.estado ?? ''] ?? 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {ESTADO_LABEL[m.estado ?? ''] ?? m.estado ?? '—'}
                              </span>
                              {esPago && (
                                <EliminarPagoButton movimientoId={m.id} socioId={socio.id} />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Facturación */}
      {activeTab === 'facturacion' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          <EmptyState
            icon={<DollarSign className="h-7 w-7 opacity-40" />}
            text="No hay facturas registradas."
          />
        </div>
      )}

      {/* Navegantes */}
      {activeTab === 'navegantes' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          {invitados.length === 0 ? (
            <EmptyState
              icon={<Users className="h-7 w-7 opacity-40" />}
              text="No hay navegantes autorizados."
            />
          ) : (
            <div className="space-y-3">
              {invitados.map((i) => {
                const nombreCompleto = [i.nombre, i.apellido].filter(Boolean).join(' ') || '—';
                const inicial = (i.nombre?.[0] ?? '?').toUpperCase();
                const activo = i.estado === 'activo';
                return (
                  <div
                    key={i.id}
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
                        {i.email && <span>{i.email}</span>}
                        {i.telefono && <span>{i.telefono}</span>}
                        {i.motivo && <span>{i.motivo}</span>}
                      </div>
                      {i.validoHasta && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          Válido hasta {fmtDate(i.validoHasta)}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                        activo ? 'bg-teal-50 text-[#175861]' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {activo ? 'Activo' : 'Inactivo'}
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
                    <p className="truncate text-sm font-semibold text-[#101828]">
                      {s.embarcacion ?? 'Sin embarcación'}
                    </p>
                    <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-gray-500 sm:grid-cols-3">
                      <span>
                        <strong className="text-gray-400">Salida: </strong>
                        {fmtFechaHoraSalida(s.desde)}
                      </span>
                      <span>
                        <strong className="text-gray-400">Regreso: </strong>
                        {fmtFechaHoraSalida(s.hasta)}
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
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
