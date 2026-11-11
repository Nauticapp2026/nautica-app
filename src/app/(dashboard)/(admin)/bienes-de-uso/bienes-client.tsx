'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, Search, Wrench, X } from 'lucide-react';

import { crearBienAction } from '@/app/actions/bienes-uso';
import { EmptyState } from '@/components/shared/empty-state';
import { ExportarMenu } from '@/components/shared/exportar-menu';
import {
  Campo,
  CatalogoSelect,
  Selector,
  botonPrimario,
  botonSecundario,
  inputCls,
  useAccion,
} from '@/components/shared/form-ui';
import { ESTADOS_BIEN, FORMAS_ADQUISICION } from '@/lib/bienes-uso/constantes';
import type { FilaBien } from '@/lib/bienes-uso/consultas';
import { normalizarBusqueda } from '@/lib/buscador';
import { fechaLegible } from '@/lib/documentacion-fechas';
import { exportarTabla, type FormatoExportacion } from '@/lib/exportar-tabla';
import { labelDe } from '@/lib/legajo/constantes';

const vacio = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : String(v);

export function BienesClient({
  filas,
  tipos,
  hoy,
}: {
  filas: FilaBien[];
  tipos: string[];
  /** Hoy ('YYYY-MM-DD', horario argentino): fecha de incorporación por defecto y control de seguros vencidos. */
  hoy: string;
}) {
  const [creando, setCreando] = useState(false);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [tipo, setTipo] = useState('');
  const [rubro, setRubro] = useState('');

  const rubros = useMemo(
    () => [...new Set(filas.map((f) => f.rubro).filter((x): x is string => !!x))].sort(),
    [filas],
  );
  const tiposUsados = useMemo(
    () => tipos.filter((t) => filas.some((f) => f.tipoBien === t)),
    [tipos, filas],
  );

  const visibles = useMemo(() => {
    const n = normalizarBusqueda(q);
    return filas.filter((f) => {
      if (estado && f.estado !== estado) return false;
      if (tipo && f.tipoBien !== tipo) return false;
      if (rubro && f.rubro !== rubro) return false;
      if (!n) return true;
      return normalizarBusqueda(
        `${f.numero} ${f.nombre} ${f.marca ?? ''} ${f.nroSerie ?? ''} ${f.patente ?? ''} ${f.tipoBien ?? ''} ${f.ubicaciones.join(' ')}`,
      ).includes(n);
    });
  }, [filas, q, estado, tipo, rubro]);

  const seguroVencido = (f: FilaBien) => !!f.seguroVencimiento && f.seguroVencimiento < hoy;
  const estadoTexto = (f: FilaBien) =>
    f.estado === 'otro' && f.estadoDetalle ? f.estadoDetalle : labelDe(ESTADOS_BIEN, f.estado);
  const seguroTexto = (f: FilaBien) =>
    [f.seguroAseguradora, f.seguroPoliza && `Póliza ${f.seguroPoliza}`, f.seguroDetalle]
      .filter(Boolean)
      .join(' · ');
  const motivoTexto = (f: FilaBien) =>
    [f.motivoBaja, f.motivoBajaDetalle].filter(Boolean).join(' · ');

  const COLUMNAS = [
    'ID',
    'Fecha de incorporación',
    'Estado',
    'Vida útil',
    'Fecha de baja',
    'Motivo de baja',
    'Forma de adquisición',
    'Tipo de bien',
    'Rubro',
    'Subrubro',
    'Nº de guardería',
    'Nombre o descripción',
    'Marca',
    'Nº de serie',
    'Año de fabricación',
    'Patente',
    'Ubicación actual',
    'Lugar de utilización',
    'Horario de utilización',
    'Empleados autorizados',
    'Seguro',
  ];
  const celdas = (f: FilaBien): string[] => [
    String(f.numero),
    fechaLegible(f.fechaIncorporacion),
    estadoTexto(f),
    f.vidaUtilAnios ? `${f.vidaUtilAnios} años` : '',
    f.fechaBaja ? fechaLegible(f.fechaBaja) : '',
    motivoTexto(f),
    labelDe(FORMAS_ADQUISICION, f.formaAdquisicion),
    f.tipoBien ?? '',
    f.rubro ?? '',
    f.subrubro ?? '',
    f.nroGuarderia ?? '',
    f.nombre,
    f.marca ?? '',
    f.nroSerie ?? '',
    f.anioFabricacion ? String(f.anioFabricacion) : '',
    f.patente ?? '',
    f.ubicaciones.join(', '),
    f.lugaresUtilizacion.join(', '),
    f.horario,
    f.empleadosAutorizados.join(', '),
    [seguroTexto(f), f.seguroVencimiento && `vence ${fechaLegible(f.seguroVencimiento)}`]
      .filter(Boolean)
      .join(' · '),
  ];

  const exportar = (formato: FormatoExportacion) =>
    exportarTabla(formato, {
      nombre: 'bienes-de-uso',
      titulo: 'Bienes de uso',
      columnas: COLUMNAS,
      filas: visibles.map(celdas),
    });

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Bienes de uso</h1>
          <p className="page-subtitle mt-1">Camionetas, máquinas, grúas y demás equipos del club</p>
        </div>
        <button type="button" className={botonPrimario} onClick={() => setCreando(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Nuevo bien
          </span>
        </button>
      </div>

      {filas.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <EmptyState
            icon={<Wrench className="h-6 w-6 text-gray-400" />}
            text="Todavía no hay bienes de uso cargados."
            description="Con “Nuevo bien” das de alta el primero; el resto de los datos, el mantenimiento y los datos contables se completan por solapas."
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className={`${inputCls} pl-9`}
                placeholder="Buscar por ID, nombre, marca, serie, patente o ubicación"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select
              className={`${inputCls} lg:!w-44`}
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              <option value="">Todos los estados</option>
              {ESTADOS_BIEN.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
            <select
              className={`${inputCls} lg:!w-44`}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="">Todos los tipos</option>
              {tiposUsados.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className={`${inputCls} lg:!w-44`}
              value={rubro}
              onChange={(e) => setRubro(e.target.value)}
            >
              <option value="">Todos los rubros</option>
              {rubros.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <ExportarMenu
              onExportar={exportar}
              disabled={visibles.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-4 text-sm font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50"
            />
          </div>

          {visibles.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">
              No hay bienes que coincidan con la búsqueda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[2200px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs tracking-wide text-gray-500 uppercase">
                    {COLUMNAS.map((c) => (
                      <th key={c} className="px-3 py-3 font-semibold whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => {
                    const est = ESTADOS_BIEN.find((e) => e.value === f.estado);
                    const c = celdas(f);
                    return (
                      <tr
                        key={f.id}
                        className="border-b border-gray-100 align-top transition hover:bg-gray-50"
                      >
                        <td className="px-3 py-3 font-medium text-gray-900">{f.numero}</td>
                        <td className="px-3 py-3 text-gray-700">{c[1]}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${est?.clase ?? 'bg-gray-100 text-gray-600'}`}
                          >
                            {c[2]}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[3])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[4])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[5])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[6])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[7])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[8])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[9])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[10])}</td>
                        <td className="px-3 py-3">
                          <Link
                            href={`/bienes-de-uso/${f.id}`}
                            className="font-semibold text-[#175861] hover:underline"
                          >
                            {f.nombre}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[12])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[13])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[14])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[15])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[16])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[17])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[18])}</td>
                        <td className="px-3 py-3 text-gray-700">{vacio(c[19])}</td>
                        <td className="px-3 py-3 text-gray-700">
                          {seguroTexto(f) || '—'}
                          {seguroVencido(f) && (
                            <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-red-700">
                              <AlertTriangle className="h-3 w-3" />
                              Vencido el {fechaLegible(f.seguroVencimiento!)}
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
      )}

      {creando && <NuevoBien tipos={tipos} hoy={hoy} onCerrar={() => setCreando(false)} />}
    </div>
  );
}

// ─── Alta: solo lo indispensable ────────────────────────────────────────────

function NuevoBien({
  tipos,
  hoy,
  onCerrar,
}: {
  tipos: string[];
  hoy: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const { pending, ejecutar } = useAccion();
  const [f, setF] = useState({
    nombre: '',
    fechaIncorporacion: hoy,
    tipoBien: '',
    formaAdquisicion: '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function crear() {
    let nuevoId: string | undefined;
    ejecutar(
      async () => {
        const res = await crearBienAction(f);
        nuevoId = res.id;
        return res;
      },
      'Bien de uso creado. Completá el resto de los datos por solapas.',
      () => {
        if (nuevoId) router.push(`/bienes-de-uso/${nuevoId}`);
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
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-xl sm:rounded-2xl md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Nuevo bien de uso
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              El número de ID lo asigna el sistema. El resto de los datos se completa después.
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Campo label="Nombre o descripción" requerido className="md:col-span-2">
            <input
              autoFocus
              className={inputCls}
              value={f.nombre}
              maxLength={150}
              placeholder="Ej: Autoelevador Hyster 5 tn"
              onChange={(e) => set('nombre', e.target.value)}
            />
          </Campo>
          <Campo label="Fecha de incorporación" requerido>
            <input
              type="date"
              className={inputCls}
              value={f.fechaIncorporacion}
              onChange={(e) => set('fechaIncorporacion', e.target.value)}
            />
          </Campo>
          <Campo label="Tipo de bien">
            <CatalogoSelect
              tipo="bu_tipo"
              value={f.tipoBien}
              onChange={(v) => set('tipoBien', v)}
              opciones={tipos}
            />
          </Campo>
          <Campo label="Forma de adquisición">
            <Selector
              value={f.formaAdquisicion}
              onChange={(v) => set('formaAdquisicion', v)}
              opciones={FORMAS_ADQUISICION}
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
            disabled={pending || !f.nombre.trim() || !f.fechaIncorporacion}
            onClick={crear}
          >
            {pending ? 'Creando…' : 'Crear bien'}
          </button>
        </div>
      </div>
    </div>
  );
}
