'use client';

import { useRef, useState } from 'react';
import { Paperclip, Plus, Trash2 } from 'lucide-react';

import {
  actualizarLicenciaAction,
  agregarVacacionesTomadasAction,
  crearLicenciaAction,
  eliminarLicenciaAction,
  eliminarVacacionesTomadasAction,
  guardarVacacionesAnualesAction,
} from '@/app/actions/legajo-documentos';
import { fechaLegible } from '@/lib/documentacion-fechas';
import { todayArg } from '@/lib/dates';
import type { CatalogosDisponibles } from '@/lib/catalogos-club';
import type { LegajoDetalle, PersonaSelector } from '@/lib/legajo/consultas';
import { diasCorridos } from '@/lib/legajo/validaciones';

import {
  Campo,
  CatalogoSelect,
  Tarjeta,
  botonPrimario,
  botonSecundario,
  inputCls,
  textareaCls,
  useAccion,
} from '@/components/shared/form-ui';

type Licencia = LegajoDetalle['licencias'][number];

export function TabLicencias({
  det,
  catalogos,
  personal,
  admins,
}: {
  det: LegajoDetalle;
  catalogos: CatalogosDisponibles;
  personal: PersonaSelector[];
  admins: PersonaSelector[];
}) {
  return (
    <div className="space-y-6">
      <Vacaciones det={det} />
      {/* Nadie aprueba su propia licencia. */}
      <Licencias
        det={det}
        catalogos={catalogos}
        personal={personal.filter((p) => p.value !== det.empleado.id)}
        admins={admins.filter((a) => a.value !== det.empleado.profileId)}
      />
    </div>
  );
}

// ─── Vacaciones ─────────────────────────────────────────────────────────────

