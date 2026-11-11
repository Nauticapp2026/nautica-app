'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

import { actualizarConfigMantenimientoAction } from '@/app/actions/bienes-uso';
import { eliminarPlanAction, guardarPlanAction } from '@/app/actions/bienes-uso-mantenimiento';
import {
  Campo,
  PersonasMulti,
  Selector,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  inputCls,
  useAccion,
} from '@/components/shared/form-ui';
import { FRECUENCIAS } from '@/lib/bienes-uso/constantes';
import type { BienDetalle } from '@/lib/bienes-uso/consultas';
import { diasHasta, estadoPlazo, proximaFecha } from '@/lib/bienes-uso/mantenimiento';
import type { CatalogosDisponibles } from '@/lib/catalogos-club';
import { fechaLegible } from '@/lib/documentacion-fechas';
import type { PersonaSelector } from '@/lib/legajo/consultas';
import { labelDe } from '@/lib/legajo/constantes';
import { esEmailValido } from '@/lib/legajo/validaciones';

import { Fallas, Insumos, Inspecciones, Intervenciones } from './mant-historial';

export function TabMantenimiento({
  det,
  catalogos,
  personal,
  proveedores,
  hoy,
}: {
  det: BienDetalle;
  catalogos: CatalogosDisponibles;
  personal: PersonaSelector[];
  proveedores: PersonaSelector[];
  hoy: string;
}) {
  return (
    <div className="space-y-6">
      <ConfigMantenimiento det={det} personal={personal} />
      <Planes det={det} hoy={hoy} />
      <Intervenciones det={det} catalogos={catalogos} proveedores={proveedores} />
      <Fallas det={det} catalogos={catalogos} />
      <Insumos det={det} catalogos={catalogos} hoy={hoy} />
      <Inspecciones det={det} catalogos={catalogos} />
    </div>
  );
}

// ─── Correos de aviso y responsables ────────────────────────────────────────

