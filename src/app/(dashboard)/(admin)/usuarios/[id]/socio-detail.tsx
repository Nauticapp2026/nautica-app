'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import {
  ArrowLeft,
  User,
  Anchor,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Users,
  Clock,
  FileText,
  Package,
  Printer,
  Ship,
  Star,
  TrendingUp,
  AlertTriangle,
  Eye,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  addMovimientoAction,
  eliminarPagoAction,
  informarPagoAction,
  marcarPagadasAction,
} from '@/app/actions/movimientos';
import { crearReciboInternoAction } from '@/app/actions/facturacion';
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
  updateNumeroSocioAction,
  updateSocioAction,
  updateSocioStatusAction,
  uploadSocioDocumentoAction,
} from '@/app/actions/socios';
import {
  guardarTarjetaSocioAction,
  eliminarTarjetaSocioAction,
  type GuardarTarjetaData,
} from '@/app/actions/payway';
import { formatArgentinaDate, formatArgentinaDateTime, formatNaiveDateTime } from '@/lib/dates';
import { ASTILLEROS } from '../astilleros';
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
  ciudad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  contactoEmergencia: string | null;
  razonSocial: string | null;
  cuit: string | null;
  direccionFiscal: string | null;
  condicionIva: string | null;
  condicionIibb: string | null;
  estadoSocio: string | null;
  deuda: string | null;
  memberSince: string;
  membershipStatus: 'active' | 'suspended' | 'removed' | 'inactivo' | null;
  numeroSocio: number | null;
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
  facturaCodigo: string | null;
  facturaArchivo: string | null;
};

type Servicio = {
  id: string;
  nombre: string;
  precio: string | null;
};