function Vacaciones({ det }: { det: LegajoDetalle }) {
  const empleadoId = det.empleado.id;
  const { pending, ejecutar } = useAccion();
  const anioActual = Number(todayArg().slice(0, 4));
  const [anio, setAnio] = useState(String(anioActual));
  const [dias, setDias] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [nota, setNota] = useState('');

  // Años con algo cargado (más el actual), del más nuevo al más viejo.
  const anios = [
    ...new Set([
      anioActual,
      ...det.vacaciones.anuales.map((a) => a.anio),
      ...det.vacaciones.tomadas.map((t) => t.anio),
    ]),
  ].sort((a, b) => b - a);

  const resumen = anios.map((a) => {
    const totales = det.vacaciones.anuales.find((x) => x.anio === a)?.diasTotales ?? null;
    const tomados = det.vacaciones.tomadas
      .filter((t) => t.anio === a)
      .reduce((s, t) => s + t.dias, 0);
    return { anio: a, totales, tomados, restan: totales === null ? null : totales - tomados };
  });

  const diasPeriodo = desde && hasta && hasta >= desde ? diasCorridos(desde, hasta) : null;

  return (
    <Tarjeta
      titulo="Vacaciones"
      descripcion="Días que le corresponden por año y períodos tomados (con fecha desde y hasta)."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
              <th className="py-2 pr-4 font-semibold">Año</th>
              <th className="py-2 pr-4 font-semibold">Corresponden</th>
              <th className="py-2 pr-4 font-semibold">Tomados</th>
              <th className="py-2 font-semibold">Restan</th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((r) => (
              <tr key={r.anio} className="border-b border-gray-100">
                <td className="py-2 pr-4 font-medium text-gray-900">{r.anio}</td>
                <td className="py-2 pr-4 text-gray-700">{r.totales ?? '—'}</td>
                <td className="py-2 pr-4 text-gray-700">{r.tomados}</td>
                <td
                  className={`py-2 font-semibold ${r.restan !== null && r.restan < 0 ? 'text-red-600' : 'text-gray-900'}`}
                >
                  {r.restan ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-[10px] border border-gray-200 p-4">
          <p className="mb-3 text-sm font-semibold text-gray-800">Días que le corresponden</p>
          <div className="flex flex-wrap items-end gap-3">
            <Campo label="Año">
              <input
                type="number"
                className={`${inputCls} !w-28`}
                value={anio}
                min={2000}
                max={2100}
                onChange={(x) => setAnio(x.target.value)}
              />
            </Campo>
            <Campo label="Días">
              <input
                type="number"
                className={`${inputCls} !w-28`}
                value={dias}
                min={0}
                max={366}
                onChange={(x) => setDias(x.target.value)}
              />
            </Campo>
            <button
              type="button"
              className={botonPrimario}
              disabled={pending || dias === ''}
              onClick={() =>
                ejecutar(
                  () =>
                    guardarVacacionesAnualesAction(empleadoId, {
                      anio: Number(anio),
                      diasTotales: Number(dias),
                    }),
                  'Días de vacaciones guardados.',
                  () => setDias(''),
                )
              }
            >
              Guardar
            </button>
          </div>
        </div>

        <div className="rounded-[10px] border border-gray-200 p-4">
          <p className="mb-3 text-sm font-semibold text-gray-800">Registrar vacaciones tomadas</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Desde">
              <input
                type="date"
                className={inputCls}
                value={desde}
                onChange={(x) => setDesde(x.target.value)}
              />
            </Campo>
            <Campo label="Hasta">
              <input
                type="date"
                className={inputCls}
                value={hasta}
                onChange={(x) => setHasta(x.target.value)}
              />
            </Campo>
            <Campo
              label="Nota"
              className="col-span-2"
              ayuda={diasPeriodo ? `Son ${diasPeriodo} días corridos.` : undefined}
            >
              <input
                className={inputCls}
                value={nota}
                maxLength={500}
                onChange={(x) => setNota(x.target.value)}
              />
            </Campo>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className={botonPrimario}
              disabled={pending || !desde || !hasta}
              onClick={() =>
                ejecutar(
                  () => agregarVacacionesTomadasAction(empleadoId, { desde, hasta, nota }),
                  'Vacaciones registradas.',
                  () => {
                    setDesde('');
                    setHasta('');
                    setNota('');
                  },
                )
              }
            >
              Registrar
            </button>
          </div>
        </div>
      </div>

      {det.vacaciones.tomadas.length > 0 && (
        <ul className="mt-5 divide-y divide-gray-100">
          {det.vacaciones.tomadas.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium text-gray-900">
                  {fechaLegible(t.desde)} al {fechaLegible(t.hasta)}
                </span>
                <span className="text-gray-500"> · {t.dias} días</span>
                {t.nota && <span className="text-gray-500"> · {t.nota}</span>}
              </div>
              <button
                type="button"
                aria-label="Quitar"
                disabled={pending}
                className="rounded-[8px] p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                onClick={() => {
                  if (window.confirm('¿Quitar este período de vacaciones?')) {
                    ejecutar(
                      () => eliminarVacacionesTomadasAction(empleadoId, t.id),
                      'Período quitado.',
                    );
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

// ─── Licencias ──────────────────────────────────────────────────────────────

function Licencias({
  det,
  catalogos,
  personal,
  admins,
}: {
  det: LegajoDetalle;
  catalogos: CatalogosDisponibles;
  personal: PersonaSelector[];
  admins: PersonaSelector[];
}) {
  const empleadoId = det.empleado.id;
  const [abierto, setAbierto] = useState(false);

  return (
    <Tarjeta
      titulo="Licencias"
      descripcion="Historial de licencias, con quién la aprobó y el certificado."
      acciones={
        !abierto && (
          <button type="button" className={botonSecundario} onClick={() => setAbierto(true)}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Nueva licencia
            </span>
          </button>
        )
      }
    >
      {abierto && (
        <FormLicencia
          empleadoId={empleadoId}
          catalogos={catalogos}
          personal={personal}
          admins={admins}
          onCerrar={() => setAbierto(false)}
        />
      )}
      {det.licencias.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay licencias registradas.</p>
      ) : (
        <ul className="space-y-3">
          {det.licencias.map((l) => (
            <FilaLicencia
              key={l.id}
              empleadoId={empleadoId}
              lic={l}
              personal={personal}
              admins={admins}
            />
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function SelectorAprobador({
  value,
  onChange,
  personal,
  admins,
}: {
  value: string;
  onChange: (v: string) => void;
  personal: PersonaSelector[];
  admins: PersonaSelector[];
}) {
  return (
    <select className={inputCls} value={value} onChange={(x) => onChange(x.target.value)}>
      <option value="">Sin aprobador</option>
      {admins.length > 0 && (
        <optgroup label="Administración">
          {admins.map((a) => (
            <option key={a.value} value={`usuario:${a.value}`}>
              {a.label}
            </option>
          ))}
        </optgroup>
      )}
      {personal.length > 0 && (
        <optgroup label="Personal con legajo">
          {personal.map((p) => (
            <option key={p.value} value={`empleado:${p.value}`}>
              {p.label}
              {p.detalle ? ` · ${p.detalle}` : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

function FormLicencia({
  empleadoId,
  catalogos,
  personal,
  admins,
  onCerrar,
}: {
  empleadoId: string;
  catalogos: CatalogosDisponibles;
  personal: PersonaSelector[];
  admins: PersonaSelector[];
  onCerrar: () => void;
}) {
  const { pending, ejecutar } = useAccion();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    tipo: '',
    fechaAlta: '',
    fechaIncorporacion: '',
    motivo: '',
    aprobador: '',
  });
  const [archivo, setArchivo] = useState<File | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((p) => ({ ...p, [k]: v }));

  function guardar() {
    const fd = new FormData();
    fd.set('empleadoId', empleadoId);
    for (const [k, v] of Object.entries(f)) fd.set(k, v);
    if (archivo) fd.set('certificado', archivo);
    ejecutar(() => crearLicenciaAction(fd), 'Licencia registrada.', onCerrar);
  }

  return (
    <div className="mb-4 rounded-[10px] border border-gray-200 bg-gray-50/60 p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo label="Tipo de licencia" requerido>
          <CatalogoSelect
            tipo="tipo_licencia"
            value={f.tipo}
            onChange={(v) => set('tipo', v)}
            opciones={catalogos.tipo_licencia}
          />
        </Campo>
        <Campo label="Aprobada por">
          <SelectorAprobador
            value={f.aprobador}
            onChange={(v) => set('aprobador', v)}
            personal={personal}
            admins={admins}
          />
        </Campo>
        <Campo label="Fecha de alta de la licencia" requerido>
          <input
            type="date"
            className={inputCls}
            value={f.fechaAlta}
            onChange={(x) => set('fechaAlta', x.target.value)}
          />
        </Campo>
        <Campo
          label="Fecha de incorporación"
          ayuda="Primer día de vuelta. Dejala vacía si sigue de licencia."
        >
          <input
            type="date"
            className={inputCls}
            value={f.fechaIncorporacion}
            onChange={(x) => set('fechaIncorporacion', x.target.value)}
          />
        </Campo>
        <Campo label="Motivo o descripción" className="md:col-span-2">
          <textarea
            className={textareaCls}
            value={f.motivo}
            maxLength={1000}
            onChange={(x) => set('motivo', x.target.value)}
          />
        </Campo>
        <div className="md:col-span-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(x) => setArchivo(x.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className={botonSecundario}
            onClick={() => fileRef.current?.click()}
          >
            <span className="inline-flex items-center gap-1.5">
              <Paperclip className="h-4 w-4" />
              {archivo ? archivo.name : 'Adjuntar certificado'}
            </span>
          </button>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={botonSecundario} onClick={onCerrar}>
          Cancelar
        </button>
        <button type="button" className={botonPrimario} disabled={pending} onClick={guardar}>
          {pending ? 'Guardando…' : 'Guardar licencia'}
        </button>
      </div>
    </div>
  );
}

function FilaLicencia({
  empleadoId,
  lic,
  personal,
  admins,
}: {
  empleadoId: string;
  lic: Licencia;
  personal: PersonaSelector[];
  admins: PersonaSelector[];
}) {
  const { pending, ejecutar } = useAccion();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editando, setEditando] = useState(false);
  const [vuelta, setVuelta] = useState(lic.fechaIncorporacion ?? '');
  const [motivo, setMotivo] = useState(lic.motivo ?? '');
  const [aprobador, setAprobador] = useState(lic.aprobadorValor);
  const enCurso = !lic.fechaIncorporacion;

  function armar(): FormData {
    const fd = new FormData();
    fd.set('empleadoId', empleadoId);
    fd.set('licenciaId', lic.id);
    fd.set('fechaIncorporacion', vuelta);
    fd.set('motivo', motivo);
    fd.set('aprobador', aprobador);
    return fd;
  }

  function subirCertificado(file: File | undefined) {
    if (!file) return;
    const fd = armar();
    fd.set('certificado', file);
    ejecutar(() => actualizarLicenciaAction(fd), 'Certificado guardado.');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <li className="rounded-[10px] border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{lic.tipo}</p>
            {enCurso && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                En curso
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Desde {fechaLegible(lic.fechaAlta)}
            {lic.fechaIncorporacion &&
              ` · se reincorpora el ${fechaLegible(lic.fechaIncorporacion)}`}
            {lic.aprobadorTexto && ` · aprobó ${lic.aprobadorTexto}`}
          </p>
          {lic.motivo && !editando && <p className="mt-1 text-sm text-gray-700">{lic.motivo}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {lic.certificadoUrl && (
            <a
              href={lic.certificadoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#175861] hover:bg-gray-50"
            >
              Ver certificado
            </a>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(x) => subirCertificado(x.target.files?.[0])}
          />
          <button
            type="button"
            className={botonSecundario}
            disabled={pending}
            onClick={() => fileRef.current?.click()}
          >
            <span className="inline-flex items-center gap-1.5">
              <Paperclip className="h-4 w-4" />
              {lic.certificadoUrl ? 'Reemplazar' : 'Certificado'}
            </span>
          </button>
          <button type="button" className={botonSecundario} onClick={() => setEditando((v) => !v)}>
            {editando ? 'Cerrar' : 'Editar'}
          </button>
          <button
            type="button"
            aria-label="Eliminar licencia"
            disabled={pending}
            className="rounded-[8px] p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
            onClick={() => {
              if (window.confirm('¿Eliminar esta licencia y su certificado?')) {
                ejecutar(() => eliminarLicenciaAction(empleadoId, lic.id), 'Licencia eliminada.');
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {editando && (
        <div className="mt-3 grid grid-cols-1 gap-4 border-t border-gray-100 pt-3 md:grid-cols-2">
          <Campo label="Fecha de incorporación" ayuda="Primer día de vuelta.">
            <input
              type="date"
              className={inputCls}
              value={vuelta}
              min={lic.fechaAlta}
              onChange={(x) => setVuelta(x.target.value)}
            />
          </Campo>
          <Campo label="Aprobada por">
            <SelectorAprobador
              value={aprobador}
              onChange={setAprobador}
              personal={personal}
              admins={admins}
            />
          </Campo>
          <Campo label="Motivo o descripción" className="md:col-span-2">
            <textarea
              className={textareaCls}
              value={motivo}
              maxLength={1000}
              onChange={(x) => setMotivo(x.target.value)}
            />
          </Campo>
          <div className="flex justify-end md:col-span-2">
            <button
              type="button"
              className={botonPrimario}
              disabled={pending}
              onClick={() =>
                ejecutar(
                  () => actualizarLicenciaAction(armar()),
                  'Licencia actualizada.',
                  () => setEditando(false),
                )
              }
            >
              Guardar cambios
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
