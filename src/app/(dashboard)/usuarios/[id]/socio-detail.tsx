'use client';

import { useState } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';

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

// ─── Constants ───────────────────────────────────────────────────────────────

const TIPO_DOC_LABELS: Record<string, string> = {
  dni: 'DNI',
  cuit: 'CUIT',
  cuil: 'CUIL',
  pasaporte: 'Pasaporte',
  cdi: 'CDI',
};

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

// ─── Empty tab content ────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export function SocioDetail({
  socio,
  embarcaciones,
}: {
  socio: SocioData;
  embarcaciones: Embarcacion[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>('generales');

  const nombre = [socio.nombre, socio.apellido].filter(Boolean).join(' ') || socio.email;
  const inicial = (socio.nombre?.[0] ?? socio.email[0]).toUpperCase();

  const memberDate = new Date(socio.memberSince).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="p-8">
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

      {/* Tab content */}
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

      {activeTab === 'cuenta-corriente' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <EmptyTab
            icon={<CreditCard className="h-7 w-7 opacity-40" />}
            text="No hay movimientos en la cuenta corriente."
          />
        </div>
      )}

      {activeTab === 'facturacion' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <EmptyTab
            icon={<DollarSign className="h-7 w-7 opacity-40" />}
            text="No hay facturas registradas."
          />
        </div>
      )}

      {activeTab === 'navegantes' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <EmptyTab
            icon={<Users className="h-7 w-7 opacity-40" />}
            text="No hay navegantes autorizados."
          />
        </div>
      )}

      {activeTab === 'salidas' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <EmptyTab
            icon={<Clock className="h-7 w-7 opacity-40" />}
            text="No hay salidas registradas."
          />
        </div>
      )}

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
