'use client';

import { useState, useTransition } from 'react';
import { Bell, Building2, Minus, Receipt, Users } from 'lucide-react';

import {
  updateGuarderiaGeneralAction,
  type HorarioInput,
  type UpdateGuarderiaGeneralData,
} from '@/app/actions/configuracion';

type TabKey = 'info' | 'equipo' | 'punto_venta' | 'notificaciones';

const TABS: { key: TabKey; label: string; icon: typeof Bell }[] = [
  { key: 'info', label: 'Información general', icon: Receipt },
  { key: 'equipo', label: 'Equipo', icon: Users },
  { key: 'punto_venta', label: 'Punto de venta', icon: Building2 },
  { key: 'notificaciones', label: 'Notificaciones', icon: Bell },
];

const TIPO_OPTS = [
  { value: 'club_nautico', label: 'Club Náutico' },
  { value: 'marina_privada', label: 'Marina Privada' },
  { value: 'guarderia_nautica', label: 'Guardería Náutica' },
  { value: 'puerto_deportivo', label: 'Puerto Deportivo' },
  { value: 'otro', label: 'Otro' },
] as const;

const DIAS_LABELS: Record<HorarioInput['dia'], string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

export type InfoGeneralData = UpdateGuarderiaGeneralData;

const inputCls =
  'h-11 w-full rounded-[10px] border border-gray-200 bg-white px-4 text-sm text-[#101828] focus:border-[#175861] focus:outline-none focus:ring-1 focus:ring-[#175861]';

export function ConfiguracionClient({ infoGeneral }: { infoGeneral: InfoGeneralData }) {
  const [activeTab, setActiveTab] = useState<TabKey>('info');

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#101828' }}>
          Configuración
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#669E9D' }}>
          Administra la configuración de tu guardería náutica
        </p>
      </header>

      <div className="mb-6 flex items-center gap-2 border-b border-gray-200">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors ${
                isActive
                  ? 'border-[#175861] font-semibold text-[#175861]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === 'info' && <InfoGeneralForm initial={infoGeneral} />}
      {activeTab === 'equipo' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-8">
          <TabPlaceholder title="Equipo" />
        </section>
      )}
      {activeTab === 'punto_venta' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-8">
          <TabPlaceholder title="Punto de venta" />
        </section>
      )}
      {activeTab === 'notificaciones' && (
        <section className="rounded-2xl border border-gray-200 bg-white p-8">
          <TabPlaceholder title="Notificaciones" />
        </section>
      )}
    </div>
  );
}

function InfoGeneralForm({ initial }: { initial: InfoGeneralData }) {
  const [data, setData] = useState<InfoGeneralData>(initial);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const onField = <K extends keyof InfoGeneralData>(key: K, value: InfoGeneralData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
    setFeedback(null);
  };

  const onHorario = (
    dia: HorarioInput['dia'],
    patch: Partial<Pick<HorarioInput, 'horarios' | 'cerrado'>>,
  ) => {
    setData((prev) => ({
      ...prev,
      horarios: prev.horarios.map((h) => (h.dia === dia ? { ...h, ...patch } : h)),
    }));
    setFeedback(null);
  };

  const onSubmit = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateGuarderiaGeneralAction(data);
      if (res.error) setFeedback({ type: 'error', msg: res.error });
      else setFeedback({ type: 'success', msg: 'Cambios guardados.' });
    });
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-8">
      <h2 className="mb-6 text-base font-bold" style={{ color: '#101828' }}>
        Datos de la Guardería
      </h2>

      <div className="space-y-4">
        <Field label="Nombre del club / guardería" required>
          <input
            className={inputCls}
            value={data.nombre}
            onChange={(e) => onField('nombre', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="CUIT" required>
            <input
              className={inputCls}
              value={data.cuit}
              onChange={(e) => onField('cuit', e.target.value)}
            />
          </Field>
          <Field label="Tipo de establecimiento" required>
            <select
              className={inputCls}
              value={data.tipo}
              onChange={(e) => onField('tipo', e.target.value as InfoGeneralData['tipo'])}
            >
              {TIPO_OPTS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Dirección" required>
          <input
            className={inputCls}
            value={data.direccion}
            onChange={(e) => onField('direccion', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Ciudad" required>
            <input
              className={inputCls}
              value={data.ciudad}
              onChange={(e) => onField('ciudad', e.target.value)}
            />
          </Field>
          <Field label="Provincia" required>
            <input
              className={inputCls}
              value={data.provincia}
              onChange={(e) => onField('provincia', e.target.value)}
            />
          </Field>
          <Field label="Código Postal" required>
            <input
              className={inputCls}
              value={data.codigoPostal}
              onChange={(e) => onField('codigoPostal', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Teléfono operativo" required>
            <input
              className={inputCls}
              value={data.telefono}
              onChange={(e) => onField('telefono', e.target.value)}
            />
          </Field>
          <Field label="Email operativo" required>
            <input
              className={inputCls}
              type="email"
              value={data.email}
              onChange={(e) => onField('email', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
          {data.horarios.map((h) => (
            <div key={h.dia}>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                {DIAS_LABELS[h.dia]}
              </label>
              <div className="flex items-center gap-2">
                <input
                  className={`${inputCls} ${h.cerrado ? 'bg-gray-50 text-gray-400' : ''}`}
                  placeholder="09:00 - 18:00"
                  value={h.horarios ?? ''}
                  disabled={h.cerrado}
                  onChange={(e) => onHorario(h.dia, { horarios: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => onHorario(h.dia, { cerrado: !h.cerrado })}
                  title={h.cerrado ? 'Marcar como abierto' : 'Marcar como cerrado'}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border transition-colors ${
                    h.cerrado
                      ? 'border-gray-300 bg-gray-100 text-gray-500'
                      : 'border-gray-200 bg-white text-[#669E9D] hover:bg-gray-50'
                  }`}
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {feedback && (
          <p className={`text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
            {feedback.msg}
          </p>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="rounded-[10px] bg-[#175861] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-gray-700">
        {label}
        {required && '*'}
      </label>
      {children}
    </div>
  );
}

function TabPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h2 className="text-lg font-semibold" style={{ color: '#101828' }}>
        {title}
      </h2>
      <p className="mt-2 text-sm text-gray-500">Próximamente</p>
    </div>
  );
}
