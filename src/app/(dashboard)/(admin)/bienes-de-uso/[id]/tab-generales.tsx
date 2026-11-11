'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Paperclip, Plus, Trash2 } from 'lucide-react';

import {
  actualizarGeneralesAction,
  darDeBajaBienAction,
  eliminarBienAction,
  guardarHorarioBienAction,
  quitarComprobanteSeguroAction,
  reactivarBienAction,
  subirComprobanteSeguroAction,
} from '@/app/actions/bienes-uso';
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
import {
  DIAS_SEMANA,
  ESTADOS_BIEN,
  FORMAS_ADQUISICION,
  VIDAS_UTILES,
} from '@/lib/bienes-uso/constantes';
import type { BienDetalle } from '@/lib/bienes-uso/consultas';
import type { CatalogosDisponibles } from '@/lib/catalogos-club';
import { fechaLegible } from '@/lib/documentacion-fechas';
import type { PersonaSelector } from '@/lib/legajo/consultas';
import { calcularHoras, formatearHoras } from '@/lib/legajo/validaciones';

export function TabGenerales({
  det,
  catalogos,
  personal,
  hoy,
}: {
  det: BienDetalle;
  catalogos: CatalogosDisponibles;
  personal: PersonaSelector[];
  hoy: string;
}) {
  return (
    <div className="space-y-6">
      <DatosGenerales det={det} catalogos={catalogos} personal={personal} />
      <HorarioUtilizacion det={det} />
      <BajaYEliminacion det={det} catalogos={catalogos} hoy={hoy} />
    </div>
  );
}

// ─── Datos generales, ubicación, seguro ─────────────────────────────────────