function ConfigMantenimiento({ det, personal }: { det: BienDetalle; personal: PersonaSelector[] }) {
  const b = det.bien;
  const { pending, ejecutar } = useAccion();
  const [emails, setEmails] = useState<string[]>(b.mantenimientoEmails);
  const [nuevo, setNuevo] = useState('');
  const [responsables, setResponsables] = useState<string[]>(det.responsables);

  const nuevoMal = nuevo.trim() !== '' && !esEmailValido(nuevo.trim());
  function agregar() {
    const e = nuevo.trim().toLowerCase();
    if (!e || nuevoMal || emails.includes(e)) return;
    setEmails([...emails, e]);
    setNuevo('');
  }

  return (
    <Tarjeta
      titulo="Avisos y responsables"
      descripcion="A estos correos llegan los avisos de los planes de mantenimiento preventivo: una vez cuando faltan 7 días o menos y otra el día del mantenimiento."
      acciones={
        <button
          type="button"
          className={botonPrimario}
          disabled={pending}
          onClick={() =>
            ejecutar(
              () => actualizarConfigMantenimientoAction(b.id, { emails, responsables }),
              'Avisos y responsables guardados.',
            )
          }
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo label="Correos electrónicos de mantenimiento" ayuda="Podés cargar hasta 10.">
          {emails.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {emails.map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center gap-1 rounded-full bg-[#D9EBE9] px-2.5 py-1 text-xs font-medium text-[#175861]"
                >
                  {e}
                  <button
                    type="button"
                    aria-label={`Quitar ${e}`}
                    className="rounded-full p-0.5 hover:bg-white/60"
                    onClick={() => setEmails(emails.filter((x) => x !== e))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="email"
              className={inputCls}
              value={nuevo}
              placeholder="mantenimiento@club.com"
              maxLength={120}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  agregar();
                }
              }}
            />
            <button
              type="button"
              className={botonSecundario}
              disabled={!nuevo.trim() || nuevoMal}
              onClick={agregar}
            >
              Agregar
            </button>
          </div>
          {nuevoMal && <p className="mt-1 text-xs text-red-600">El correo no es válido.</p>}
        </Campo>
        <Campo
          label="Responsables de mantenimiento"
          ayuda="Personal con legajo. Podés elegir más de uno."
        >
          <PersonasMulti
            value={responsables}
            onChange={setResponsables}
            personas={personal}
            vacio="Todavía no hay personal con legajo cargado."
          />
        </Campo>
      </div>
    </Tarjeta>
  );
}

// ─── Planes de mantenimiento preventivo ─────────────────────────────────────

type Plan = BienDetalle['planes'][number];

const PLAN_VACIO = {
  descripcion: '',
  frecuenciaTipo: 'meses',
  frecuenciaValor: '',
  proximaFecha: '',
  ultimaFecha: '',
  activo: true,
  notas: '',
};

function Planes({ det, hoy }: { det: BienDetalle; hoy: string }) {
  const bienId = det.bien.id;
  const { pending, ejecutar } = useAccion();
  /** null = formulario cerrado; '' = alta; un id = edición. */
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState(PLAN_VACIO);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function abrir(p?: Plan) {
    setF(
      p
        ? {
            descripcion: p.descripcion,
            frecuenciaTipo: p.frecuenciaTipo,
            frecuenciaValor: String(p.frecuenciaValor),
            proximaFecha: p.proximaFecha ?? '',
            ultimaFecha: p.ultimaFecha ?? '',
            activo: p.activo,
            notas: p.notas ?? '',
          }
        : PLAN_VACIO,
    );
    setEditando(p?.id ?? '');
  }

  const sugerida =
    f.ultimaFecha && !f.proximaFecha
      ? proximaFecha(f.ultimaFecha, f.frecuenciaTipo, Number(f.frecuenciaValor) || null)
      : null;

  return (
    <Tarjeta
      titulo="Plan de mantenimiento preventivo"
      descripcion="Revisiones periódicas, cada tantos días, meses u horas de uso, con la fecha en que toca la próxima."
      acciones={
        editando === null && (
          <button type="button" className={botonSecundario} onClick={() => abrir()}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Agregar plan
            </span>
          </button>
        )
      }
    >
      {editando !== null && (
        <div className="mb-4 rounded-[10px] border border-gray-200 bg-gray-50/60 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Campo label="Qué se revisa" requerido className="md:col-span-2">
              <input
                className={inputCls}
                value={f.descripcion}
                maxLength={200}
                placeholder="Ej: Cambio de aceite y filtros"
                onChange={(e) => set('descripcion', e.target.value)}
              />
            </Campo>
            <Campo label="Frecuencia: cada…" requerido>
              <input
                type="number"
                min={1}
                className={inputCls}
                value={f.frecuenciaValor}
                onChange={(e) => set('frecuenciaValor', e.target.value)}
              />
            </Campo>
            <Campo
              label="Unidad"
              requerido
              ayuda="Con horas de uso la próxima fecha se agenda a mano."
            >
              <Selector
                value={f.frecuenciaTipo}
                onChange={(v) => set('frecuenciaTipo', v)}
                opciones={FRECUENCIAS}
                placeholder="Elegí la unidad"
              />
            </Campo>
            <Campo label="Último mantenimiento">
              <input
                type="date"
                className={inputCls}
                value={f.ultimaFecha}
                onChange={(e) => set('ultimaFecha', e.target.value)}
              />
            </Campo>
            <Campo
              label="Próximo mantenimiento"
              ayuda={
                sugerida
                  ? `Si lo dejás vacío se agenda el ${fechaLegible(sugerida)}.`
                  : 'La fecha que se agenda para el aviso.'
              }
            >
              <input
                type="date"
                className={inputCls}
                value={f.proximaFecha}
                onChange={(e) => set('proximaFecha', e.target.value)}
              />
            </Campo>
            <Campo label="Notas" className="md:col-span-2">
              <input
                className={inputCls}
                value={f.notas}
                maxLength={500}
                onChange={(e) => set('notas', e.target.value)}
              />
            </Campo>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                checked={f.activo}
                onChange={(e) => set('activo', e.target.checked)}
              />
              <span className="text-sm text-gray-700">Plan activo (se avisa por mail)</span>
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={botonSecundario} onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className={botonPrimario}
              disabled={pending}
              onClick={() =>
                ejecutar(
                  () => guardarPlanAction(bienId, { ...f, id: editando || undefined }),
                  editando ? 'Plan actualizado.' : 'Plan agregado.',
                  () => setEditando(null),
                )
              }
            >
              {pending ? 'Guardando…' : 'Guardar plan'}
            </button>
          </div>
        </div>
      )}

      {det.planes.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay planes de mantenimiento cargados.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {det.planes.map((p) => {
            const plazo = p.activo ? estadoPlazo(p.proximaFecha, hoy) : 'sin_fecha';
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{p.descripcion}</p>
                    {!p.activo && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Inactivo
                      </span>
                    )}
                    {plazo === 'vencido' && p.proximaFecha && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        Vencido hace {Math.abs(diasHasta(p.proximaFecha, hoy))}{' '}
                        {Math.abs(diasHasta(p.proximaFecha, hoy)) === 1 ? 'día' : 'días'}
                      </span>
                    )}
                    {plazo === 'proximo' && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Próximo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Cada {p.frecuenciaValor} {labelDe(FRECUENCIAS, p.frecuenciaTipo).toLowerCase()}
                    {p.ultimaFecha && ` · Último: ${fechaLegible(p.ultimaFecha)}`}
                    {p.proximaFecha
                      ? ` · Próximo: ${fechaLegible(p.proximaFecha)}`
                      : ' · Sin fecha agendada'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Editar"
                  className="rounded-[8px] p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  onClick={() => abrir(p)}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Eliminar"
                  disabled={pending}
                  className="rounded-[8px] p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => {
                    if (window.confirm(`¿Eliminar el plan “${p.descripcion}”?`)) {
                      ejecutar(() => eliminarPlanAction(bienId, p.id), 'Plan eliminado.');
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}
