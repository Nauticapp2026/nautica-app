'use client';

import { useState } from 'react';

import { actualizarFinancieroAction, actualizarSeguridadSocialAction } from '@/app/actions/legajo';
import type { CatalogosDisponibles } from '@/lib/catalogos-club';
import { TIPOS_CUENTA } from '@/lib/legajo/constantes';
import type { LegajoDetalle } from '@/lib/legajo/consultas';
import { validarCbu } from '@/lib/legajo/validaciones';

import { AdjuntoInline } from './documentos-ui';
import {
  Campo,
  CatalogoSelect,
  Selector,
  Tarjeta,
  botonPrimario,
  inputCls,
  useAccion,
} from '@/components/shared/form-ui';

/** Solapa "Seguridad social y financiero": obra social, ART, apto médico y datos bancarios. */
export function TabSeguridad({
  det,
  catalogos,
}: {
  det: LegajoDetalle;
  catalogos: CatalogosDisponibles;
}) {
  return (
    <div className="space-y-6">
      <SeguridadSocial det={det} catalogos={catalogos} />
      <Financiero det={det} catalogos={catalogos} />
    </div>
  );
}

function SeguridadSocial({
  det,
  catalogos,
}: {
  det: LegajoDetalle;
  catalogos: CatalogosDisponibles;
}) {
  const e = det.empleado;
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    obraSocial: e.obraSocial ?? '',
    art: e.art ?? '',
    aptoMedico: e.aptoMedico,
    fechaUltimoExamen: e.fechaUltimoExamen ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Tarjeta
      titulo="Seguridad social, salud y seguros"
      descripcion="Cobertura médica, riesgos del trabajo y aptitud física."
      acciones={
        <button
          type="button"
          className={botonPrimario}
          disabled={pending}
          onClick={() =>
            ejecutar(() => actualizarSeguridadSocialAction(e.id, f), 'Seguridad social guardada.')
          }
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo label="Obra social" ayuda="Cobertura médica elegida.">
          <CatalogoSelect
            tipo="obra_social"
            value={f.obraSocial}
            onChange={(v) => set('obraSocial', v)}
            opciones={catalogos.obra_social}
          />
        </Campo>
        <Campo label="ART" ayuda="Aseguradora de riesgos del trabajo.">
          <CatalogoSelect
            tipo="art"
            value={f.art}
            onChange={(v) => set('art', v)}
            opciones={catalogos.art}
          />
        </Campo>
        <Campo label="Fecha del último examen médico" ayuda="Para el control periódico.">
          <input
            type="date"
            className={inputCls}
            value={f.fechaUltimoExamen}
            onChange={(x) => set('fechaUltimoExamen', x.target.value)}
          />
        </Campo>
        <div className="flex items-end pb-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
              checked={f.aptoMedico}
              onChange={(x) => set('aptoMedico', x.target.checked)}
            />
            <span className="text-sm font-medium text-gray-800">
              Cuenta con apto médico preocupacional
            </span>
          </label>
        </div>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-gray-700">Apto médico preocupacional</p>
        <AdjuntoInline empleadoId={e.id} tipo="apto_medico" doc={det.documentos['apto_medico']} />
      </div>
    </Tarjeta>
  );
}

function Financiero({ det, catalogos }: { det: LegajoDetalle; catalogos: CatalogosDisponibles }) {
  const e = det.empleado;
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    banco: e.banco ?? '',
    cbu: e.cbu ?? '',
    tipoCuenta: e.tipoCuenta ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const cbu = f.cbu.trim() === '' ? null : validarCbu(f.cbu);

  return (
    <Tarjeta
      titulo="Datos financieros"
      descripcion="Cuenta donde se acreditan los haberes."
      acciones={
        <button
          type="button"
          className={botonPrimario}
          disabled={pending}
          onClick={() =>
            ejecutar(() => actualizarFinancieroAction(e.id, f), 'Datos financieros guardados.')
          }
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo label="Banco">
          <CatalogoSelect
            tipo="banco"
            value={f.banco}
            onChange={(v) => set('banco', v)}
            opciones={catalogos.banco}
          />
        </Campo>
        <Campo label="Tipo de cuenta">
          <Selector
            value={f.tipoCuenta}
            onChange={(v) => set('tipoCuenta', v)}
            opciones={TIPOS_CUENTA}
          />
        </Campo>
        <Campo
          label="CBU / CVU"
          ayuda="22 dígitos. Se controlan los dígitos verificadores."
          className="md:col-span-2"
        >
          <input
            className={inputCls}
            value={f.cbu}
            maxLength={30}
            inputMode="numeric"
            placeholder="0000000000000000000000"
            onChange={(x) => set('cbu', x.target.value)}
          />
          {cbu && !cbu.ok && <p className="mt-1 text-xs text-red-600">{cbu.error}</p>}
          {cbu?.ok && <p className="mt-1 text-xs text-[#175861]">CBU válido.</p>}
        </Campo>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-gray-700">Constancia de CBU / CVU</p>
        <AdjuntoInline empleadoId={e.id} tipo="copia_cbu" doc={det.documentos['copia_cbu']} />
      </div>
    </Tarjeta>
  );
}
