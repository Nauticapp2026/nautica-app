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
  X,
} from 'lucide-react';
import { addMovimientoAction, marcarPagadasAction } from '@/app/actions/movimientos';

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

// ─── Constants ───────────────────────────────────────────────────────────────

const CONDICION_IVA_OPTS = [
  { value: 'consumidor_final', label: 'Consumidor Final' },
  { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { value: 'monotributo', label: 'Monotributista' },
  { value: 'exento', label: 'Exento' },
  { value: 'cliente_exterior', label: 'Cliente Exterior' },
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

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

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

// ─── Empty tab ────────────────────────────────────────────────────────────────

function EmptyTab({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
        {icon}
      </div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

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
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
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

          <div className="grid grid-cols-2 gap-3">
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

// ─── Main component ───────────────────────────────────────────────────────────

export function SocioDetail({
  socio,
  embarcaciones,
  movimientos,
  servicios,
}: {
  socio: SocioData;
  embarcaciones: Embarcacion[];
  movimientos: Movimiento[];
  servicios: Servicio[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>('generales');
  const [modalServicioOpen, setModalServicioOpen] = useState(false);
  const [modalPagoOpen, setModalPagoOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const nombre = [socio.nombre, socio.apellido].filter(Boolean).join(' ') || socio.email;
  const inicial = (socio.nombre?.[0] ?? socio.email[0]).toUpperCase();

  const memberDate = new Date(socio.memberSince).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const totalIngresos = movimientos.reduce((sum, m) => sum + parseFloat(m.debe ?? '0'), 0);
  const totalPendiente = movimientos
    .filter((m) => m.estado === 'no_pagado')
    .reduce((sum, m) => sum + parseFloat(m.debe ?? '0'), 0);

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-8">
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
          <h1 className="text-xl font-bold" style={{ color: '#101828' }}>
            {nombre}
          </h1>
          <p className="text-sm text-gray-400">Usuario desde {memberDate}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-0 border-b border-gray-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 pb-3 text-sm font-medium transition ${
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

      {/* Generales */}
      {activeTab === 'generales' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="mb-4 text-sm font-bold" style={{ color: '#101828' }}>
            Datos Personales
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Nombre</label>
                <input className={inputCls} defaultValue={socio.nombre ?? ''} readOnly />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Apellido</label>
                <input className={inputCls} defaultValue={socio.apellido ?? ''} readOnly />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Email</label>
                <input className={inputCls} defaultValue={socio.email} readOnly />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">Teléfono</label>
                <input className={inputCls} defaultValue={socio.telefono ?? ''} readOnly />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Tipo Documento
                </label>
                <select className={inputCls} defaultValue={socio.tipoDocumento ?? ''} disabled>
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
                <input className={inputCls} defaultValue={socio.numeroDocumento ?? ''} readOnly />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">Dirección</label>
              <input className={inputCls} defaultValue={socio.direccion ?? ''} readOnly />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Razón social
                </label>
                <input className={inputCls} defaultValue={socio.razonSocial ?? ''} readOnly />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Condición frente IVA
                </label>
                <select className={inputCls} defaultValue={socio.condicionIva ?? ''} disabled>
                  <option value="">—</option>
                  {CONDICION_IVA_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embarcación */}
      {activeTab === 'embarcacion' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          {embarcaciones.length === 0 ? (
            <EmptyTab
              icon={<Ship className="h-7 w-7 opacity-40" />}
              text="Este socio no tiene embarcaciones registradas."
            />
          ) : (
            <div className="space-y-4">
              {embarcaciones.map((e) => (
                <div key={e.id} className="rounded-[10px] border border-gray-100 bg-gray-50 p-4">
                  <div className="grid grid-cols-2 gap-4">
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
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          {/* Header */}
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm font-bold" style={{ color: '#101828' }}>
              Movimientos de cuenta
            </p>
            <button
              onClick={() => setModalServicioOpen(true)}
              className="rounded-[10px] border border-[#d1d5dc] px-4 py-2 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
            >
              Agregar servicio
            </button>
          </div>

          {/* Metric cards */}
          <div className="mb-6 flex gap-4">
            <div className="flex flex-1 items-center gap-3 rounded-[10px] border border-gray-100 bg-gray-50 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: '#101828' }}>
                  {fmt(totalIngresos)}
                </p>
                <p className="text-xs text-gray-400">Ingresos</p>
              </div>
            </div>
            <div className="flex flex-1 items-center gap-3 rounded-[10px] border border-gray-100 bg-gray-50 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: '#101828' }}>
                  {fmt(totalPendiente)}
                </p>
                <p className="text-xs text-gray-400">Falta abonar</p>
              </div>
            </div>
          </div>

          {/* Table */}
          {movimientos.length === 0 ? (
            <EmptyTab
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

              <table className="w-full text-sm">
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
                  {movimientos.map((m) => (
                    <tr
                      key={m.id}
                      className={`border-t border-gray-100 transition hover:bg-gray-50/50 ${
                        selectedIds.has(m.id) ? 'bg-teal-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                          checked={selectedIds.has(m.id)}
                          onChange={() => toggleId(m.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(m.fecha)}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: '#175861' }}>
                        {m.servicioNombre ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{m.concepto ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-medium" style={{ color: '#101828' }}>
                        {fmt(parseFloat(m.debe ?? '0'))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                            ESTADO_BADGE[m.estado ?? ''] ?? 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {ESTADO_LABEL[m.estado ?? ''] ?? m.estado ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* Facturación */}
      {activeTab === 'facturacion' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <EmptyTab
            icon={<DollarSign className="h-7 w-7 opacity-40" />}
            text="No hay facturas registradas."
          />
        </div>
      )}

      {/* Navegantes */}
      {activeTab === 'navegantes' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <EmptyTab
            icon={<Users className="h-7 w-7 opacity-40" />}
            text="No hay navegantes autorizados."
          />
        </div>
      )}

      {/* Salidas */}
      {activeTab === 'salidas' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <EmptyTab
            icon={<Clock className="h-7 w-7 opacity-40" />}
            text="No hay salidas registradas."
          />
        </div>
      )}

      {/* Documentación */}
      {activeTab === 'documentacion' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <EmptyTab
            icon={<FileText className="h-7 w-7 opacity-40" />}
            text="No hay documentos adjuntos."
          />
        </div>
      )}
    </div>
  );
}
