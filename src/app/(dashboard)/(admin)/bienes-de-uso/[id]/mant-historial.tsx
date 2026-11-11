'use client';

import { useRef, useState } from 'react';
import { Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';

import {
  eliminarFallaAction,
  eliminarInspeccionAction,
  eliminarInsumoAction,
  eliminarIntervencionAction,
  guardarFallaAction,
  guardarInspeccionAction,
  guardarInsumoAction,
  guardarIntervencionAction,
} from '@/app/actions/bienes-uso-mantenimiento';
import {
  Campo,
  CatalogoSelect,
  Selector,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  inputCls,
  textareaCls,
  useAccion,
} from '@/components/shared/form-ui';
import { FRECUENCIAS, RESULTADOS_INSPECCION } from '@/lib/bienes-uso/constantes';
import type { BienDetalle } from '@/lib/bienes-uso/consultas';
import { estadoPlazo, proximaFecha } from '@/lib/bienes-uso/mantenimiento';
import type { CatalogosDisponibles } from '@/lib/catalogos-club';
import { todayArg } from '@/lib/dates';
import { fechaLegible } from '@/lib/documentacion-fechas';
import type { PersonaSelector } from '@/lib/legajo/consultas';
import { labelDe } from '@/lib/legajo/constantes';
import { MONEDAS } from '@/lib/proveedores/constantes';

/** Botones editar / eliminar de una fila. */
function AccionesFila({
  onEditar,
  onEliminar,
  deshabilitado,
}: {
  onEditar: () => void;
  onEliminar: () => void;
  deshabilitado: boolean;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Editar"
        className="rounded-[8px] p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        onClick={onEditar}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Eliminar"
        disabled={deshabilitado}
        className="rounded-[8px] p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
        onClick={onEliminar}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );
}

function BotonAgregar({ texto, onClick }: { texto: string; onClick: () => void }) {
  return (
    <button type="button" className={botonSecundario} onClick={onClick}>
      <span className="inline-flex items-center gap-1.5">
        <Plus className="h-4 w-4" />
        {texto}
      </span>
    </button>
  );
}

/** Elegir un archivo y mostrar su nombre (o el ya guardado). */
function CampoArchivo({
  archivo,
  setArchivo,
  guardado,
  rotulo,
}: {
  archivo: File | null;
  setArchivo: (f: File | null) => void;
  guardado?: string | null;
  rotulo: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
      />
      <button type="button" className={botonSecundario} onClick={() => ref.current?.click()}>
        <span className="inline-flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" />
          {archivo ? archivo.name : guardado ? `Reemplazar ${rotulo}` : `Adjuntar ${rotulo}`}
        </span>
      </button>
      {!archivo && guardado && <span className="truncate text-xs text-gray-500">{guardado}</span>}
    </div>
  );
}

function BotonesFormulario({
  pending,
  editando,
  onCancelar,
  onGuardar,
  texto,
  deshabilitado,
}: {
  pending: boolean;
  editando: boolean;
  onCancelar: () => void;
  onGuardar: () => void;
  texto: string;
  deshabilitado?: boolean;
}) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button type="button" className={botonSecundario} onClick={onCancelar}>
        Cancelar
      </button>
      <button
        type="button"
        className={botonPrimario}
        disabled={pending || deshabilitado}
        onClick={onGuardar}
      >
        {pending ? 'Guardando…' : editando ? 'Guardar cambios' : texto}
      </button>
    </div>
  );
}

