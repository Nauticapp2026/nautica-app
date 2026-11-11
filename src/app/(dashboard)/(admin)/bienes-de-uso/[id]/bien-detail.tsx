'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calculator, ClipboardList, FileText } from 'lucide-react';

import { ESTADOS_BIEN } from '@/lib/bienes-uso/constantes';
import type { BienDetalle } from '@/lib/bienes-uso/consultas';
import type { CatalogosDisponibles } from '@/lib/catalogos-club';
import { fechaLegible } from '@/lib/documentacion-fechas';
import type { PersonaSelector } from '@/lib/legajo/consultas';
import { escribirTabEnUrl, type BienTabId } from '@/lib/tab-url';

import { TabContable } from './tab-contable';
import { TabGenerales } from './tab-generales';
import { TabMantenimiento } from './tab-mantenimiento';

const TABS = [
  { id: 'generales', label: 'Datos generales', icon: FileText },
  { id: 'contable', label: 'Datos contables', icon: Calculator },
  { id: 'mantenimiento', label: 'Mantenimiento y reparaciones', icon: ClipboardList },
] as const satisfies readonly { id: BienTabId; label: string; icon: unknown }[];

const TAB_POR_DEFECTO: BienTabId = 'generales';

export function BienDetail({
  det,
  catalogos,
  personal,
  proveedores,
  hoy,
  tabInicial,
}: {
  det: BienDetalle;
  catalogos: CatalogosDisponibles;
  personal: PersonaSelector[];
  proveedores: PersonaSelector[];
  hoy: string;
  tabInicial: BienTabId;
}) {
  const [tab, setTab] = useState<BienTabId>(tabInicial);
  const b = det.bien;
  const estado = ESTADOS_BIEN.find((x) => x.value === b.estado);

  // `router.refresh()` después de guardar deja la URL sin el `?tab=`: se reescribe en cada render.
  useEffect(() => {
    escribirTabEnUrl(tab, TAB_POR_DEFECTO);
  });

  function cambiarTab(id: BienTabId) {
    setTab(id);
    escribirTabEnUrl(id, TAB_POR_DEFECTO);
  }

  return (
    <div className="p-4 md:p-8">
      <Link
        href="/bienes-de-uso"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Bienes de uso
      </Link>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">{b.nombre}</h1>
          <p className="page-subtitle mt-1">
            ID {b.numero}
            {b.tipoBien && ` · ${b.tipoBien}`}
            {b.marca && ` · ${b.marca}`}
            {b.patente && ` · ${b.patente}`}
            {` · Incorporado ${fechaLegible(b.fechaIncorporacion)}`}
          </p>
        </div>
        <span
          className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${estado?.clase ?? 'bg-gray-100 text-gray-600'}`}
        >
          {b.estado === 'otro' && b.estadoDetalle ? b.estadoDetalle : (estado?.label ?? b.estado)}
        </span>
      </div>

      {b.fechaBaja && (
        <div className="mb-6 rounded-[10px] border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <span className="font-semibold">Dado de baja el {fechaLegible(b.fechaBaja)}</span>
          {b.motivoBaja && ` · ${b.motivoBaja}`}
          {b.motivoBajaDetalle && ` — ${b.motivoBajaDetalle}`}
        </div>
      )}

      <div className="-mx-4 mb-6 overflow-x-auto border-b border-gray-200 md:mx-0">
        <div className="flex min-w-max gap-0 px-4 whitespace-nowrap md:px-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => cambiarTab(id)}
              className={`flex shrink-0 items-center gap-2 px-4 pb-3 text-sm font-medium transition ${
                tab === id
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

      {tab === 'generales' && (
        <TabGenerales
          key={`g-${b.id}`}
          det={det}
          catalogos={catalogos}
          personal={personal}
          hoy={hoy}
        />
      )}
      {tab === 'contable' && <TabContable key={`c-${b.id}`} det={det} hoy={hoy} />}
      {tab === 'mantenimiento' && (
        <TabMantenimiento
          det={det}
          catalogos={catalogos}
          personal={personal}
          proveedores={proveedores}
          hoy={hoy}
        />
      )}
    </div>
  );
}
