'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import {
  actualizarEducacionAction,
  eliminarFamiliarAction,
  guardarFamiliarAction,
} from '@/app/actions/legajo';
import {
  ESTADOS_CIVILES,
  ESTADOS_EDUCATIVOS,
  NIVELES_EDUCATIVOS,
  PARENTESCOS,
  labelDe,
} from '@/lib/legajo/constantes';
import type { LegajoDetalle } from '@/lib/legajo/consultas';
import { fechaLegible } from '@/lib/documentacion-fechas';

import {
  Campo,
  Selector,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  inputCls,
  textareaCls,
  useAccion,
} from '@/components/shared/form-ui';

type Familiar = LegajoDetalle['familiares'][number];

/** Solapa "Educación y grupo familiar". */
export function TabFamilia({ det }: { det: LegajoDetalle }) {
  return (
    <div className="space-y-6">
      <Educacion det={det} />
      <GrupoFamiliar det={det} />
    </div>
  );
}

function Educacion({ det }: { det: LegajoDetalle }) {
  const e = det.empleado;
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    nivelEducativo: e.nivelEducativo ?? '',
    estadoEducativo: e.estadoEducativo ?? '',
    estadoCivil: e.estadoCivil ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Tarjeta
      titulo="Educación y estado civil"
      acciones={
        <button
          type="button"
          className={botonPrimario}
          disabled={pending}
          onClick={() => ejecutar(() => actualizarEducacionAction(e.id, f), 'Datos guardados.')}
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Campo label="Nivel educativo alcanzado">
          <Selector
            value={f.nivelEducativo}
            onChange={(v) => set('nivelEducativo', v)}
            opciones={NIVELES_EDUCATIVOS}
          />
        </Campo>
        <Campo label="Estado del nivel">
          <Selector
            value={f.estadoEducativo}
            onChange={(v) => set('estadoEducativo', v)}
            opciones={ESTADOS_EDUCATIVOS}
          />
        </Campo>
        <Campo label="Estado civil">
          <Selector
            value={f.estadoCivil}
            onChange={(v) => set('estadoCivil', v)}
            opciones={ESTADOS_CIVILES}
          />
        </Campo>
      </div>
    </Tarjeta>
  );
}

const FAMILIAR_VACIO = {
  parentesco: '',
  nombre: '',
  apellido: '',
  nroDocumento: '',
  fechaNacimiento: '',
  aCargo: true,
  asignacionFamiliar: false,
  extensionObraSocial: false,
  observaciones: '',
};

function GrupoFamiliar({ det }: { det: LegajoDetalle }) {
  const empleadoId = det.empleado.id;
  const { pending, ejecutar } = useAccion();
  /** null = formulario cerrado; '' = alta; un id = edición. */
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState(FAMILIAR_VACIO);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  function abrir(x?: Familiar) {
    setF(
      x
        ? {
            parentesco: x.parentesco,
            nombre: x.nombre,
            apellido: x.apellido,
            nroDocumento: x.nroDocumento ?? '',
            fechaNacimiento: x.fechaNacimiento ?? '',
            aCargo: x.aCargo,
            asignacionFamiliar: x.asignacionFamiliar,
            extensionObraSocial: x.extensionObraSocial,
            observaciones: x.observaciones ?? '',
          }
        : FAMILIAR_VACIO,
    );
    setEditando(x?.id ?? '');
  }

  const guardar = () =>
    ejecutar(
      () => guardarFamiliarAction(empleadoId, { ...f, id: editando || undefined }),
      editando ? 'Familiar actualizado.' : 'Familiar agregado.',
      () => setEditando(null),
    );

  return (
    <Tarjeta
      titulo="Grupo familiar a cargo"
      descripcion="Cónyuge, hijos y otros familiares, para asignaciones familiares y extensión de obra social."
      acciones={
        editando === null && (
          <button type="button" className={botonSecundario} onClick={() => abrir()}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Agregar familiar
            </span>
          </button>
        )
      }
    >
      {editando !== null && (
        <div className="mb-4 rounded-[10px] border border-gray-200 bg-gray-50/60 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Campo label="Parentesco" requerido>
              <Selector
                value={f.parentesco}
                onChange={(v) => set('parentesco', v)}
                opciones={PARENTESCOS}
              />
            </Campo>
            <Campo label="Nombres" requerido>
              <input
                className={inputCls}
                value={f.nombre}
                maxLength={80}
                onChange={(x) => set('nombre', x.target.value)}
              />
            </Campo>
            <Campo label="Apellidos" requerido>
              <input
                className={inputCls}
                value={f.apellido}
                maxLength={80}
                onChange={(x) => set('apellido', x.target.value)}
              />
            </Campo>
            <Campo label="Nº de documento">
              <input
                className={inputCls}
                value={f.nroDocumento}
                maxLength={30}
                onChange={(x) => set('nroDocumento', x.target.value)}
              />
            </Campo>
            <Campo label="Fecha de nacimiento">
              <input
                type="date"
                className={inputCls}
                value={f.fechaNacimiento}
                onChange={(x) => set('fechaNacimiento', x.target.value)}
              />
            </Campo>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <Casilla checked={f.aCargo} onChange={(v) => set('aCargo', v)} texto="Está a cargo" />
              <Casilla
                checked={f.asignacionFamiliar}
                onChange={(v) => set('asignacionFamiliar', v)}
                texto="Cobra asignación familiar"
              />
              <Casilla
                checked={f.extensionObraSocial}
                onChange={(v) => set('extensionObraSocial', v)}
                texto="Extensión de obra social"
              />
            </div>
            <Campo label="Observaciones" className="md:col-span-3">
              <textarea
                className={textareaCls}
                value={f.observaciones}
                maxLength={500}
                onChange={(x) => set('observaciones', x.target.value)}
              />
            </Campo>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={botonSecundario} onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="button" className={botonPrimario} disabled={pending} onClick={guardar}>
              {pending ? 'Guardando…' : 'Guardar familiar'}
            </button>
          </div>
        </div>
      )}

      {det.familiares.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay familiares cargados.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {det.familiares.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  {x.apellido}, {x.nombre}{' '}
                  <span className="font-normal text-gray-500">
                    · {labelDe(PARENTESCOS, x.parentesco)}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {[
                    x.nroDocumento && `Doc. ${x.nroDocumento}`,
                    x.fechaNacimiento && `Nac. ${fechaLegible(x.fechaNacimiento)}`,
                    x.aCargo && 'A cargo',
                    x.asignacionFamiliar && 'Asignación familiar',
                    x.extensionObraSocial && 'Extensión de obra social',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button
                type="button"
                aria-label="Editar"
                className="rounded-[8px] p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                onClick={() => abrir(x)}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Eliminar"
                disabled={pending}
                className="rounded-[8px] p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => {
                  if (window.confirm(`¿Quitar a ${x.nombre} ${x.apellido} del grupo familiar?`)) {
                    ejecutar(() => eliminarFamiliarAction(empleadoId, x.id), 'Familiar quitado.');
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function Casilla({
  checked,
  onChange,
  texto,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  texto: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm text-gray-700">{texto}</span>
    </label>
  );
}