const dinero = (n: number, moneda: string) =>
  `${moneda === 'ARS' ? '$' : moneda} ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Intervenciones ─────────────────────────────────────────────────────────

type Intervencion = BienDetalle['intervenciones'][number];

const INTERV_VACIA = {
  fecha: '',
  tipo: '',
  descripcion: '',
  repuestos: '',
  proveedorId: '',
  costo: '',
  moneda: 'ARS',
  planId: '',
};

export function Intervenciones({
  det,
  catalogos,
  proveedores,
}: {
  det: BienDetalle;
  catalogos: CatalogosDisponibles;
  proveedores: PersonaSelector[];
}) {
  const bienId = det.bien.id;
  const { pending, ejecutar } = useAccion();
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState(INTERV_VACIA);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function abrir(i?: Intervencion) {
    setF(
      i
        ? {
            fecha: i.fecha,
            tipo: i.tipo ?? '',
            descripcion: i.descripcion ?? '',
            repuestos: i.repuestos ?? '',
            proveedorId: i.proveedorId ?? '',
            costo: i.costo === null ? '' : String(i.costo),
            moneda: i.moneda,
            planId: i.planId ?? '',
          }
        : { ...INTERV_VACIA, fecha: todayArg() },
    );
    setArchivo(null);
    setGuardado(i?.archivoNombre ?? null);
    setEditando(i?.id ?? '');
  }

  function guardar() {
    const fd = new FormData();
    fd.set('bienId', bienId);
    if (editando) fd.set('id', editando);
    for (const [k, v] of Object.entries(f)) fd.set(k, v);
    if (archivo) fd.set('file', archivo);
    ejecutar(
      () => guardarIntervencionAction(fd),
      editando ? 'Intervención actualizada.' : 'Intervención registrada.',
      () => setEditando(null),
    );
  }

  const planesActivos = det.planes.filter((p) => p.activo);
  const nombrePlan = (id: string | null) => det.planes.find((p) => p.id === id)?.descripcion;

  return (
    <Tarjeta
      titulo="Registro de intervenciones"
      descripcion="Reparaciones y mantenimientos que se le hicieron al bien: fecha, tipo, repuestos usados, quién la hizo y cuánto costó."
      acciones={
        editando === null && <BotonAgregar texto="Registrar intervención" onClick={() => abrir()} />
      }
    >
      {editando !== null && (
        <div className="mb-4 rounded-[10px] border border-gray-200 bg-gray-50/60 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Campo label="Fecha" requerido>
              <input
                type="date"
                className={inputCls}
                value={f.fecha}
                onChange={(e) => set('fecha', e.target.value)}
              />
            </Campo>
            <Campo label="Tipo de reparación o mantenimiento">
              <CatalogoSelect
                tipo="bu_tipo_intervencion"
                value={f.tipo}
                onChange={(v) => set('tipo', v)}
                opciones={catalogos.bu_tipo_intervencion}
              />
            </Campo>
            <Campo label="Realizada por" ayuda="Proveedor cargado en Proveedores.">
              <select
                className={inputCls}
                value={f.proveedorId}
                onChange={(e) => set('proveedorId', e.target.value)}
              >
                <option value="">Personal del club / sin dato</option>
                {proveedores.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Descripción de lo realizado" className="md:col-span-3">
              <textarea
                className={textareaCls}
                value={f.descripcion}
                maxLength={1000}
                onChange={(e) => set('descripcion', e.target.value)}
              />
            </Campo>
            <Campo label="Repuestos usados" className="md:col-span-3">
              <input
                className={inputCls}
                value={f.repuestos}
                maxLength={1000}
                onChange={(e) => set('repuestos', e.target.value)}
              />
            </Campo>
            <Campo label="Costo">
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                value={f.costo}
                onChange={(e) => set('costo', e.target.value)}
              />
            </Campo>
            <Campo label="Moneda">
              <Selector
                value={f.moneda}
                onChange={(v) => set('moneda', v)}
                opciones={MONEDAS}
                placeholder="Elegí la moneda"
              />
            </Campo>
            <Campo label="Cumple el plan preventivo" ayuda="Si lo elegís, se agenda el siguiente.">
              <select
                className={inputCls}
                value={f.planId}
                onChange={(e) => set('planId', e.target.value)}
              >
                <option value="">Ninguno</option>
                {planesActivos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.descripcion}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="md:col-span-3">
              <CampoArchivo
                archivo={archivo}
                setArchivo={setArchivo}
                guardado={guardado}
                rotulo="comprobante"
              />
            </div>
          </div>
          <BotonesFormulario
            pending={pending}
            editando={!!editando}
            onCancelar={() => setEditando(null)}
            onGuardar={guardar}
            texto="Registrar"
            deshabilitado={!f.fecha}
          />
        </div>
      )}

      {det.intervenciones.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay intervenciones registradas.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {det.intervenciones.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  {fechaLegible(i.fecha)}
                  {i.tipo && <span className="font-normal text-gray-600"> · {i.tipo}</span>}
                  {i.costo !== null && (
                    <span className="font-normal text-gray-600">
                      {' '}
                      · {dinero(i.costo, i.moneda)}
                    </span>
                  )}
                </p>
                {i.descripcion && <p className="text-sm text-gray-700">{i.descripcion}</p>}
                <p className="text-xs text-gray-500">
                  {[
                    i.repuestos && `Repuestos: ${i.repuestos}`,
                    i.proveedorNombre && `Hizo: ${i.proveedorNombre}`,
                    nombrePlan(i.planId) && `Plan: ${nombrePlan(i.planId)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {i.url && (
                <a
                  href={i.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#175861] hover:bg-gray-50"
                >
                  Ver comprobante
                </a>
              )}
              <AccionesFila
                deshabilitado={pending}
                onEditar={() => abrir(i)}
                onEliminar={() => {
                  if (window.confirm('¿Eliminar esta intervención y su comprobante?')) {
                    ejecutar(
                      () => eliminarIntervencionAction(bienId, i.id),
                      'Intervención eliminada.',
                    );
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

// ─── Fallas ─────────────────────────────────────────────────────────────────

type Falla = BienDetalle['fallas'][number];
const FALLA_VACIA = {
  fecha: '',
  tipo: '',
  descripcion: '',
  accionCorrectiva: '',
  fechaResolucion: '',
};

export function Fallas({ det, catalogos }: { det: BienDetalle; catalogos: CatalogosDisponibles }) {
  const bienId = det.bien.id;
  const { pending, ejecutar } = useAccion();
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState(FALLA_VACIA);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function abrir(x?: Falla) {
    setF(
      x
        ? {
            fecha: x.fecha,
            tipo: x.tipo ?? '',
            descripcion: x.descripcion ?? '',
            accionCorrectiva: x.accionCorrectiva ?? '',
            fechaResolucion: x.fechaResolucion ?? '',
          }
        : { ...FALLA_VACIA, fecha: todayArg() },
    );
    setEditando(x?.id ?? '');
  }

  return (
    <Tarjeta
      titulo="Historial de fallas"
      descripcion="Averías reportadas y acciones correctivas."
      acciones={
        editando === null && <BotonAgregar texto="Registrar falla" onClick={() => abrir()} />
      }
    >
      {editando !== null && (
        <div className="mb-4 rounded-[10px] border border-gray-200 bg-gray-50/60 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Campo label="Fecha de la falla" requerido>
              <input
                type="date"
                className={inputCls}
                value={f.fecha}
                onChange={(e) => set('fecha', e.target.value)}
              />
            </Campo>
            <Campo label="Tipo de falla">
              <CatalogoSelect
                tipo="bu_tipo_falla"
                value={f.tipo}
                onChange={(v) => set('tipo', v)}
                opciones={catalogos.bu_tipo_falla}
              />
            </Campo>
            <Campo label="Fecha de resolución" ayuda="Vacía = sigue abierta.">
              <input
                type="date"
                className={inputCls}
                value={f.fechaResolucion}
                onChange={(e) => set('fechaResolucion', e.target.value)}
              />
            </Campo>
            <Campo label="Avería" requerido className="md:col-span-3">
              <textarea
                className={textareaCls}
                value={f.descripcion}
                maxLength={1000}
                onChange={(e) => set('descripcion', e.target.value)}
              />
            </Campo>
            <Campo label="Acción correctiva" className="md:col-span-3">
              <textarea
                className={textareaCls}
                value={f.accionCorrectiva}
                maxLength={1000}
                onChange={(e) => set('accionCorrectiva', e.target.value)}
              />
            </Campo>
          </div>
          <BotonesFormulario
            pending={pending}
            editando={!!editando}
            onCancelar={() => setEditando(null)}
            onGuardar={() =>
              ejecutar(
                () => guardarFallaAction(bienId, { ...f, id: editando || undefined }),
                editando ? 'Falla actualizada.' : 'Falla registrada.',
                () => setEditando(null),
              )
            }
            texto="Registrar"
            deshabilitado={!f.fecha || !f.descripcion.trim()}
          />
        </div>
      )}

      {det.fallas.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay fallas registradas.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {det.fallas.map((x) => (
            <li key={x.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">
                    {fechaLegible(x.fecha)}
                    {x.tipo && <span className="font-normal text-gray-600"> · {x.tipo}</span>}
                  </p>
                  {x.fechaResolucion ? (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-[#175861]">
                      Resuelta el {fechaLegible(x.fechaResolucion)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Abierta
                    </span>
                  )}
                </div>
                {x.descripcion && <p className="text-sm text-gray-700">{x.descripcion}</p>}
                {x.accionCorrectiva && (
                  <p className="text-xs text-gray-500">Acción correctiva: {x.accionCorrectiva}</p>
                )}
              </div>
              <AccionesFila
                deshabilitado={pending}
                onEditar={() => abrir(x)}
                onEliminar={() => {
                  if (window.confirm('¿Eliminar este registro de falla?')) {
                    ejecutar(() => eliminarFallaAction(bienId, x.id), 'Falla eliminada.');
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

// ─── Insumos ────────────────────────────────────────────────────────────────

type Insumo = BienDetalle['insumos'][number];
const INSUMO_VACIO = {
  tipo: '',
  descripcion: '',
  ultimoCambio: '',
  frecuenciaValor: '',
  frecuenciaTipo: '',
  notas: '',
};

export function Insumos({
  det,
  catalogos,
  hoy,
}: {
  det: BienDetalle;
  catalogos: CatalogosDisponibles;
  hoy: string;
}) {
  const bienId = det.bien.id;
  const { pending, ejecutar } = useAccion();
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState(INSUMO_VACIO);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function abrir(x?: Insumo) {
    setF(
      x
        ? {
            tipo: x.tipo,
            descripcion: x.descripcion ?? '',
            ultimoCambio: x.ultimoCambio ?? '',
            frecuenciaValor: x.frecuenciaValor ? String(x.frecuenciaValor) : '',
            frecuenciaTipo: x.frecuenciaTipo ?? '',
            notas: x.notas ?? '',
          }
        : INSUMO_VACIO,
    );
    setEditando(x?.id ?? '');
  }

  return (
    <Tarjeta
      titulo="Insumos y cambios periódicos"
      descripcion="Control de aceites, filtros, neumáticos y demás insumos, con cada cuánto se cambian."
      acciones={
        editando === null && <BotonAgregar texto="Agregar insumo" onClick={() => abrir()} />
      }
    >
      {editando !== null && (
        <div className="mb-4 rounded-[10px] border border-gray-200 bg-gray-50/60 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Campo label="Tipo de insumo" requerido>
              <CatalogoSelect
                tipo="bu_tipo_insumo"
                value={f.tipo}
                onChange={(v) => set('tipo', v)}
                opciones={catalogos.bu_tipo_insumo}
              />
            </Campo>
            <Campo label="Descripción" className="md:col-span-2">
              <input
                className={inputCls}
                value={f.descripcion}
                maxLength={300}
                placeholder="Marca, medida, especificación…"
                onChange={(e) => set('descripcion', e.target.value)}
              />
            </Campo>
            <Campo label="Último cambio">
              <input
                type="date"
                className={inputCls}
                value={f.ultimoCambio}
                onChange={(e) => set('ultimoCambio', e.target.value)}
              />
            </Campo>
            <Campo label="Se cambia cada…">
              <input
                type="number"
                min={1}
                className={inputCls}
                value={f.frecuenciaValor}
                onChange={(e) => set('frecuenciaValor', e.target.value)}
              />
            </Campo>
            <Campo label="Unidad">
              <Selector
                value={f.frecuenciaTipo}
                onChange={(v) => set('frecuenciaTipo', v)}
                opciones={FRECUENCIAS}
              />
            </Campo>
            <Campo label="Notas" className="md:col-span-3">
              <input
                className={inputCls}
                value={f.notas}
                maxLength={500}
                onChange={(e) => set('notas', e.target.value)}
              />
            </Campo>
          </div>
          <BotonesFormulario
            pending={pending}
            editando={!!editando}
            onCancelar={() => setEditando(null)}
            onGuardar={() =>
              ejecutar(
                () => guardarInsumoAction(bienId, { ...f, id: editando || undefined }),
                editando ? 'Insumo actualizado.' : 'Insumo agregado.',
                () => setEditando(null),
              )
            }
            texto="Agregar"
            deshabilitado={!f.tipo.trim()}
          />
        </div>
      )}

      {det.insumos.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay insumos cargados.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {det.insumos.map((x) => {
            const proximo = x.ultimoCambio
              ? proximaFecha(x.ultimoCambio, x.frecuenciaTipo, x.frecuenciaValor)
              : null;
            const plazo = estadoPlazo(proximo, hoy);
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {x.tipo}
                      {x.descripcion && (
                        <span className="font-normal text-gray-600"> · {x.descripcion}</span>
                      )}
                    </p>
                    {plazo === 'vencido' && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        Cambio vencido
                      </span>
                    )}
                    {plazo === 'proximo' && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Cambio próximo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {[
                      x.ultimoCambio && `Último cambio: ${fechaLegible(x.ultimoCambio)}`,
                      x.frecuenciaValor &&
                        x.frecuenciaTipo &&
                        `Cada ${x.frecuenciaValor} ${labelDe(FRECUENCIAS, x.frecuenciaTipo).toLowerCase()}`,
                      proximo && `Próximo: ${fechaLegible(proximo)}`,
                      x.notas,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <AccionesFila
                  deshabilitado={pending}
                  onEditar={() => abrir(x)}
                  onEliminar={() => {
                    if (window.confirm(`¿Eliminar el insumo “${x.tipo}”?`)) {
                      ejecutar(() => eliminarInsumoAction(bienId, x.id), 'Insumo eliminado.');
                    }
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}

// ─── Inspecciones ───────────────────────────────────────────────────────────

type Inspeccion = BienDetalle['inspecciones'][number];
const INSPEC_VACIA = { fecha: '', tipo: '', resultado: 'ok', inspector: '', observaciones: '' };

export function Inspecciones({
  det,
  catalogos,
}: {
  det: BienDetalle;
  catalogos: CatalogosDisponibles;
}) {
  const bienId = det.bien.id;
  const { pending, ejecutar } = useAccion();
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState(INSPEC_VACIA);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function abrir(x?: Inspeccion) {
    setF(
      x
        ? {
            fecha: x.fecha,
            tipo: x.tipo ?? '',
            resultado: x.resultado,
            inspector: x.inspector ?? '',
            observaciones: x.observaciones ?? '',
          }
        : { ...INSPEC_VACIA, fecha: todayArg() },
    );
    setArchivo(null);
    setGuardado(x?.archivoNombre ?? null);
    setEditando(x?.id ?? '');
  }

  function guardar() {
    const fd = new FormData();
    fd.set('bienId', bienId);
    if (editando) fd.set('id', editando);
    for (const [k, v] of Object.entries(f)) fd.set(k, v);
    if (archivo) fd.set('file', archivo);
    ejecutar(
      () => guardarInspeccionAction(fd),
      editando ? 'Inspección actualizada.' : 'Inspección registrada.',
      () => setEditando(null),
    );
  }

  return (
    <Tarjeta
      titulo="Registro de inspecciones"
      descripcion="Checklists diarios de los operadores, pruebas de seguridad y de emisiones, con su comprobante."
      acciones={
        editando === null && <BotonAgregar texto="Registrar inspección" onClick={() => abrir()} />
      }
    >
      {editando !== null && (
        <div className="mb-4 rounded-[10px] border border-gray-200 bg-gray-50/60 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Campo label="Fecha" requerido>
              <input
                type="date"
                className={inputCls}
                value={f.fecha}
                onChange={(e) => set('fecha', e.target.value)}
              />
            </Campo>
            <Campo label="Tipo de inspección">
              <CatalogoSelect
                tipo="bu_tipo_inspeccion"
                value={f.tipo}
                onChange={(v) => set('tipo', v)}
                opciones={catalogos.bu_tipo_inspeccion}
              />
            </Campo>
            <Campo label="Resultado" requerido>
              <Selector
                value={f.resultado}
                onChange={(v) => set('resultado', v)}
                opciones={RESULTADOS_INSPECCION}
                placeholder="Elegí el resultado"
              />
            </Campo>
            <Campo label="Inspector / operador">
              <input
                className={inputCls}
                value={f.inspector}
                maxLength={120}
                onChange={(e) => set('inspector', e.target.value)}
              />
            </Campo>
            <Campo label="Observaciones" className="md:col-span-3">
              <textarea
                className={textareaCls}
                value={f.observaciones}
                maxLength={2000}
                onChange={(e) => set('observaciones', e.target.value)}
              />
            </Campo>
            <div className="md:col-span-3">
              <CampoArchivo
                archivo={archivo}
                setArchivo={setArchivo}
                guardado={guardado}
                rotulo="comprobante"
              />
            </div>
          </div>
          <BotonesFormulario
            pending={pending}
            editando={!!editando}
            onCancelar={() => setEditando(null)}
            onGuardar={guardar}
            texto="Registrar"
            deshabilitado={!f.fecha}
          />
        </div>
      )}

      {det.inspecciones.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay inspecciones registradas.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {det.inspecciones.map((x) => {
            const res = RESULTADOS_INSPECCION.find((r) => r.value === x.resultado);
            return (
              <li key={x.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {fechaLegible(x.fecha)}
                      {x.tipo && <span className="font-normal text-gray-600"> · {x.tipo}</span>}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${res?.clase ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {res?.label ?? x.resultado}
                    </span>
                  </div>
                  {x.observaciones && <p className="text-sm text-gray-700">{x.observaciones}</p>}
                  {x.inspector && <p className="text-xs text-gray-500">Inspector: {x.inspector}</p>}
                </div>
                {x.url && (
                  <a
                    href={x.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#175861] hover:bg-gray-50"
                  >
                    Ver comprobante
                  </a>
                )}
                <AccionesFila
                  deshabilitado={pending}
                  onEditar={() => abrir(x)}
                  onEliminar={() => {
                    if (window.confirm('¿Eliminar esta inspección y su comprobante?')) {
                      ejecutar(
                        () => eliminarInspeccionAction(bienId, x.id),
                        'Inspección eliminada.',
                      );
                    }
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}