function DatosGenerales({
  det,
  catalogos,
  personal,
}: {
  det: BienDetalle;
  catalogos: CatalogosDisponibles;
  personal: PersonaSelector[];
}) {
  const b = det.bien;
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    fechaIncorporacion: b.fechaIncorporacion,
    estado: b.estado,
    estadoDetalle: b.estadoDetalle ?? '',
    formaAdquisicion: b.formaAdquisicion ?? '',
    vidaUtilAnios: b.vidaUtilAnios ? String(b.vidaUtilAnios) : '',
    tipoBien: b.tipoBien ?? '',
    rubro: b.rubro ?? '',
    subrubro: b.subrubro ?? '',
    nroGuarderia: b.nroGuarderia ?? '',
    nombre: b.nombre,
    marca: b.marca ?? '',
    nroSerie: b.nroSerie ?? '',
    anioFabricacion: b.anioFabricacion ? String(b.anioFabricacion) : '',
    patente: b.patente ?? '',
    ubicaciones: b.ubicaciones,
    lugaresUtilizacion: b.lugaresUtilizacion,
    autorizados: det.autorizados,
    seguroAseguradora: b.seguroAseguradora ?? '',
    seguroPoliza: b.seguroPoliza ?? '',
    seguroVencimiento: b.seguroVencimiento ?? '',
    seguroDetalle: b.seguroDetalle ?? '',
    notas: b.notas ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const dadoDeBaja = !!b.fechaBaja;

  const guardar = () =>
    ejecutar(() => actualizarGeneralesAction(b.id, f), 'Datos del bien guardados.');
  const botonGuardar = (
    <button type="button" className={botonPrimario} disabled={pending} onClick={guardar}>
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  );

  return (
    <>
      <Tarjeta titulo="Identificación del bien" acciones={botonGuardar}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Campo label="Nº de ID" ayuda="Lo asigna el sistema.">
            <input className={`${inputCls} bg-gray-50`} value={b.numero} readOnly />
          </Campo>
          <Campo label="Fecha de incorporación" requerido>
            <input
              type="date"
              className={inputCls}
              value={f.fechaIncorporacion}
              onChange={(e) => set('fechaIncorporacion', e.target.value)}
            />
          </Campo>
          <Campo
            label="Estado"
            requerido
            ayuda={dadoDeBaja ? 'Dado de baja: para cambiarlo, reactivalo abajo.' : undefined}
          >
            <Selector
              value={f.estado}
              onChange={(v) => set('estado', v)}
              opciones={ESTADOS_BIEN}
              disabled={dadoDeBaja}
              placeholder="Elegí el estado"
            />
          </Campo>
          {f.estado === 'otro' && (
            <Campo label="Detalle del estado" className="md:col-span-3">
              <input
                className={inputCls}
                value={f.estadoDetalle}
                maxLength={120}
                onChange={(e) => set('estadoDetalle', e.target.value)}
              />
            </Campo>
          )}
          <Campo label="Nombre o descripción" requerido className="md:col-span-3">
            <input
              className={inputCls}
              value={f.nombre}
              maxLength={150}
              onChange={(e) => set('nombre', e.target.value)}
            />
          </Campo>
          <Campo label="Tipo de bien">
            <CatalogoSelect
              tipo="bu_tipo"
              value={f.tipoBien}
              onChange={(v) => set('tipoBien', v)}
              opciones={catalogos.bu_tipo}
            />
          </Campo>
          <Campo label="Rubro">
            <CatalogoSelect
              tipo="bu_rubro"
              value={f.rubro}
              onChange={(v) => set('rubro', v)}
              opciones={catalogos.bu_rubro}
            />
          </Campo>
          <Campo label="Subrubro">
            <CatalogoSelect
              tipo="bu_subrubro"
              value={f.subrubro}
              onChange={(v) => set('subrubro', v)}
              opciones={catalogos.bu_subrubro}
            />
          </Campo>
          <Campo label="Forma de adquisición">
            <Selector
              value={f.formaAdquisicion}
              onChange={(v) => set('formaAdquisicion', v)}
              opciones={FORMAS_ADQUISICION}
            />
          </Campo>
          <Campo
            label="Vida útil"
            ayuda="Base del cálculo de amortización (solapa Datos contables)."
          >
            <Selector
              value={f.vidaUtilAnios}
              onChange={(v) => set('vidaUtilAnios', v)}
              opciones={VIDAS_UTILES}
            />
          </Campo>
          <Campo label="Nº de guardería">
            <input
              className={inputCls}
              value={f.nroGuarderia}
              maxLength={30}
              onChange={(e) => set('nroGuarderia', e.target.value)}
            />
          </Campo>
          <Campo label="Marca">
            <CatalogoSelect
              tipo="bu_marca"
              value={f.marca}
              onChange={(v) => set('marca', v)}
              opciones={catalogos.bu_marca}
            />
          </Campo>
          <Campo label="Número de serie" ayuda="Código único de fábrica.">
            <input
              className={inputCls}
              value={f.nroSerie}
              maxLength={80}
              onChange={(e) => set('nroSerie', e.target.value)}
            />
          </Campo>
          <Campo label="Año de fabricación">
            <input
              type="number"
              min={1900}
              max={2100}
              className={inputCls}
              value={f.anioFabricacion}
              onChange={(e) => set('anioFabricacion', e.target.value)}
            />
          </Campo>
          <Campo label="Patente">
            <input
              className={inputCls}
              value={f.patente}
              maxLength={20}
              onChange={(e) => set('patente', e.target.value.toUpperCase())}
            />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Ubicación y utilización"
        descripcion="Dónde está y quién puede usarlo."
        acciones={botonGuardar}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Campo
            label="Ubicación actual"
            ayuda="Sector, obra o planta donde opera. Las áreas de Espacios figuran acá."
          >
            <CatalogoMulti
              tipo="bu_ubicacion"
              value={f.ubicaciones}
              onChange={(v) => set('ubicaciones', v)}
              opciones={catalogos.bu_ubicacion}
              placeholder="Elegí una ubicación"
            />
          </Campo>
          <Campo label="Lugar de utilización">
            <CatalogoMulti
              tipo="bu_lugar"
              value={f.lugaresUtilizacion}
              onChange={(v) => set('lugaresUtilizacion', v)}
              opciones={catalogos.bu_lugar}
              placeholder="Elegí un lugar"
            />
          </Campo>
          <Campo
            label="Empleados autorizados a utilizarlo"
            ayuda="Personal con legajo. Podés elegir más de uno."
            className="md:col-span-2"
          >
            <PersonasMulti
              value={f.autorizados}
              onChange={(v) => set('autorizados', v)}
              personas={personal}
              vacio="Todavía no hay personal con legajo cargado."
            />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Seguro" acciones={botonGuardar}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Campo label="Aseguradora">
            <CatalogoSelect
              tipo="bu_aseguradora"
              value={f.seguroAseguradora}
              onChange={(v) => set('seguroAseguradora', v)}
              opciones={catalogos.bu_aseguradora}
            />
          </Campo>
          <Campo label="Nº de póliza">
            <input
              className={inputCls}
              value={f.seguroPoliza}
              maxLength={60}
              onChange={(e) => set('seguroPoliza', e.target.value)}
            />
          </Campo>
          <Campo label="Vencimiento de la póliza">
            <input
              type="date"
              className={inputCls}
              value={f.seguroVencimiento}
              onChange={(e) => set('seguroVencimiento', e.target.value)}
            />
          </Campo>
          <Campo label="Detalle de la cobertura">
            <input
              className={inputCls}
              value={f.seguroDetalle}
              maxLength={300}
              onChange={(e) => set('seguroDetalle', e.target.value)}
            />
          </Campo>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-gray-700">Comprobante del seguro</p>
          <AdjuntoSeguro bien={b} />
        </div>
        <div className="mt-4">
          <Campo label="Notas">
            <textarea
              className={textareaCls}
              value={f.notas}
              maxLength={2000}
              onChange={(e) => set('notas', e.target.value)}
            />
          </Campo>
        </div>
      </Tarjeta>
    </>
  );
}

