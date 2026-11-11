'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

import { actualizarLaboralAction } from '@/app/actions/legajo';
import { guardarHorariosAction } from '@/app/actions/legajo-horas';
import { FUERA_DE_CONVENIO, type CatalogosDisponibles } from '@/lib/catalogos-club';
import { DIAS_SEMANA, ESTADOS_EMPLEADO, TIPOS_HORA } from '@/lib/legajo/constantes';
import type { LegajoDetalle, PersonaSelector } from '@/lib/legajo/consultas';
import { calcularHoras, formatearHoras } from '@/lib/legajo/validaciones';

import { AdjuntoInline } from './documentos-ui';
import {
  Campo,
  CatalogoMulti,
  CatalogoSelect,
  PersonasMulti,
  Selector,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  inputCls,
  textareaCls,
  useAccion,
} from '@/components/shared/form-ui';

export function TabLaboral({
  det,
  catalogos,
  personal,
}: {
  det: LegajoDetalle;
  catalogos: CatalogosDisponibles;
  personal: PersonaSelector[];
}) {
  const e = det.empleado;
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    fechaIngreso: e.fechaIngreso,
    fechaIngresoArca: e.fechaIngresoArca ?? '',
    tipoContratacion: e.tipoContratacion ?? '',
    puesto: e.puesto ?? '',
    tareas: e.tareas ?? '',
    area: e.area ?? '',
    reportaA: det.reportaA,
    sedes: e.sedes,
    ubicaciones: e.ubicaciones,
    bienesUso: e.bienesUso,
    convenio: e.convenio ?? '',
    categoria: e.categoria ?? '',
    estado: e.estado,
    fechaEgreso: e.fechaEgreso ?? '',
    motivoEgreso: e.motivoEgreso ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const jefesPosibles = personal.filter((p) => p.value !== e.id);
  const conConvenio = f.convenio !== '' && f.convenio !== FUERA_DE_CONVENIO;

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Información laboral y contratación"
        descripcion="La fecha de ingreso bloquea cargar novedades anteriores a esa fecha."
        acciones={
          <button
            type="button"
            className={botonPrimario}
            disabled={pending}
            onClick={() =>
              ejecutar(() => actualizarLaboralAction(e.id, f), 'Información laboral guardada.')
            }
          >
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Campo label="Fecha de ingreso" requerido ayuda="Inicio formal de la relación laboral.">
            <input
              type="date"
              className={inputCls}
              value={f.fechaIngreso}
              onChange={(x) => set('fechaIngreso', x.target.value)}
            />
          </Campo>
          <Campo
            label="Fecha de ingreso en ARCA"
            ayuda="Alta temprana. Podés adjuntar la constancia."
          >
            <input
              type="date"
              className={inputCls}
              value={f.fechaIngresoArca}
              onChange={(x) => set('fechaIngresoArca', x.target.value)}
            />
          </Campo>
          <div className="md:col-span-2">
            <AdjuntoInline empleadoId={e.id} tipo="alta_arca" doc={det.documentos['alta_arca']} />
          </div>

          <Campo label="Tipo de contratación">
            <CatalogoSelect
              tipo="tipo_contratacion"
              value={f.tipoContratacion}
              onChange={(v) => set('tipoContratacion', v)}
              opciones={catalogos.tipo_contratacion}
            />
          </Campo>
          <Campo label="Puesto o cargo" ayuda="Rol o función dentro del club.">
            <CatalogoSelect
              tipo="puesto"
              value={f.puesto}
              onChange={(v) => set('puesto', v)}
              opciones={catalogos.puesto}
            />
          </Campo>
          <Campo
            label="Tareas a cargo"
            ayuda="Detalle de las tareas que realiza."
            className="md:col-span-2"
          >
            <textarea
              className={textareaCls}
              value={f.tareas}
              maxLength={2000}
              onChange={(x) => set('tareas', x.target.value)}
            />
          </Campo>
          <Campo label="Área o departamento">
            <CatalogoSelect
              tipo="area"
              value={f.area}
              onChange={(v) => set('area', v)}
              opciones={catalogos.area}
            />
          </Campo>
          <Campo label="Posición a reportar" ayuda="Una o varias personas a quienes reporta.">
            <PersonasMulti
              value={f.reportaA}
              onChange={(v) => set('reportaA', v)}
              personas={jefesPosibles}
              vacio="Todavía no hay otro personal cargado."
            />
          </Campo>
          <Campo label="Sucursal o sede" ayuda="Dónde presta servicios. Podés elegir más de una.">
            <CatalogoMulti
              tipo="sede"
              value={f.sedes}
              onChange={(v) => set('sedes', v)}
              opciones={catalogos.sede}
              placeholder="Elegí una sede"
            />
          </Campo>
          <Campo
            label="Ubicación específica"
            ayuda="Dónde desarrolla sus tareas (las áreas de Espacios figuran acá)."
          >
            <CatalogoMulti
              tipo="ubicacion"
              value={f.ubicaciones}
              onChange={(v) => set('ubicaciones', v)}
              opciones={catalogos.ubicacion}
              placeholder="Elegí una ubicación"
            />
          </Campo>
          <Campo
            label="Bienes de uso asignados"
            ayuda="Lo que se le asigna para su trabajo."
            className="md:col-span-2"
          >
            <CatalogoMulti
              tipo="bien_uso"
              value={f.bienesUso}
              onChange={(v) => set('bienesUso', v)}
              opciones={catalogos.bien_uso}
              placeholder="Elegí un bien"
            />
          </Campo>
          <Campo
            label="Convenio colectivo"
            ayuda="CCT aplicable. Opcional si es personal fuera de convenio."
          >
            <CatalogoSelect
              tipo="convenio"
              value={f.convenio}
              onChange={(v) => set('convenio', v)}
              opciones={catalogos.convenio}
            />
          </Campo>
          <Campo
            label="Categoría laboral"
            ayuda={
              conConvenio
                ? 'Nivel o categoría del convenio, para el cálculo del básico. Obligatoria con convenio.'
                : 'Nivel o categoría del convenio.'
            }
          >
            <CatalogoSelect
              tipo="categoria"
              value={f.categoria}
              onChange={(v) => set('categoria', v)}
              opciones={catalogos.categoria}
            />
          </Campo>
          <Campo
            label="Estado del empleado"
            requerido
            ayuda="Determina la liquidación. No cambia el acceso al sistema."
          >
            <Selector
              value={f.estado}
              onChange={(v) => set('estado', v)}
              opciones={ESTADOS_EMPLEADO}
              placeholder="Elegí el estado"
            />
          </Campo>
          {f.estado === 'baja' && (
            <>
              <Campo label="Fecha de egreso" requerido>
                <input
                  type="date"
                  className={inputCls}
                  value={f.fechaEgreso}
                  onChange={(x) => set('fechaEgreso', x.target.value)}
                />
              </Campo>
              <Campo label="Motivo del egreso" className="md:col-span-2">
                <input
                  className={inputCls}
                  value={f.motivoEgreso}
                  maxLength={500}
                  onChange={(x) => set('motivoEgreso', x.target.value)}
                />
              </Campo>
            </>
          )}
        </div>
      </Tarjeta>

      <HorarioEditor empleadoId={e.id} inicial={det.horarios} />
    </div>
  );
}