type ServiciosContratado = {
  embarcacionNombre: string;
  espacioLabel: string;
  servicioNombre: string | null;
  precio: string | null;
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

const FORMAS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { value: 'debito_automatico', label: 'Débito automático' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
];

const TABS = [
  { id: 'generales', label: 'Generales', icon: User },
  { id: 'impositivos', label: 'Datos Impositivos', icon: FileText },
  { id: 'embarcacion', label: 'Embarcación', icon: Anchor },
  { id: 'servicios-contratados', label: 'Servicios Contratados', icon: Package },
  { id: 'cuenta-corriente', label: 'Cuenta Corriente', icon: CreditCard },
  { id: 'navegantes', label: 'Navegantes', icon: Users },
  { id: 'salidas', label: 'Salidas', icon: Clock },
  { id: 'documentacion', label: 'Documentación', icon: FileText },
  { id: 'payway', label: 'Débito automático', icon: CreditCard },
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
  pagado: 'bg-gray-900 text-white',
  facturado: 'bg-green-100 text-green-700',
  no_pagado: 'bg-green-100 text-green-700',
  vencido: 'bg-red-100 text-red-700',
};

const MEMBERSHIP_STATUS_CLASSES: Record<'active' | 'suspended' | 'inactivo', string> = {
  active: 'border-green-200 bg-green-50 text-green-700',
  suspended: 'border-amber-200 bg-amber-50 text-amber-700',
  inactivo: 'border-gray-200 bg-gray-100 text-gray-500',
};

const MEMBERSHIP_STATUS_LABEL: Record<'active' | 'suspended' | 'inactivo', string> = {
  active: 'Activo',
  suspended: 'Pausado',
  inactivo: 'Inactivo',
};

const ESTADO_LABEL: Record<string, string> = {
  pagado: 'Pagado',
  facturado: 'En Plazo',
  no_pagado: 'En Plazo',
  vencido: 'Vencido',
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

// ─── Forma de Pago Fields ─────────────────────────────────────────────────────

function FormaPagoFields({
  formaDePago,
  datosPago,
  setDatosPago,
}: {
  formaDePago: string;
  datosPago: Record<string, string>;
  setDatosPago: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDatosPago((prev) => ({ ...prev, [k]: e.target.value }));
  const val = (k: string) => datosPago[k] ?? '';

  if (!formaDePago || formaDePago === 'efectivo') return null;

  if (formaDePago === 'tarjeta_credito') {
    return (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Banco / Entidad">
            <input
              className={inputCls}
              placeholder="Banco"
              value={val('banco')}
              onChange={set('banco')}
            />
          </Field>
          <Field label="Últimos 4 dígitos">
            <input
              className={inputCls}
              placeholder="1234"
              maxLength={4}
              value={val('ultimos4')}
              onChange={set('ultimos4')}
            />
          </Field>
        </div>
        <Field label="Cuotas">
          <select className={inputCls} value={val('cuotas')} onChange={set('cuotas')}>
            <option value="">Seleccione...</option>
            {[1, 2, 3, 6, 9, 12, 18, 24].map((n) => (
              <option key={n} value={String(n)}>
                {n === 1 ? 'Contado' : `${n} cuotas`}
              </option>
            ))}
          </select>
        </Field>
      </>
    );
  }

  if (formaDePago === 'tarjeta_debito') {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Banco / Entidad">
          <input
            className={inputCls}
            placeholder="Banco"
            value={val('banco')}
            onChange={set('banco')}
          />
        </Field>
        <Field label="Últimos 4 dígitos">
          <input
            className={inputCls}
            placeholder="1234"
            maxLength={4}
            value={val('ultimos4')}
            onChange={set('ultimos4')}
          />
        </Field>
      </div>
    );
  }

  if (formaDePago === 'debito_automatico') {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Banco / Entidad">
          <input
            className={inputCls}
            placeholder="Banco"
            value={val('banco')}
            onChange={set('banco')}
          />
        </Field>
        <Field label="CBU / Alias">
          <input
            className={inputCls}
            placeholder="CBU / Alias"
            value={val('cbuAlias')}
            onChange={set('cbuAlias')}
          />
        </Field>
      </div>
    );
  }

  if (formaDePago === 'transferencia') {
    return (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Banco origen">
            <input
              className={inputCls}
              placeholder="Banco"
              value={val('banco')}
              onChange={set('banco')}
            />
          </Field>
          <Field label="Nombre del titular">
            <input
              className={inputCls}
              placeholder="Nombre"
              value={val('titular')}
              onChange={set('titular')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="CBU / Alias">
            <input
              className={inputCls}
              placeholder="CBU / Alias"
              value={val('cbuAlias')}
              onChange={set('cbuAlias')}
            />
          </Field>
          <Field label="Importe">
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder="0,00"
              value={val('importe')}
              onChange={set('importe')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fecha de transferencia">
            <input type="date" className={inputCls} value={val('fecha')} onChange={set('fecha')} />
          </Field>
          <Field label="Nro. de operación / ref.">
            <input
              className={inputCls}
              placeholder="Número"
              value={val('nroOperacion')}
              onChange={set('nroOperacion')}
            />
          </Field>
        </div>
        <Field label="Observaciones">
          <input
            className={inputCls}
            placeholder="Observaciones"
            value={val('observaciones')}
            onChange={set('observaciones')}
          />
        </Field>
      </>
    );
  }

  if (formaDePago === 'cheque') {
    return (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Número de cheque">
            <input
              className={inputCls}
              placeholder="Número"
              value={val('numeroCheque')}
              onChange={set('numeroCheque')}
            />
          </Field>
          <Field label="Banco emisor">
            <input
              className={inputCls}
              placeholder="Banco"
              value={val('banco')}
              onChange={set('banco')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Sucursal">
            <input
              className={inputCls}
              placeholder="Sucursal"
              value={val('sucursal')}
              onChange={set('sucursal')}
            />
          </Field>
          <Field label="CUIT / CUIL del emisor">
            <input
              className={inputCls}
              placeholder="CUIT/CUIL"
              value={val('cuitCuil')}
              onChange={set('cuitCuil')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre del titular del cheque">
            <input
              className={inputCls}
              placeholder="Nombre"
              value={val('titular')}
              onChange={set('titular')}
            />
          </Field>
          <Field label="Importe del cheque">
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder="0,00"
              value={val('importe')}
              onChange={set('importe')}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tipo de cheque">
            <select className={inputCls} value={val('tipoCheque')} onChange={set('tipoCheque')}>
              <option value="">Seleccione una opción...</option>
              <option value="al_dia">Al día</option>
              <option value="diferido">Diferido</option>
            </select>
          </Field>
          <Field label="Moneda">
            <select className={inputCls} value={val('moneda')} onChange={set('moneda')}>
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
              value={val('cuenta')}
              onChange={set('cuenta')}
            />
          </Field>
          <Field label="Observaciones">
            <input
              className={inputCls}
              placeholder="Observaciones"
              value={val('observaciones')}
              onChange={set('observaciones')}
            />
          </Field>
        </div>
      </>
    );
  }

  if (formaDePago === 'mercado_pago') {
    return (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre / Email del pagador">
            <input
              className={inputCls}
              placeholder="Nombre o email"
              value={val('pagador')}
              onChange={set('pagador')}
            />
          </Field>
          <Field label="Nro. de operación">
            <input
              className={inputCls}
              placeholder="Número"
              value={val('nroOperacion')}
              onChange={set('nroOperacion')}
            />
          </Field>
        </div>
        <Field label="Importe">
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder="0,00"
            value={val('importe')}
            onChange={set('importe')}
          />
        </Field>
      </>
    );
  }

  return null;
}

// ─── Forma de Pago Modal ──────────────────────────────────────────────────────

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
  const [formaDePago, setFormaDePago] = useState('');
  const [datosPago, setDatosPago] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClose() {
    setFormaDePago('');
    setDatosPago({});
    setError(null);
    onClose();
  }

  function handleSubmit() {
    if (!formaDePago) {
      setError('Seleccioná una forma de pago.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await marcarPagadasAction({
        ids: selectedIds,
        socioId,
        formaDePago,
        datosPago: datosPago as Record<string, unknown>,
      });
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
            <select
              className={inputCls}
              value={formaDePago}
              onChange={(e) => {
                setFormaDePago(e.target.value);
                setDatosPago({});
              }}
            >
              <option value="">Seleccione una opción...</option>
              {FORMAS_PAGO.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <FormaPagoFields
            formaDePago={formaDePago}
            datosPago={datosPago}
            setDatosPago={setDatosPago}
          />

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
              disabled={isPending || !formaDePago}
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
  const [estadoPago, setEstadoPago] = useState<'no_pagado' | 'pagado'>('no_pagado');
  const [formaDePago, setFormaDePago] = useState('');
  const [datosPago, setDatosPago] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isValid = Boolean(
    servicioId && monto && (estadoPago === 'no_pagado' || Boolean(formaDePago)),
  );

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
    setEstadoPago('no_pagado');
    setFormaDePago('');
    setDatosPago({});
    setError(null);
    onClose();
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await addMovimientoAction({
        socioId,
        servicioId,
        concepto,
        monto: montoToNumberStr(monto),
        fecha,
        estado: estadoPago,
        ...(estadoPago === 'pagado' && formaDePago
          ? { formaDePago, datosPago: datosPago as Record<string, unknown> }
          : {}),
      });
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
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Cargar consumo
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

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {/* Toggle Pendiente / Pagado */}
          <div className="flex rounded-[10px] border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => {
                setEstadoPago('no_pagado');
                setFormaDePago('');
                setDatosPago({});
              }}
              className={`flex-1 rounded-[8px] py-1.5 text-sm font-medium transition ${estadoPago === 'no_pagado' ? 'bg-white text-[#101828] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Pendiente
            </button>
            <button
              type="button"
              onClick={() => setEstadoPago('pagado')}
              className={`flex-1 rounded-[8px] py-1.5 text-sm font-medium transition ${estadoPago === 'pagado' ? 'bg-white text-[#101828] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Pagado
            </button>
          </div>

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
                inputMode="decimal"
                placeholder="0,00"
                value={monto}
                onChange={(e) => setMonto(sanitizeMontoInput(e.target.value))}
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

          {estadoPago === 'pagado' && (
            <>
              <Field label="Forma de pago">
                <select
                  className={inputCls}
                  value={formaDePago}
                  onChange={(e) => {
                    setFormaDePago(e.target.value);
                    setDatosPago({});
                  }}
                >
                  <option value="">Seleccione una opción...</option>
                  {FORMAS_PAGO.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <FormaPagoFields
                formaDePago={formaDePago}
                datosPago={datosPago}
                setDatosPago={setDatosPago}
              />
            </>
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
              {isPending ? 'Guardando...' : 'Cargar consumo'}
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
  saldoBruto,
}: {
  open: boolean;
  onClose: () => void;
  socioId: string;
  socioNombre: string;
  saldoBruto: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'post-pago' | 'recibo-creado'>('form');
  const [pagoResult, setPagoResult] = useState<{
    movimientoId: string;
    concepto: string;
    importe: string;
    fecha: string;
    formaDePago: string;
  } | null>(null);
  const [reciboId, setReciboId] = useState<string | null>(null);
  const [formaDePago, setFormaDePago] = useState('');
  const [datosPago, setDatosPago] = useState<Record<string, string>>({});
  // Lazy init — monto se pre-llena con el saldo deudor en cada remount (key cambia al abrir).
  const [monto, setMonto] = useState(() =>
    saldoBruto > 0 ? saldoBruto.toFixed(2).replace('.', ',') : '',
  );
  const [fecha, setFecha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isValid = Boolean(formaDePago && monto && parseFloat(montoToNumberStr(monto)) > 0);

  function handleFinalClose() {
    onClose();
    router.refresh();
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await informarPagoAction({
        socioId,
        monto: montoToNumberStr(monto),
        fecha,
        formaDePago,
        datosPago: datosPago as Record<string, unknown>,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setPagoResult({
          movimientoId: res.movimientoId!,
          concepto: res.concepto!,
          importe: res.importe!,
          fecha: fecha || new Date().toISOString().slice(0, 10),
          formaDePago,
        });
        setStep('post-pago');
      }
    });
  }

  function handleCrearRecibo() {
    if (!pagoResult) return;
    startTransition(async () => {
      const res = await crearReciboInternoAction({
        socioId,
        movimientoId: pagoResult.movimientoId,
        importe: pagoResult.importe,
        descripcion: pagoResult.concepto,
        medioPago: pagoResult.formaDePago,
        fecha: pagoResult.fecha,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setReciboId(res.id!);
        setStep('recibo-creado');
      }
    });
  }

  if (!open) return null;

  // ── Step: post-pago ──────────────────────────────────────────────────────────
  if (step === 'post-pago') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
          <div className="p-6 pb-4">
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Pago registrado
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              ¿Desea emitir un comprobante para {socioNombre}?
            </p>
          </div>
          <div className="border-t border-gray-200" />
          <div className="space-y-3 p-6">
            <button
              onClick={() => {
                toast.success('Pago registrado');
                onClose();
                router.push('/facturacion');
                router.refresh();
              }}
              className="w-full rounded-[10px] border border-[#175861] bg-white px-4 py-3 text-left text-sm font-medium text-[#175861] transition hover:bg-teal-50"
            >
              <span className="font-semibold">Factura AFIP</span>
              <span className="ml-2 text-xs text-gray-400">Se emite con CAE</span>
            </button>
            <button
              onClick={handleCrearRecibo}
              disabled={isPending}
              className="w-full rounded-[10px] border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="font-semibold">Comprobante interno</span>
              <span className="ml-2 text-xs text-gray-400">Sin valor fiscal</span>
            </button>
            <button
              onClick={() => {
                toast.success('Pago registrado');
                handleFinalClose();
              }}
              className="w-full rounded-[10px] px-4 py-3 text-left text-sm font-medium text-gray-500 transition hover:bg-gray-50"
            >
              Sin comprobante
              <span className="ml-2 text-xs text-gray-400">Solo movimiento</span>
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Step: recibo-creado ──────────────────────────────────────────────────────
  if (step === 'recibo-creado') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
          <div className="flex flex-col items-center p-6 text-center">
            <CheckCircle2 className="mb-3 h-12 w-12 text-teal-600" />
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Comprobante creado
            </h2>
            <p className="mt-1 text-sm" style={{ color: '#669E9D' }}>
              El pago y el recibo interno fueron registrados.
            </p>
          </div>
          <div className="border-t border-gray-200" />
          <div className="flex gap-3 p-6">
            <button
              onClick={() => {
                toast.success('Pago registrado');
                handleFinalClose();
              }}
              className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
            >
              Cerrar
            </button>
            <a
              href={`/facturacion/recibo/${reciboId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: '#175861' }}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: form ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              Registrar pago
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              Registre un pago a cuenta de {socioNombre}
            </p>
          </div>
          <button onClick={onClose} className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: '#101828' }}>
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

          <Field label="Forma de pago">
            <select
              className={inputCls}
              value={formaDePago}
              onChange={(e) => {
                setFormaDePago(e.target.value);
                setDatosPago({});
              }}
            >
              <option value="">Seleccione una opción...</option>
              {FORMAS_PAGO.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <FormaPagoFields
            formaDePago={formaDePago}
            datosPago={datosPago}
            setDatosPago={setDatosPago}
          />

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

// Filtra a digitos + un separador decimal (acepta coma o punto).
// El usuario ve lo que tipea sin reformatear en cada keystroke.
function sanitizeMontoInput(raw: string): string {
  let out = raw.replace(/[^0-9.,]/g, '');
  // Permitir solo un separador decimal: dejar el primero, sacar los siguientes.
  const firstSep = out.search(/[.,]/);
  if (firstSep >= 0) {
    out = out.slice(0, firstSep + 1) + out.slice(firstSep + 1).replace(/[.,]/g, '');
  }
  return out;
}

// Convierte el input del usuario al formato que esperan los actions (parseFloat).
function montoToNumberStr(input: string): string {
  return input.replace(',', '.');
}

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
            {e.precio ? ` — $${Number(e.precio).toLocaleString('es-AR')}` : ''}
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
  documentos?: DocumentoItem[];
  salidas?: SalidaItem[];
  espaciosDisponibles: EspacioOption[];
  serviciosContratados?: ServiciosContratado[];
  paywayPublicKey?: string | null;
  paywayToken?: PaywayTokenInfo | null;
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
    ciudad: socio.ciudad ?? '',
    provincia: socio.provincia ?? '',
    codigoPostal: socio.codigoPostal ?? '',
    contactoEmergencia: socio.contactoEmergencia ?? '',
    razonSocial: socio.razonSocial ?? '',
    cuit: socio.cuit ?? '',
    direccionFiscal: socio.direccionFiscal ?? '',
    condicionIva: socio.condicionIva ?? '',
    condicionIibb: socio.condicionIibb ?? '',
    numeroSocio: socio.numeroSocio != null ? String(socio.numeroSocio) : '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminarError, setEliminarError] = useState<string | null>(null);
  const [isEliminando, startEliminando] = useTransition();
  const initialStatus =
    socio.membershipStatus === 'suspended' || socio.membershipStatus === 'inactivo'
      ? socio.membershipStatus
      : 'active';
  const [currentStatus, setCurrentStatus] = useState<'active' | 'suspended' | 'inactivo'>(
    initialStatus,
  );
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
      condicionIibb: socio.condicionIibb ?? '',
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

  function handleStatusChange(newStatus: 'active' | 'suspended' | 'inactivo') {
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
    const val = e.target.value;
    if (val === '_eliminar') {
      setConfirmEliminar(true);
      return;
    }
    handleStatusChange(val as 'active' | 'suspended' | 'inactivo');
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
  // Saldo real del socio. Positivo = nos debe, negativo = saldo a favor.
  const saldoBruto = totalCargosPendientes - totalPagosACuenta;
  const totalPendiente = Math.max(0, saldoBruto);
  const totalAFavor = saldoBruto < 0 ? Math.abs(saldoBruto) : 0;

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
        key={String(modalInformarPagoOpen)}
        open={modalInformarPagoOpen}
        onClose={() => setModalInformarPagoOpen(false)}
        socioId={socio.id}
        socioNombre={nombre}
        saldoBruto={saldoBruto}
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
          <option value="suspended">{MEMBERSHIP_STATUS_LABEL.suspended}</option>
          <option value="inactivo">{MEMBERSHIP_STATUS_LABEL.inactivo}</option>
          <option value="_eliminar">Eliminar...</option>
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
        <ServiciosContratadosTab serviciosContratados={serviciosContratados} />
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
                Registrar pago
              </button>
              <button
                onClick={() => setModalServicioOpen(true)}
                className="shrink-0 justify-center rounded-[10px] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                style={{ background: '#175861' }}
              >
                Cargar consumo
              </button>
            </div>
          </div>

          {/* Metric cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Detalle</th>
                      <th className="px-4 py-3">Nº Comprobante</th>
                      <th className="px-4 py-3 text-right">Ventas</th>
                      <th className="px-4 py-3 text-right">Cobranzas</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      <th className="px-4 py-3 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Calcular saldo acumulado de más viejo a más nuevo.
                      // movimientos viene ordenado más nuevo primero (desc fecha),
                      // así que invertimos para acumular y luego volvemos a invertir.
                      const asc = [...movimientos].reverse();
                      let acum = 0;
                      const conSaldo = asc.map((m) => {
                        const venta = parseFloat(m.debe ?? '0');
                        const cobranza = parseFloat(m.haber ?? '0');
                        acum = acum + venta - cobranza;
                        return { ...m, saldo: acum };
                      });
                      return conSaldo.reverse().map((m) => {
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
                            <td className="px-4 py-3 font-medium" style={{ color: '#175861' }}>
                              {detalle}
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
                                {esPago ? (
                                  <EliminarPagoButton movimientoId={m.id} socioId={socio.id} />
                                ) : (
                                  <span
                                    className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                                      ESTADO_BADGE[m.estado ?? ''] ?? 'bg-gray-100 text-gray-500'
                                    }`}
                                  >
                                    {ESTADO_LABEL[m.estado ?? ''] ?? m.estado ?? '—'}
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
              </div>
            </>
          )}
        </div>
      )}

      {/* Navegantes — accesos externos del socio */}
      {activeTab === 'navegantes' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          {navegantes.length === 0 ? (
            <EmptyState
              icon={<Users className="h-7 w-7 opacity-40" />}
              text="No hay navegantes registrados."
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
                      <p className="truncate text-sm font-semibold" style={{ color: '#101828' }}>
                        {nombreCompleto}
                      </p>
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
                          Cancelada
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
    k: 'razonSocial' | 'cuit' | 'direccionFiscal' | 'condicionIva' | 'condicionIibb',
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  handleGuardar: () => void;
  handleCancelar: () => void;
  editError: string | null;
  isSaving: boolean;
}) {
  const inputCls =
    'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

  return (
    <div className="space-y-4">
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
  serviciosContratados,
}: {
  serviciosContratados: ServiciosContratado[];
}) {
  if (serviciosContratados.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-7 w-7 opacity-40" />}
        text="El socio no tiene embarcaciones asignadas a espacios todavía."
      />
    );
  }
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <p className="mb-4 text-[18px] font-bold" style={{ color: '#101828' }}>
        Servicios contratados
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase">
              <th className="pr-4 pb-2">Embarcación</th>
              <th className="pr-4 pb-2">Espacio</th>
              <th className="pr-4 pb-2">Tarifa</th>
              <th className="pb-2 text-right">Precio / mes</th>
            </tr>
          </thead>
          <tbody>
            {serviciosContratados.map((s, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="py-3 pr-4 font-medium" style={{ color: '#101828' }}>
                  {s.embarcacionNombre}
                </td>
                <td className="py-3 pr-4 text-gray-600">{s.espacioLabel}</td>
                <td className="py-3 pr-4 text-gray-600">{s.servicioNombre ?? '—'}</td>
                <td className="py-3 text-right font-medium" style={{ color: '#101828' }}>
                  {s.precio
                    ? `$${Number(s.precio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
