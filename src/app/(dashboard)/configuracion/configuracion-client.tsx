'use client';

import { useState } from 'react';
import { Bell, Building2, Receipt, Users } from 'lucide-react';

type TabKey = 'info' | 'equipo' | 'punto_venta' | 'notificaciones';

const TABS: { key: TabKey; label: string; icon: typeof Bell }[] = [
  { key: 'info', label: 'Información general', icon: Receipt },
  { key: 'equipo', label: 'Equipo', icon: Users },
  { key: 'punto_venta', label: 'Punto de venta', icon: Building2 },
  { key: 'notificaciones', label: 'Notificaciones', icon: Bell },
];

export function ConfiguracionClient() {
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

      <section className="rounded-2xl border border-gray-200 bg-white p-8">
        {activeTab === 'info' && <TabPlaceholder title="Información general" />}
        {activeTab === 'equipo' && <TabPlaceholder title="Equipo" />}
        {activeTab === 'punto_venta' && <TabPlaceholder title="Punto de venta" />}
        {activeTab === 'notificaciones' && <TabPlaceholder title="Notificaciones" />}
      </section>
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