// ─── Horario laboral previsto ───────────────────────────────────────────────

type Tramo = { dia: number; desde: string; hasta: string; tipoHora: string };

const TRAMO_POR_DEFECTO = { desde: '09:00', hasta: '17:00', tipoHora: 'normal' };

/**
 * Días de la semana que trabaja, con el horario de cada día y si las horas son normales,
 * extras, adicionales, etc. Un día puede tener más de un tramo (turno cortado).
 */
function HorarioEditor({
  empleadoId,
  inicial,
}: {
  empleadoId: string;
  inicial: LegajoDetalle['horarios'];
}) {
  const { pending, ejecutar } = useAccion();
  const [tramos, setTramos] = useState<Tramo[]>(inicial);

  const deDia = (dia: number) => tramos.filter((t) => t.dia === dia);
  const horasTotales = tramos.reduce((acc, t) => acc + calcularHoras(t.desde, t.hasta), 0);

  function cambiar(dia: number, indiceEnDia: number, parche: Partial<Tramo>) {
    let n = -1;
    setTramos((prev) =>
      prev.map((t) => {
        if (t.dia !== dia) return t;
        n++;
        return n === indiceEnDia ? { ...t, ...parche } : t;
      }),
    );
  }
  function quitar(dia: number, indiceEnDia: number) {
    let n = -1;
    setTramos((prev) =>
      prev.filter((t) => {
        if (t.dia !== dia) return true;
        n++;
        return n !== indiceEnDia;
      }),
    );
  }
  const agregar = (dia: number) => setTramos((prev) => [...prev, { dia, ...TRAMO_POR_DEFECTO }]);
  const alternarDia = (dia: number, trabaja: boolean) =>
    setTramos((prev) =>
      trabaja ? [...prev, { dia, ...TRAMO_POR_DEFECTO }] : prev.filter((t) => t.dia !== dia),
    );

  function copiarLunesALaboralesDeSemana() {
    const lunes = tramos.filter((t) => t.dia === 1);
    if (lunes.length === 0) return;
    setTramos((prev) => [
      ...prev.filter((t) => t.dia === 1 || t.dia > 5),
      ...[2, 3, 4, 5].flatMap((dia) => lunes.map((t) => ({ ...t, dia }))),
    ]);
  }

  const guardar = () =>
    ejecutar(
      () =>
        guardarHorariosAction(
          empleadoId,
          tramos.map((t) => ({ ...t, desde: t.desde, hasta: t.hasta })),
        ),
      'Horario laboral guardado.',
    );

  return (
    <Tarjeta
      titulo="Horario laboral"
      descripcion="Días y horarios previstos. Un tramo que termina a la hora en que empezó o antes cruza la medianoche (22:00 a 06:00 son 8 horas)."
      acciones={
        <button type="button" className={botonPrimario} disabled={pending} onClick={guardar}>
          {pending ? 'Guardando…' : 'Guardar horario'}
        </button>
      }
    >
      <div className="space-y-2">
        {DIAS_SEMANA.map((d) => {
          const dia = Number(d.value);
          const lista = deDia(dia);
          return (
            <div key={d.value} className="rounded-[10px] border border-gray-200 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex w-32 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                    checked={lista.length > 0}
                    onChange={(x) => alternarDia(dia, x.target.checked)}
                  />
                  <span className="text-sm font-medium text-gray-800">{d.label}</span>
                </label>
                {lista.length === 0 && <span className="text-xs text-gray-400">No trabaja</span>}
              </div>
              {lista.length > 0 && (
                <div className="mt-2 space-y-2 pl-0 sm:pl-[8.75rem]">
                  {lista.map((t, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        className={`${inputCls} !h-9 !w-28`}
                        value={t.desde}
                        onChange={(x) => cambiar(dia, i, { desde: x.target.value })}
                      />
                      <span className="text-xs text-gray-400">a</span>
                      <input
                        type="time"
                        className={`${inputCls} !h-9 !w-28`}
                        value={t.hasta}
                        onChange={(x) => cambiar(dia, i, { hasta: x.target.value })}
                      />
                      <select
                        className={`${inputCls} !h-9 !w-44`}
                        value={t.tipoHora}
                        onChange={(x) => cambiar(dia, i, { tipoHora: x.target.value })}
                      >
                        {TIPOS_HORA.map((th) => (
                          <option key={th.value} value={th.value}>
                            {th.label}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-gray-500">
                        {formatearHoras(calcularHoras(t.desde, t.hasta))}
                      </span>
                      <button
                        type="button"
                        aria-label="Quitar tramo"
                        onClick={() => quitar(dia, i)}
                        className="rounded-[8px] p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => agregar(dia)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#175861] hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar otro tramo
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className={botonSecundario}
          onClick={copiarLunesALaboralesDeSemana}
          disabled={deDia(1).length === 0}
        >
          Copiar el lunes a martes–viernes
        </button>
        <p className="text-sm text-gray-600">
          Total semanal previsto:{' '}
          <span className="font-semibold">{formatearHoras(horasTotales)}</span>
        </p>
      </div>
    </Tarjeta>
  );
}
