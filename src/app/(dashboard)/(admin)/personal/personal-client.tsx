'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Contact,
  Plus,
  Search,
  X,
} from 'lucide-react';

import { crearEmpleadoAction } from '@/app/actions/legajo';
import { EmptyState } from '@/components/shared/empty-state';
import { ExportarMenu } from '@/components/shared/exportar-menu';
import { normalizarBusqueda } from '@/lib/buscador';
import { addDiasYmd, todayArg } from '@/lib/dates';
import { fechaLegible } from '@/lib/documentacion-fechas';
import { exportarTabla, type FormatoExportacion } from '@/lib/exportar-tabla';
import {
  ESTADOS_EMPLEADO,
  LABEL_ROL,
  NOVEDADES_HORA,
  TIPOS_DOCUMENTO_PERSONA,
  TIPOS_HORA,
  labelDe,
} from '@/lib/legajo/constantes';
import type {
  FilaLegajo,
  FilaNovedades,
  FilaSemana,
  UsuarioVinculable,
} from '@/lib/legajo/consultas';
import { formatearHoras, validarDocumento } from '@/lib/legajo/validaciones';

import {
  Campo,
  CatalogoSelect,
  Selector,
  botonPrimario,
  botonSecundario,
  inputCls,
  useAccion,
} from '@/components/shared/form-ui';

type Vista = 'legajos' | 'semana' | 'novedades';

type Props = {
  vista: Vista;
  filas: FilaLegajo[];
  puestos: string[];
  vinculables: UsuarioVinculable[];
  semana: {
    lunes: string;
    anterior: string;
    siguiente: string;
    dias: string[];
    filas: FilaSemana[];
  } | null;
  novedades: { mes: string; filas: FilaNovedades[] } | null;
  clubNombre: string;
};

const VISTAS: { id: Vista; label: string }[] = [
  { id: 'legajos', label: 'Legajos' },
  { id: 'semana', label: 'Planilla semanal' },
  { id: 'novedades', label: 'Novedades del mes' },
];