function AdjuntoSeguro({ bien }: { bien: BienDetalle['bien'] }) {
  const ref = useRef<HTMLInputElement>(null);
  const { pending, ejecutar } = useAccion();

  function elegido(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set('bienId', bien.id);
    fd.set('file', file);
    ejecutar(() => subirComprobanteSeguroAction(fd), 'Comprobante guardado.');
    if (ref.current) ref.current.value = '';
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-gray-300 bg-gray-50/60 px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-[#669E9D]" />
      <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
        {bien.seguroArchivoNombre ?? 'Póliza o comprobante de pago'}
        {!bien.seguroArchivoNombre && (
          <span className="ml-1 text-xs text-gray-400">(sin archivo)</span>
        )}
      </span>
      {bien.seguroUrl && (
        <a
          href={bien.seguroUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#175861] hover:bg-gray-50"
        >
          Ver
        </a>
      )}
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => elegido(e.target.files?.[0])}
      />
      <button
        type="button"
        className={botonSecundario}
        disabled={pending}
        onClick={() => ref.current?.click()}
      >
        <span className="inline-flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" />
          {pending ? 'Subiendo…' : bien.seguroUrl ? 'Reemplazar' : 'Adjuntar'}
        </span>
      </button>
      {bien.seguroUrl && (
        <button
          type="button"
          disabled={pending}
          aria-label="Quitar el archivo"
          title="Quitar el archivo"
          className="rounded-[8px] p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          onClick={() => {
            if (window.confirm('¿Quitar el comprobante adjunto?')) {
              ejecutar(() => quitarComprobanteSeguroAction(bien.id), 'Comprobante quitado.');
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── Horario de utilización ─────────────────────────────────────────────────

type Tramo = { dia: number; desde: string; hasta: string };
const TRAMO_POR_DEFECTO = { desde: '08:00', hasta: '17:00' };

function HorarioUtilizacion({ det }: { det: BienDetalle }) {
  const { pending, ejecutar } = useAccion();
  const [noAplica, setNoAplica] = useState(det.bien.horarioNoAplica);
  const [tramos, setTramos] = useState<Tramo[]>(det.horarios);

  const deDia = (dia: number) => tramos.filter((t) => t.dia === dia);
  const horas = tramos.reduce((a, t) => a + calcularHoras(t.desde, t.hasta), 0);

  function cambiar(dia: number, i: number, parche: Partial<Tramo>) {
    let n = -1;
    setTramos((prev) =>
      prev.map((t) => {
        if (t.dia !== dia) return t;
        n++;
        return n === i ? { ...t, ...parche } : t;
      }),
    );
  }
  function quitar(dia: number, i: number) {
    let n = -1;
    setTramos((prev) =>
      prev.filter((t) => {
        if (t.dia !== dia) return true;
        n++;
        return n !== i;
      }),
    );
  }

  return (
    <Tarjeta
      titulo="Horario de utilización"
      descripcion="Días y horarios en los que se usa. Si el bien no tiene un horario fijo, marcá “No aplica”."
      acciones={
        <button
          type="button"
          className={botonPrimario}
          disabled={pending}
          onClick={() =>
            ejecutar(
              () => guardarHorarioBienAction(det.bien.id, { noAplica, tramos }),
              'Horario guardado.',
            )
          }
        >
          {pending ? 'Guardando…' : 'Guardar horario'}
        </button>
      }
    >
      <label className="mb-3 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
          checked={noAplica}
          onChange={(e) => setNoAplica(e.target.checked)}
        />
        <span className="text-sm font-medium text-gray-800">
          No aplica (sin horario de utilización)
        </span>
      </label>

      {!noAplica && (
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
                      onChange={(e) =>
                        setTramos((prev) =>
                          e.target.checked
                            ? [...prev, { dia, ...TRAMO_POR_DEFECTO }]
                            : prev.filter((t) => t.dia !== dia),
                        )
                      }
                    />
                    <span className="text-sm font-medium text-gray-800">{d.label}</span>
                  </label>
                  {lista.length === 0 && <span className="text-xs text-gray-400">No se usa</span>}
                </div>
                {lista.length > 0 && (
                  <div className="mt-2 space-y-2 sm:pl-[8.75rem]">
                    {lista.map((t, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          className={`${inputCls} !h-9 !w-28`}
                          value={t.desde}
                          onChange={(e) => cambiar(dia, i, { desde: e.target.value })}
                        />
                        <span className="text-xs text-gray-400">a</span>
                        <input
                          type="time"
                          className={`${inputCls} !h-9 !w-28`}
                          value={t.hasta}
                          onChange={(e) => cambiar(dia, i, { hasta: e.target.value })}
                        />
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
                      onClick={() => setTramos((prev) => [...prev, { dia, ...TRAMO_POR_DEFECTO }])}
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
          <p className="text-right text-sm text-gray-600">
            Horas semanales de utilización:{' '}
            <span className="font-semibold">{formatearHoras(horas)}</span>
          </p>
        </div>
      )}
    </Tarjeta>
  );
}

// ─── Baja y eliminación ─────────────────────────────────────────────────────

function BajaYEliminacion({
  det,
  catalogos,
  hoy,
}: {
  det: BienDetalle;
  catalogos: CatalogosDisponibles;
  hoy: string;
}) {
  const b = det.bien;
  const router = useRouter();
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({ fechaBaja: hoy, motivoBaja: '', motivoBajaDetalle: '' });

  return (
    <>
      <Tarjeta
        titulo="Baja del bien"
        descripcion={
          b.fechaBaja
            ? 'El bien está dado de baja: queda Inactivo, con su historial, y la amortización deja de correr.'
            : 'Cuando el bien deja de usarse (venta, siniestro, fin de vida útil…). Se conserva con su historial.'
        }
      >
        {b.fechaBaja ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-700">
              Baja el <span className="font-semibold">{fechaLegible(b.fechaBaja)}</span>
              {b.motivoBaja && ` · ${b.motivoBaja}`}
              {b.motivoBajaDetalle && ` — ${b.motivoBajaDetalle}`}
            </p>
            <button
              type="button"
              className={botonSecundario}
              disabled={pending}
              onClick={() => {
                if (window.confirm('¿Reactivar el bien? Se borran la fecha y el motivo de baja.')) {
                  ejecutar(() => reactivarBienAction(b.id), 'Bien reactivado.');
                }
              }}
            >
              Reactivar bien
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Campo label="Fecha de baja" requerido>
              <input
                type="date"
                className={inputCls}
                value={f.fechaBaja}
                max={hoy}
                min={b.fechaIncorporacion}
                onChange={(e) => setF((x) => ({ ...x, fechaBaja: e.target.value }))}
              />
            </Campo>
            <Campo label="Motivo de baja" requerido>
              <CatalogoSelect
                tipo="bu_motivo_baja"
                value={f.motivoBaja}
                onChange={(v) => setF((x) => ({ ...x, motivoBaja: v }))}
                opciones={catalogos.bu_motivo_baja}
              />
            </Campo>
            <Campo label="Detalle del motivo" className="md:col-span-2">
              <input
                className={inputCls}
                value={f.motivoBajaDetalle}
                maxLength={500}
                onChange={(e) => setF((x) => ({ ...x, motivoBajaDetalle: e.target.value }))}
              />
            </Campo>
            <div className="md:col-span-2">
              <button
                type="button"
                disabled={pending || !f.motivoBaja || !f.fechaBaja}
                className="rounded-[10px] border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                onClick={() => {
                  if (
                    window.confirm(
                      `¿Dar de baja “${b.nombre}”? Queda Inactivo y se frena su amortización.`,
                    )
                  ) {
                    ejecutar(() => darDeBajaBienAction(b.id, f), 'Bien dado de baja.');
                  }
                }}
              >
                Dar de baja
              </button>
            </div>
          </div>
        )}
      </Tarjeta>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
        <h2 className="text-base font-bold" style={{ color: '#101828' }}>
          Eliminar bien
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Para un bien cargado por error. Si ya tiene mantenimientos, reparaciones, fallas o
          inspecciones, dalo de baja en lugar de eliminarlo.
        </p>
        <button
          type="button"
          disabled={pending}
          className="mt-3 rounded-[10px] border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
          onClick={() => {
            if (window.confirm(`¿Eliminar “${b.nombre}”? No se puede deshacer.`)) {
              ejecutar(
                () => eliminarBienAction(b.id),
                'Bien eliminado.',
                () => router.push('/bienes-de-uso'),
              );
            }
          }}
        >
          Eliminar bien
        </button>
      </section>
    </>
  );
}
