'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  HeartPulse,
  History,
  User,
  Users,
} from 'lucide-react';

import { fechaLegible } from '@/lib/documentacion-fechas';
import { ESTADOS_EMPLEADO } from '@/lib/legajo/constantes';
import type { CatalogosDisponibles } from '@/lib/catalogos-club';
import type {
  HoraRegistrada,
  LegajoDetalle,
  PersonaSelector,
  UsuarioVinculable,
} from '@/lib/legajo/consultas';
import { escribirTabEnUrl, type LegajoTabId } from '@/lib/tab-url';

import { TabDocumentacion } from './tab-documentacion';
import { TabFamilia } from './tab-familia';
import { TabHistorial } from './tab-historial';
import { TabHoras } from './tab-horas';
import { TabLaboral } from './tab-laboral';
import { TabLicencias } from './tab-licencias';
import { TabPersonales } from './tab-personales';
import { TabSeguridad } from './tab-seguridad';

const TABS = [
  { id: 'personales', label: 'Datos personales', icon: User },
  { id: 'laboral', label: 'Laboral y horario', icon: Briefcase },
  { id: 'seguridad', label: 'Seguridad social y financiero', icon: HeartPulse },
  { id: 'familia', label: 'Educación y familia', icon: Users },
  { id: 'documentacion', label: 'Documentación', icon: FileText },
  { id: 'licencias', label: 'Licencias y vacaciones', icon: CalendarDays },
  { id: 'horas', label: 'Horas y novedades', icon: Clock },
  { id: 'historial', label: 'Historial', icon: History },
] as const satisfies readonly { id: LegajoTabId; label: string; icon: unknown }[];

const TAB_POR_DEFECTO: LegajoTabId = 'personales';

/** A qué solapa lleva cada dato faltante. */
const SOLAPA_DE_SECCION: Record<string, LegajoTabId> = {
  personales: 'personales',
  laboral: 'laboral',
  'seguridad-social': 'seguridad',
  financiero: 'seguridad',
  documentacion: 'documentacion',
};

export function LegajoDetail({
  det,
  catalogos,
  vinculables,
  personal,
  admins,
  horas,
  mes,
  tabInicial,
}: {
  det: LegajoDetalle;
  catalogos: CatalogosDisponibles;
  vinculables: UsuarioVinculable[];
  personal: PersonaSelector[];
  admins: PersonaSelector[];
  horas: HoraRegistrada[];
  mes: string;
  tabInicial: LegajoTabId;
}) {
  const [tab, setTab] = useState<LegajoTabId>(tabInicial);
  const e = det.empleado;
  const estado = ESTADOS_EMPLEADO.find((x) => x.value === e.estado);

  // Después de guardar, `router.refresh()` deja la URL sin el `?tab=`: se vuelve a escribir en
  // cada render para que F5 caiga en la misma solapa.
  useEffect(() => {
    escribirTabEnUrl(tab, TAB_POR_DEFECTO);
  });

  function cambiarTab(id: LegajoTabId) {
    setTab(id);
    escribirTabEnUrl(id, TAB_POR_DEFECTO);
  }

  return (
    <div className="p-4 md:p-8">
      <Link
        href="/personal"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Personal
      </Link>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">
            {e.apellido}, {e.nombre}
          </h1>
          <p className="page-subtitle mt-1">
            Legajo Nº {e.numero}
            {e.puesto && ` · ${e.puesto}`}
            {` · Ingreso ${fechaLegible(e.fechaIngreso)}`}
          </p>
        </div>
        <span
          className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${estado?.clase ?? 'bg-gray-100 text-gray-600'}`}
        >
          {estado?.label ?? e.estado}
        </span>
      </div>

      {det.faltantes.length > 0 ? (
        <div className="mb-6 rounded-[10px] border border-amber-200 bg-amber-50 p-3">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                Legajo incompleto: faltan {det.faltantes.length}{' '}
                {det.faltantes.length === 1 ? 'dato' : 'datos'}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {det.faltantes.map((f) => (
                  <button
                    key={`${f.seccion}-${f.etiqueta}`}
                    type="button"
                    onClick={() => cambiarTab(SOLAPA_DE_SECCION[f.seccion] ?? 'personales')}
                    className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                  >
                    {f.etiqueta}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        e.estado !== 'baja' && (
          <div className="mb-6 flex items-center gap-2 rounded-[10px] border border-teal-200 bg-teal-50 p-3 text-sm font-medium text-[#175861]">
            <CheckCircle2 className="h-4 w-4" />
            Legajo completo.
          </div>
        )
      )}

      {det.avisos.length > 0 && (
        <ul className="mb-6 space-y-1 text-sm text-gray-600">
          {det.avisos.map((a) => (
            <li key={a.etiqueta} className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              {a.etiqueta}
            </li>
          ))}
        </ul>
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

      {/* El key por legajo hace que los formularios se reinicien si cambia el dato guardado. */}
      {tab === 'personales' && (
        <TabPersonales key={`p-${e.id}`} det={det} vinculables={vinculables} />
      )}
      {tab === 'laboral' && (
        <TabLaboral key={`l-${e.id}`} det={det} catalogos={catalogos} personal={personal} />
      )}
      {tab === 'seguridad' && <TabSeguridad key={`s-${e.id}`} det={det} catalogos={catalogos} />}
      {tab === 'familia' && <TabFamilia key={`f-${e.id}`} det={det} />}
      {tab === 'documentacion' && <TabDocumentacion det={det} />}
      {tab === 'licencias' && (
        <TabLicencias det={det} catalogos={catalogos} personal={personal} admins={admins} />
      )}
      {tab === 'horas' && (
        <TabHoras
          key={`h-${mes}`}
          empleadoId={e.id}
          fechaIngreso={e.fechaIngreso}
          mes={mes}
          horas={horas}
        />
      )}
      {tab === 'historial' && <TabHistorial det={det} />}
    </div>
  );
}