export function PersonalClient(props: Props) {
  const [creando, setCreando] = useState(false);
  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Personal</h1>
          <p className="page-subtitle mt-1">Legajo, horarios y novedades del personal del club</p>
        </div>
        <button type="button" className={botonPrimario} onClick={() => setCreando(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Nuevo legajo
          </span>
        </button>
      </div>

      <div className="-mx-4 mb-6 overflow-x-auto border-b border-gray-200 md:mx-0">
        <div className="flex min-w-max px-4 whitespace-nowrap md:px-0">
          {VISTAS.map((v) => (
            <Link
              key={v.id}
              href={v.id === 'legajos' ? '/personal' : `/personal?vista=${v.id}`}
              className={`shrink-0 px-4 pb-3 text-sm font-medium transition ${
                props.vista === v.id
                  ? 'border-b-2 border-[#175861] text-[#175861]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </div>

      {props.vista === 'legajos' && <ListaLegajos filas={props.filas} />}
      {props.vista === 'semana' && props.semana && (
        <PlanillaSemanal semana={props.semana} clubNombre={props.clubNombre} />
      )}
      {props.vista === 'novedades' && props.novedades && <NovedadesMes datos={props.novedades} />}

      {creando && (
        <NuevoLegajo
          puestos={props.puestos}
          vinculables={props.vinculables}
          onCerrar={() => setCreando(false)}
        />
      )}
    </div>
  );
}

// ─── Lista de legajos ───────────────────────────────────────────────────────

function ListaLegajos({ filas }: { filas: FilaLegajo[] }) {
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');

  const visibles = useMemo(() => {
    const n = normalizarBusqueda(q);
    return filas.filter((f) => {
      if (estado && f.estado !== estado) return false;
      if (!n) return true;
      return normalizarBusqueda(
        `${f.apellido} ${f.nombre} ${f.nroDocumento} ${f.puesto ?? ''} ${f.area ?? ''} ${f.numero}`,
      ).includes(n);
    });
  }, [filas, q, estado]);

  if (filas.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white">
        <EmptyState
          icon={<Contact className="h-6 w-6 text-gray-400" />}
          text="Todavía no hay legajos cargados."
          description="Con “Nuevo legajo” das de alta a la primera persona; el resto de los datos se completa por solapas."
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Buscar por nombre, documento, puesto o Nº de legajo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className={`${inputCls} sm:!w-48`}
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {ESTADOS_EMPLEADO.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </div>

      {visibles.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">
          No hay legajos que coincidan con la búsqueda.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                <th className="px-4 py-3 font-semibold">Nº</th>
                <th className="px-4 py-3 font-semibold">Apellido y nombre</th>
                <th className="px-4 py-3 font-semibold">Documento</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Ingreso</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Legajo</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const est = ESTADOS_EMPLEADO.find((e) => e.value === f.estado);
                return (
                  <tr key={f.id} className="border-b border-gray-100 transition hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{f.numero}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/personal/${f.id}`}
                        className="font-semibold text-[#175861] hover:underline"
                      >
                        {f.apellido}, {f.nombre}
                      </Link>
                      {f.tieneUsuario && (
                        <span className="ml-2 text-xs text-gray-400">· con usuario</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {labelDe(TIPOS_DOCUMENTO_PERSONA, f.tipoDocumento)} {f.nroDocumento}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{f.puesto ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{fechaLegible(f.fechaIngreso)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${est?.clase ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {est?.label ?? f.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {f.estado === 'baja' ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : f.faltan === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#175861]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Completo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Faltan {f.faltan}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Alta de legajo ─────────────────────────────────────────────────────────

function NuevoLegajo({
  puestos,
  vinculables,
  onCerrar,
}: {
  puestos: string[];
  vinculables: UsuarioVinculable[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    nombre: '',
    apellido: '',
    tipoDocumento: 'dni',
    nroDocumento: '',
    fechaIngreso: todayArg(),
    puesto: '',
    profileId: '',
    copiarDatosUsuario: true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const doc =
    f.nroDocumento.trim() === '' ? null : validarDocumento(f.tipoDocumento, f.nroDocumento);

  function elegirUsuario(id: string) {
    set('profileId', id);
    const u = vinculables.find((x) => x.id === id);
    if (u && !f.nombre && !f.apellido) {
      // El nombre del usuario sirve de punto de partida; se puede corregir.
      const [apellido, ...resto] = u.nombre.split(',').map((s) => s.trim());
      if (resto.length) setF((p) => ({ ...p, profileId: id, apellido, nombre: resto.join(' ') }));
    }
  }

  function crear() {
    // `ejecutar` espera { error?, aviso? }; el alta además devuelve el id para abrir la ficha.
    let nuevoId: string | undefined;
    ejecutar(
      async () => {
        const res = await crearEmpleadoAction({
          ...f,
          puesto: f.puesto,
          profileId: f.profileId || undefined,
        });
        nuevoId = res.id;
        return res;
      },
      'Legajo creado. Completá el resto de los datos por solapas.',
      () => {
        if (nuevoId) router.push(`/personal/${nuevoId}`);
        else onCerrar();
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-2xl sm:rounded-2xl md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Nuevo legajo
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Solo lo mínimo para dar de alta. El resto se completa después, por solapas.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="rounded-[8px] p-2 text-gray-400 hover:bg-gray-100"
            onClick={onCerrar}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {vinculables.length > 0 && (
          <div className="mb-4 rounded-[10px] border border-gray-200 bg-gray-50/60 p-3">
            <Campo
              label="¿Ya usa el sistema? Vincular con su usuario (opcional)"
              ayuda="Solo lo reconoce: no cambia su acceso ni su rol."
            >
              <select
                className={inputCls}
                value={f.profileId}
                onChange={(e) => elegirUsuario(e.target.value)}
              >
                <option value="">No, es una persona nueva</option>
                {vinculables.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} · {LABEL_ROL[u.rol] ?? u.rol}
                  </option>
                ))}
              </select>
            </Campo>
            {f.profileId && (
              <label className="mt-2 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded accent-[#175861]"
                  checked={f.copiarDatosUsuario}
                  onChange={(e) => set('copiarDatosUsuario', e.target.checked)}
                />
                <span className="text-sm text-gray-700">Copiar su email y teléfono al legajo</span>
              </label>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Campo label="Nombres" requerido>
            <input
              className={inputCls}
              value={f.nombre}
              maxLength={80}
              onChange={(e) => set('nombre', e.target.value)}
            />
          </Campo>
          <Campo label="Apellidos" requerido>
            <input
              className={inputCls}
              value={f.apellido}
              maxLength={80}
              onChange={(e) => set('apellido', e.target.value)}
            />
          </Campo>
          <Campo label="Tipo de documento" requerido>
            <Selector
              value={f.tipoDocumento}
              onChange={(v) => set('tipoDocumento', v)}
              opciones={TIPOS_DOCUMENTO_PERSONA}
              placeholder="Elegí el tipo"
            />
          </Campo>
          <Campo label="Nº de documento" requerido>
            <input
              className={inputCls}
              value={f.nroDocumento}
              maxLength={30}
              onChange={(e) => set('nroDocumento', e.target.value)}
            />
            {doc && !doc.ok && <p className="mt-1 text-xs text-red-600">{doc.error}</p>}
          </Campo>
          <Campo label="Fecha de ingreso" requerido>
            <input
              type="date"
              className={inputCls}
              value={f.fechaIngreso}
              onChange={(e) => set('fechaIngreso', e.target.value)}
            />
          </Campo>
          <Campo label="Puesto o cargo">
            <CatalogoSelect
              tipo="puesto"
              value={f.puesto}
              onChange={(v) => set('puesto', v)}
              opciones={puestos}
            />
          </Campo>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={botonSecundario} onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className={botonPrimario}
            disabled={
              pending ||
              !f.nombre.trim() ||
              !f.apellido.trim() ||
              !f.nroDocumento.trim() ||
              !f.fechaIngreso
            }
            onClick={crear}
          >
            {pending ? 'Creando…' : 'Crear legajo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Planilla semanal ───────────────────────────────────────────────────────

const NOMBRE_DIA_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const CLASE_CELDA: Record<string, string> = {
  real: 'bg-teal-50 text-[#175861]',
  plan: 'bg-gray-50 text-gray-600',
  vacaciones: 'bg-sky-50 text-sky-700',
  licencia: 'bg-amber-50 text-amber-700',
  novedad: 'bg-orange-50 text-orange-700',
  vacio: '',
};

function PlanillaSemanal({
  semana,
  clubNombre,
}: {
  semana: NonNullable<Props['semana']>;
  clubNombre: string;
}) {
  const router = useRouter();
  const ir = (lunes: string) => router.push(`/personal?vista=semana&lunes=${lunes}`);
  const titulo = `Semana del ${fechaLegible(semana.dias[0])} al ${fechaLegible(semana.dias[6])}`;

  async function exportar(formato: FormatoExportacion) {
    await exportarTabla(formato, {
      nombre: 'planilla-semanal-personal',
      titulo: `${clubNombre} · ${titulo}`,
      columnas: [
        'Empleado',
        'Puesto',
        ...semana.dias.map((d, i) => `${NOMBRE_DIA_CORTO[i]} ${d.slice(8)}`),
        'Horas',
      ],
      filas: semana.filas.map((f) => [
        f.nombre,
        f.puesto ?? '',
        ...f.celdas.map((c) => c.texto),
        formatearHoras(f.totalHoras),
      ]),
    });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{titulo}</p>
          <p className="text-xs text-gray-500">
            Horas cargadas; donde no hay, el horario previsto de cada legajo. Incluye vacaciones y
            licencias.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Semana anterior"
            className={botonSecundario}
            onClick={() => ir(semana.anterior)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className={botonSecundario} onClick={() => ir(todayArg())}>
            Hoy
          </button>
          <button
            type="button"
            aria-label="Semana siguiente"
            className={botonSecundario}
            onClick={() => ir(semana.siguiente)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <ExportarMenu
            onExportar={exportar}
            disabled={semana.filas.length === 0}
            className="ml-2 inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-4 text-sm font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50"
          />
        </div>
      </div>

      {semana.filas.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">
          No hay personal vigente en esta semana.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                <th className="px-4 py-3 font-semibold">Empleado</th>
                {semana.dias.map((d, i) => (
                  <th
                    key={d}
                    className={`px-2 py-3 font-semibold ${d === todayArg() ? 'text-[#175861]' : ''}`}
                  >
                    {NOMBRE_DIA_CORTO[i]} {d.slice(8)}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold">Horas</th>
              </tr>
            </thead>
            <tbody>
              {semana.filas.map((f) => (
                <tr key={f.empleadoId} className="border-b border-gray-100 align-top">
                  <td className="px-4 py-2">
                    <Link
                      href={`/personal/${f.empleadoId}`}
                      className="font-semibold text-[#175861] hover:underline"
                    >
                      {f.nombre}
                    </Link>
                    {f.puesto && <p className="text-xs text-gray-500">{f.puesto}</p>}
                  </td>
                  {f.celdas.map((c, i) => (
                    <td key={i} className="px-1 py-1.5">
                      {c.texto && (
                        <div
                          className={`rounded-md px-2 py-1 text-xs leading-tight ${CLASE_CELDA[c.tipo]}`}
                        >
                          {c.texto}
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold text-gray-900">
                    {formatearHoras(f.totalHoras)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-3 border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
        <Leyenda clase={CLASE_CELDA.real} texto="Horas cargadas" />
        <Leyenda clase={CLASE_CELDA.plan} texto="Horario previsto" />
        <Leyenda clase={CLASE_CELDA.vacaciones} texto="Vacaciones" />
        <Leyenda clase={CLASE_CELDA.licencia} texto="Licencia" />
        <Leyenda clase={CLASE_CELDA.novedad} texto="Otra novedad" />
      </div>
    </div>
  );
}

function Leyenda({ clase, texto }: { clase: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${clase}`} />
      {texto}
    </span>
  );
}

// ─── Novedades del mes (para liquidación) ───────────────────────────────────

const NOMBRE_MES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function mesVecino(mes: string, delta: number) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function NovedadesMes({ datos }: { datos: NonNullable<Props['novedades']> }) {
  const router = useRouter();
  const [y, m] = datos.mes.split('-').map(Number);
  const nombreMes = NOMBRE_MES[m - 1];
  const titulo = `${nombreMes.charAt(0).toUpperCase()}${nombreMes.slice(1)} de ${y}`;
  const ir = (mes: string) => router.push(`/personal?vista=novedades&mes=${mes}`);

  const columnas = [
    'Nº',
    'Empleado',
    'Días trabajados',
    ...TIPOS_HORA.map((t) => `Hs. ${t.label.toLowerCase()}`),
    'Hs. totales',
    'Enfermedad',
    'Licencia',
    'Vacaciones',
    'Ausencia',
    'Feriado',
  ];
  const fila = (f: FilaNovedades) => [
    String(f.numero),
    f.nombre,
    String(f.diasTrabajados),
    ...TIPOS_HORA.map((t) => formatearHoras(f.horasPorTipo[t.value] ?? 0)),
    formatearHoras(f.horasTotales),
    String(f.diasEnfermedad),
    String(f.diasLicencia),
    String(f.diasVacaciones),
    String(f.diasAusencia),
    String(f.diasFeriado),
  ];

  const exportar = (formato: FormatoExportacion) =>
    exportarTabla(formato, {
      nombre: `novedades-personal-${datos.mes}`,
      titulo: `Novedades del personal · ${titulo}`,
      columnas,
      filas: datos.filas.map(fila),
    });

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{titulo}</p>
          <p className="text-xs text-gray-500">
            Resumen por empleado para el área de liquidación de sueldos. Se exporta; no se envía
            solo.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mes anterior"
            className={botonSecundario}
            onClick={() => ir(mesVecino(datos.mes, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={botonSecundario}
            onClick={() => ir(todayArg().slice(0, 7))}
          >
            Hoy
          </button>
          <button
            type="button"
            aria-label="Mes siguiente"
            className={botonSecundario}
            onClick={() => ir(mesVecino(datos.mes, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <ExportarMenu
            onExportar={exportar}
            disabled={datos.filas.length === 0}
            className="ml-2 inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-4 text-sm font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50"
          />
        </div>
      </div>

      {datos.filas.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500">
          No hay personal vigente en este mes.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                {columnas.map((c, i) => (
                  <th key={c} className={`px-3 py-3 font-semibold ${i > 1 ? 'text-right' : ''}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.filas.map((f) => (
                <tr key={f.empleadoId} className="border-b border-gray-100">
                  {fila(f).map((v, i) => (
                    <td
                      key={i}
                      className={`px-3 py-2.5 ${i > 1 ? 'text-right text-gray-700' : i === 1 ? '' : 'text-gray-500'}`}
                    >
                      {i === 1 ? (
                        <Link
                          href={`/personal/${f.empleadoId}?tab=horas&mes=${datos.mes}`}
                          className="font-semibold text-[#175861] hover:underline"
                        >
                          {v}
                        </Link>
                      ) : (
                        v
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
        Los días de vacaciones y licencia salen de sus registros con fechas y de las novedades
        cargadas día por día, sin contar dos veces el mismo día. Novedades posibles:{' '}
        {NOVEDADES_HORA.map((n) => n.label.toLowerCase()).join(', ')}.
      </p>
    </div>
  );
}
