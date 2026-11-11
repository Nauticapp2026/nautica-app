'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Landmark, MapPin, ShieldCheck } from 'lucide-react';

import type { CatalogosDisponibles } from '@/lib/catalogos-club';
import { labelDe } from '@/lib/legajo/constantes';
import type { ProveedorDetalle } from '@/lib/proveedores/consultas';
import { ESTADOS_PROVEEDOR, TIPOS_SUJETO } from '@/lib/proveedores/constantes';
import { escribirTabEnUrl, type ProveedorTabId } from '@/lib/tab-url';

import { TabContable } from './tab-contable';
import { TabDocumentacion } from './tab-documentacion';
import { TabIdentificacion } from './tab-identificacion';
import { TabUbicacion } from './tab-ubicacion';

const TABS = [
  { id: 'identificacion', label: 'Identificación y fiscal', icon: FileText },
  { id: 'ubicacion', label: 'Ubicación y contacto', icon: MapPin },
  { id: 'contable', label: 'Contable y financiero', icon: Landmark },
  { id: 'documentacion', label: 'Documentación requerida', icon: ShieldCheck },
] as const satisfies readonly { id: ProveedorTabId; label: string; icon: unknown }[];

const TAB_POR_DEFECTO: ProveedorTabId = 'identificacion';

export function ProveedorDetail({
  det,
  catalogos,
  tabInicial,
}: {
  det: ProveedorDetalle;
  catalogos: CatalogosDisponibles;
  tabInicial: ProveedorTabId;
}) {
  const [tab, setTab] = useState<ProveedorTabId>(tabInicial);
  const p = det.proveedor;
  const estado = ESTADOS_PROVEEDOR.find((x) => x.value === p.estado);

  // `router.refresh()` después de guardar deja la URL sin el `?tab=`: se reescribe en cada render.
  useEffect(() => {
    escribirTabEnUrl(tab, TAB_POR_DEFECTO);
  });

  function cambiarTab(id: ProveedorTabId) {
    setTab(id);
    escribirTabEnUrl(id, TAB_POR_DEFECTO);
  }

  return (
    <div className="p-4 md:p-8">
      <Link
        href="/proveedores"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Proveedores
      </Link>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">{p.nombre}</h1>
          <p className="page-subtitle mt-1">
            {p.codigo}
            {p.nombreComercial && ` · ${p.nombreComercial}`}
            {p.tipoSujeto && ` · ${labelDe(TIPOS_SUJETO, p.tipoSujeto)}`}
            {p.cuit && ` · CUIT ${p.cuit}`}
          </p>
        </div>
        <span
          className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${estado?.clase ?? 'bg-gray-100 text-gray-600'}`}
        >
          {estado?.label ?? p.estado}
        </span>
      </div>

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

      {tab === 'identificacion' && (
        <TabIdentificacion key={`i-${p.id}`} det={det} catalogos={catalogos} />
      )}
      {tab === 'ubicacion' && <TabUbicacion key={`u-${p.id}`} det={det} />}
      {tab === 'contable' && <TabContable key={`c-${p.id}`} det={det} catalogos={catalogos} />}
      {tab === 'documentacion' && <TabDocumentacion det={det} catalogos={catalogos} />}
    </div>
  );
}
