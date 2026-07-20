'use client';

import { useState } from 'react';

import { CobranzaTabla, type CobranzaRow } from './cobranza-tabla';
import { PaywayCobrosList, type CobroPayway } from './payway-cobros-list';

export function CobranzasTabsClient({
  cobranzas,
  cobrosPayway,
}: {
  cobranzas: CobranzaRow[];
  cobrosPayway: CobroPayway[];
}) {
  const [activeTab, setActiveTab] = useState<'cobranzas' | 'payway'>('cobranzas');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('cobranzas')}
          className={`px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'cobranzas'
              ? 'border-b-2 border-[#175861] text-[#175861]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Cobranzas
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {cobranzas.length}
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

      {activeTab === 'cobranzas' ? (
        <CobranzaTabla cobranzas={cobranzas} />
      ) : (
        <PaywayCobrosList cobros={cobrosPayway} />
      )}
    </div>
  );
}
