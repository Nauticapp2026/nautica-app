'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  Landmark,
  Paperclip,
  Plus,
  Search,
  X,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

import { normalizarBusqueda } from '@/lib/buscador';
import { exportarTabla } from '@/lib/exportar-tabla';
import { generarCierreCajaPdf, textoPeriodo } from '@/lib/tesoreria-cierre-pdf';
import { INSTRUMENTOS, labelInstrumento, type Instrumento } from '@/lib/tesoreria/instrumentos';
import { RUBROS, subrubrosDe } from '@/lib/tesoreria/rubros';
import {
  fechaMinimaCarga,
  labelPeriodoCarga,
  type PeriodoCarga,
} from '@/lib/tesoreria/periodo-carga';
import {
  CAMPOS_INSTRUMENTO,
  numeroDecimal,
  resumenDatosInstrumento,
} from '@/lib/tesoreria/datos-instrumento';
import type {
  FiltrosTesoreria,
  LineaTesoreria,
  ResumenInstrumento,
} from '@/lib/tesoreria/movimientos';
import {
  anularMovimientoTesoreriaAction,
  crearMovimientoTesoreriaAction,
  editarMovimientoTesoreriaAction,
} from '@/app/actions/tesoreria';
import {
  motivoBloqueoEdicion,
  puedeEditarMovimiento,
  type PeriodoEdicion,
} from '@/lib/tesoreria/periodo-edicion';
import { EmptyState } from '@/components/shared/empty-state';
import { Field, inputCls } from '@/components/shared/forma-pago';

export type LineaTesoreriaUI = LineaTesoreria & { adjuntoUrl: string | null };

/** Filtros del Registro de Movimientos: todo opcional (vacío = todo). */
export type FiltrosRegistro = {
  desde: string | null;
  hasta: string | null;
  instrumento: Instrumento | null;
};

type Props = {
  /** Líneas del período del cierre (van al PDF de cierre). */
  lineas: LineaTesoreria[];
  resumen: ResumenInstrumento[];
  consolidado: ResumenInstrumento;
  filtros: FiltrosTesoreria;
  /** Registro de Movimientos: independiente del cierre. */
  registro: { lineas: LineaTesoreriaUI[]; filtros: FiltrosRegistro };
  hoy: string;
  /** Hasta qué fecha hacia atrás el club permite cargar movimientos (Mi perfil). */
  periodoCarga: PeriodoCarga;
  /** Hasta cuándo se puede anular o modificar un movimiento ya cargado (Mi perfil). */
  periodoEdicion: PeriodoEdicion;
  club: { nombre: string; cuit: string | null; direccion: string | null; ciudad: string | null };
};

function fmtMoney(value: number): string {
  const abs = Math.abs(value).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-$${abs}` : `$${abs}`;
}

function fmtUsd(value: number): string {
  const abs = Math.abs(value).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-USD ${abs}` : `USD ${abs}`;
}

function ymdALegible(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

// Mismas clases que los filtros de Cobranzas (cobranzas-tabs-client.tsx).
const filtroCls =
  'h-10 rounded-[10px] border border-gray-200 bg-white px-3 text-sm focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none';
// Mismas clases que el disparador de ExportarMenu.
const botonExportCls =
  'flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40';

const TODOS: Instrumento[] = INSTRUMENTOS.map((i) => i.value as Instrumento);

export function TesoreriaClient({
  lineas,
  resumen,
  consolidado,
  filtros,
  registro,
  hoy,
  periodoCarga,
  periodoEdicion,
  club,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  // Edición y anulación de movimientos manuales (pedido del cliente
  // 2026-10-13), con el mismo patrón inline de "Anular recibo" en Cobranzas.
  const [editando, setEditando] = useState<LineaTesoreriaUI | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [anulando, startAnular] = useTransition();

  function anular(l: LineaTesoreriaUI) {
    if (!l.movimientoId) return;
    startAnular(async () => {
      const res = await anularMovimientoTesoreriaAction(l.movimientoId!);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Movimiento ${res.codigo} anulado.`);
      setAnulandoId(null);
      router.refresh();
    });
  }

  // ── Filtros → URL (el server recalcula saldos con el rango exacto) ───────
  // Las fechas se escriben en los campos y recién se aplican con "Buscar"
  // (pedido del cliente 2026-10-13); Desde y Hasta son obligatorias y
  // arrancan en hoy. Los instrumentos sí aplican al toque.
  const [desdeDraft, setDesdeDraft] = useState(filtros.desde ?? hoy);
  const [hastaDraft, setHastaDraft] = useState(filtros.hasta ?? hoy);

  // Los dos bloques (cierre y registro) viven en la misma URL: al cambiar uno
  // se conservan los parámetros del otro.
  function navegar(cierre: FiltrosTesoreria, reg: FiltrosRegistro) {
    const params = new URLSearchParams();
    params.set('desde', cierre.desde ?? hoy);
    params.set('hasta', cierre.hasta ?? hoy);
    if (cierre.instrumentos.length !== TODOS.length) {
      params.set('inst', cierre.instrumentos.join(','));
    }
    if (reg.desde) params.set('rdesde', reg.desde);
    if (reg.hasta) params.set('rhasta', reg.hasta);
    if (reg.instrumento) params.set('rinst', reg.instrumento);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  function aplicarFiltros(next: Partial<FiltrosTesoreria>) {
    navegar({ ...filtros, ...next }, registro.filtros);
  }

  // ── Registro de Movimientos: filtros propios, aplican con su Buscar ──────
  const [regDesde, setRegDesde] = useState(registro.filtros.desde ?? '');
  const [regHasta, setRegHasta] = useState(registro.filtros.hasta ?? '');
  const [regInstrumento, setRegInstrumento] = useState<string>(registro.filtros.instrumento ?? '');

  function buscarRegistro() {
    if (regDesde && regHasta && regDesde > regHasta) {
      toast.error('En el registro, la fecha Desde no puede ser posterior a Hasta.');
      return;
    }
    navegar(filtros, {
      desde: regDesde || null,
      hasta: regHasta || null,
      instrumento: (regInstrumento || null) as Instrumento | null,
    });
  }

  const hayFiltrosRegistro =
    !!registro.filtros.desde || !!registro.filtros.hasta || !!registro.filtros.instrumento;

  function limpiarRegistro() {
    setBusqueda('');
    setRegDesde('');
    setRegHasta('');
    setRegInstrumento('');
    navegar(filtros, { desde: null, hasta: null, instrumento: null });
  }

  /** Fechas válidas de los campos, o null si falta alguna o están al revés. */
  function fechasValidas(): { desde: string; hasta: string } | null {
    if (!desdeDraft || !hastaDraft) {
      toast.error('Completá las fechas Desde y Hasta.');
      return null;
    }
    if (desdeDraft > hastaDraft) {
      toast.error('La fecha Desde no puede ser posterior a Hasta.');
      return null;
    }
    return { desde: desdeDraft, hasta: hastaDraft };
  }

  function buscar() {
    const fechas = fechasValidas();
    if (fechas) aplicarFiltros(fechas);
  }

  function toggleInstrumento(value: Instrumento) {
    const activo = filtros.instrumentos.includes(value);
    if (activo && filtros.instrumentos.length === 1) {
      toast.info('Tiene que quedar al menos un instrumento seleccionado.');
      return;
    }
    const next = activo
      ? filtros.instrumentos.filter((i) => i !== value)
      : TODOS.filter((i) => i === value || filtros.instrumentos.includes(i));
    // Se llevan también las fechas escritas, para no perderlas al tocar un chip.
    const fechas =
      desdeDraft && hastaDraft && desdeDraft <= hastaDraft
        ? { desde: desdeDraft, hasta: hastaDraft }
        : {};
    aplicarFiltros({ ...fechas, instrumentos: next });
  }

  const hayFiltros =
    filtros.desde !== hoy || filtros.hasta !== hoy || filtros.instrumentos.length !== TODOS.length;

  function limpiarFiltros() {
    setDesdeDraft(hoy);
    setHastaDraft(hoy);
    aplicarFiltros({ desde: hoy, hasta: hoy, instrumentos: TODOS });
  }

  // ── Búsqueda (lupa) del registro, sobre lo que ya trajo el server ────────
  const q = normalizarBusqueda(busqueda);
  const filtradas = useMemo(() => {
    const base = registro.lineas;
    if (!q) return base;
    return base.filter((l) =>
      normalizarBusqueda(
        [
          l.numero,
          l.detalle,
          l.rubro ?? '',
          l.subrubro ?? '',
          l.observaciones ?? '',
          labelInstrumento(l.instrumento),
        ].join(' '),
      ).includes(q),
    );
  }, [registro.lineas, q]);

  // ── Exportar ─────────────────────────────────────────────────────────────
  const columnasExport = [
    'Fecha',
    'Nº',
    'Tipo',
    'Detalle',
    'Instrumento',
    'Rubro',
    'Subrubro',
    'Ingreso',
    'Egreso',
    'Saldo',
    'Observaciones',
    'Datos del instrumento',
  ];
  function filasExport(origen: LineaTesoreria[]): string[][] {
    return origen.map((l) => [
      ymdALegible(l.fecha),
      l.numero,
      l.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
      l.detalle,
      labelInstrumento(l.instrumento),
      l.rubro ?? '',
      l.subrubro ?? '',
      l.tipo === 'ingreso' ? fmtMoney(l.monto) : '',
      l.tipo === 'egreso' ? fmtMoney(l.monto) : '',
      fmtMoney(l.saldo),
      l.observaciones ?? '',
      resumenDatosInstrumento(l.instrumento, l.datos),
    ]);
  }

  const [exportando, setExportando] = useState<'xlsx' | 'pdf' | 'listado' | null>(null);

  /** Exporta SOLO los registros del listado (filtros + búsqueda), a Excel o PDF. */
  async function exportarRegistro(formato: 'xlsx' | 'pdf') {
    setExportando(formato === 'xlsx' ? 'xlsx' : 'listado');
    try {
      const periodo = textoPeriodo(registro.filtros);
      const inst = registro.filtros.instrumento
        ? ` · ${labelInstrumento(registro.filtros.instrumento)}`
        : '';
      await exportarTabla(formato, {
        nombre: 'registro-de-movimientos',
        titulo: `Registro de Movimientos · ${periodo}${inst}`,
        columnas: columnasExport,
        filas: filasExport(filtradas),
      });
    } catch {
      toast.error(
        formato === 'xlsx' ? 'No se pudo generar el Excel.' : 'No se pudo generar el PDF.',
      );
    } finally {
      setExportando(null);
    }
  }

  /**
   * Cierre de caja en PDF. `alcance` = 'resumen' (todas las cajas del filtro,
   * con fila Consolidado) o un instrumento (solo esa caja: sus saldos y sus
   * movimientos, con el saldo acumulado recalculado para ese instrumento).
   * Pedido del cliente 2026-10-13: elegirlo en un desplegable.
   */
  async function descargarCierre(alcance: 'resumen' | Instrumento) {
    setExportando('pdf');
    try {
      const fila = (r: ResumenInstrumento) => ({
        instrumento:
          r.instrumento === 'consolidado' ? 'Consolidado' : labelInstrumento(r.instrumento),
        saldoInicial: fmtMoney(r.saldoInicial),
        ingresos: fmtMoney(r.ingresos),
        egresos: fmtMoney(r.egresos),
        saldoFinal: fmtMoney(r.saldoFinal),
      });
      // Dólares: debajo de la fila en pesos va la misma fila en USD (pedido del
      // cliente: el cierre tiene que mostrar el saldo en dólares).
      const conUsd = (r: ResumenInstrumento) =>
        r.usd
          ? [
              fila(r),
              {
                instrumento: `${labelInstrumento(r.instrumento)} · saldo en USD`,
                saldoInicial: fmtUsd(r.usd.saldoInicial),
                ingresos: fmtUsd(r.usd.ingresos),
                egresos: fmtUsd(r.usd.egresos),
                saldoFinal: fmtUsd(r.usd.saldoFinal),
              },
            ]
          : [fila(r)];

      let filasResumen;
      let consolidadoFila: ReturnType<typeof fila>;
      let lineasPdf: LineaTesoreria[];
      // Los anulados no van al cierre: no movieron la caja.
      const vigentes = lineas.filter((l) => !l.anulado);
      if (alcance === 'resumen') {
        filasResumen = resumen.flatMap(conUsd);
        consolidadoFila = fila(consolidado);
        lineasPdf = vigentes;
      } else {
        const r = resumen.find((x) => x.instrumento === alcance);
        if (!r) {
          toast.error('Ese instrumento no está en el filtro de la pantalla.');
          return;
        }
        filasResumen = conUsd(r);
        // El PDF rotula esta fila "Consolidado · <instrumento elegido>".
        consolidadoFila = fila(r);
        lineasPdf = vigentes.filter((l) => l.instrumento === alcance);
      }

      // Totales de las columnas Ingreso y Egreso del detalle (y en USD cuando
      // hay movimientos en dólares). Salen de las mismas líneas del detalle.
      const suma = (tipo: 'ingreso' | 'egreso', usd = false) =>
        Math.round(
          lineasPdf
            .filter((l) => l.tipo === tipo)
            .reduce((acc, l) => acc + (usd ? (l.montoUsd ?? 0) : l.monto), 0) * 100,
        ) / 100;
      const hayUsd = lineasPdf.some((l) => l.montoUsd != null);

      // El cierre lleva el período completo (sin la búsqueda): es un documento
      // contable, no "lo que estoy mirando". Sin la columna Saldo (pedido del
      // cliente): las columnas son las 9 primeras de la exportación.
      await generarCierreCajaPdf({
        club: { ...club, lugar: club.ciudad },
        periodo: { desde: filtros.desde, hasta: filtros.hasta },
        seleccion: alcance === 'resumen' ? 'Resumen' : labelInstrumento(alcance),
        esResumen: alcance === 'resumen',
        resumen: filasResumen,
        consolidado: consolidadoFila,
        columnas: columnasExport.slice(0, 9),
        filas: filasExport(lineasPdf).map((f) => f.slice(0, 9)),
        totales: {
          ingresos: fmtMoney(suma('ingreso')),
          egresos: fmtMoney(suma('egreso')),
          ...(hayUsd
            ? {
                ingresosUsd: fmtUsd(suma('ingreso', true)),
                egresosUsd: fmtUsd(suma('egreso', true)),
              }
            : {}),
        },
      });
    } catch {
      toast.error('No se pudo generar el PDF.');
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Tesorería</h1>
          <p className="page-subtitle">
            Caja del club por instrumento: cobranzas, retiros, gastos y depósitos.
          </p>
        </div>
        <div>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: '#175861' }}
          >
            <Plus className="h-4 w-4" />
            Nuevo movimiento
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* ── Bloque 1: Cierre de caja ───────────────────────────────────── */}
        <div>
          <h2 className="text-base font-bold" style={{ color: '#101828' }}>
            Cierre de caja
          </h2>
          <p className="text-sm text-gray-500">
            Saldos por instrumento del período elegido. Lo anterior al Desde queda en el saldo
            inicial.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-gray-500" htmlFor="tesoreria-desde">
              Desde
            </label>
            <input
              id="tesoreria-desde"
              type="date"
              required
              value={desdeDraft}
              max={hastaDraft || undefined}
              onChange={(e) => setDesdeDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
              className={filtroCls}
            />
            <label className="text-xs font-medium text-gray-500" htmlFor="tesoreria-hasta">
              Hasta
            </label>
            <input
              id="tesoreria-hasta"
              type="date"
              required
              value={hastaDraft}
              min={desdeDraft || undefined}
              onChange={(e) => setHastaDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
              className={filtroCls}
            />
            <button
              type="button"
              onClick={buscar}
              disabled={isPending}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: '#175861' }}
            >
              <Search className="h-4 w-4" />
              {isPending ? 'Buscando…' : 'Buscar'}
            </button>
            {hayFiltros && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="inline-flex h-10 items-center gap-1 rounded-[10px] border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Limpiar
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Instrumentos</span>
          {INSTRUMENTOS.map((i) => {
            const activo = filtros.instrumentos.includes(i.value as Instrumento);
            return (
              <button
                key={i.value}
                type="button"
                aria-pressed={activo}
                onClick={() => toggleInstrumento(i.value as Instrumento)}
                className={
                  activo
                    ? 'rounded-full border border-[#175861] bg-teal-50 px-3 py-1 text-xs font-medium text-[#175861]'
                    : 'rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-50'
                }
              >
                {i.label}
              </button>
            );
          })}
        </div>

        {/* ── Saldos por instrumento ────────────────────────────────────── */}
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-3">Instrumento</th>
                <th className="px-4 py-3 text-right">Saldo inicial</th>
                <th className="px-4 py-3 text-right">Ingresos</th>
                <th className="px-4 py-3 text-right">Egresos</th>
                <th className="px-4 py-3 text-right">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.instrumento} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-gray-700">
                    {labelInstrumento(r.instrumento)}
                    {r.usd && <div className="text-xs text-gray-400">en dólares</div>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-gray-700">
                    {fmtMoney(r.saldoInicial)}
                    {r.usd && (
                      <div className="text-xs text-gray-400">{fmtUsd(r.usd.saldoInicial)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-[#175861]">
                    {fmtMoney(r.ingresos)}
                    {r.usd && <div className="text-xs text-gray-400">{fmtUsd(r.usd.ingresos)}</div>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-red-600">
                    {fmtMoney(r.egresos)}
                    {r.usd && <div className="text-xs text-gray-400">{fmtUsd(r.usd.egresos)}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-900">
                    {fmtMoney(r.saldoFinal)}
                    {r.usd && (
                      <div className="text-xs font-semibold text-gray-500">
                        {fmtUsd(r.usd.saldoFinal)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#F4F8F8] font-semibold text-gray-900">
                <td className="px-4 py-3">Consolidado</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {fmtMoney(consolidado.saldoInicial)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-[#175861]">
                  {fmtMoney(consolidado.ingresos)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-red-600">
                  {fmtMoney(consolidado.egresos)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {fmtMoney(consolidado.saldoFinal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {textoPeriodo(filtros)} · {lineas.filter((l) => !l.anulado).length}{' '}
            {lineas.filter((l) => !l.anulado).length === 1 ? 'movimiento' : 'movimientos'}
            {isPending && ' · actualizando…'}
          </p>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={exportando !== null}
                  title="Cierre de caja en PDF"
                  className={botonExportCls}
                >
                  <FileDown className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {exportando === 'pdf' ? 'Generando…' : 'Cierre de caja (PDF)'}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void descargarCierre('resumen')}>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Resumen</span>
                    <span className="text-xs text-gray-500">
                      Todos los instrumentos del filtro, con el consolidado
                    </span>
                  </div>
                </DropdownMenuItem>
                {resumen.map((r) =>
                  r.instrumento === 'consolidado' ? null : (
                    <DropdownMenuItem
                      key={r.instrumento}
                      onSelect={() => void descargarCierre(r.instrumento as Instrumento)}
                    >
                      <span className="text-sm">{labelInstrumento(r.instrumento)}</span>
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── Bloque 2: Registro de Movimientos (independiente del cierre) ── */}
        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-base font-bold" style={{ color: '#101828' }}>
            Registro de Movimientos
          </h2>
          <p className="text-sm text-gray-500">
            Todos los movimientos registrados. Filtrá por instrumento y fechas; el cierre de arriba
            no cambia.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por detalle, Nº, rubro u observaciones"
              aria-label="Buscar movimientos"
              className={`${filtroCls} w-full pl-9`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Instrumento"
              value={regInstrumento}
              onChange={(e) => setRegInstrumento(e.target.value)}
              className={filtroCls}
            >
              <option value="">Todos los instrumentos</option>
              {INSTRUMENTOS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
            <label className="text-xs font-medium text-gray-500" htmlFor="registro-desde">
              Desde
            </label>
            <input
              id="registro-desde"
              type="date"
              value={regDesde}
              max={regHasta || undefined}
              onChange={(e) => setRegDesde(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarRegistro()}
              className={filtroCls}
            />
            <label className="text-xs font-medium text-gray-500" htmlFor="registro-hasta">
              Hasta
            </label>
            <input
              id="registro-hasta"
              type="date"
              value={regHasta}
              min={regDesde || undefined}
              onChange={(e) => setRegHasta(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarRegistro()}
              className={filtroCls}
            />
            <button
              type="button"
              onClick={buscarRegistro}
              disabled={isPending}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: '#175861' }}
            >
              <Search className="h-4 w-4" />
              {isPending ? 'Buscando…' : 'Buscar'}
            </button>
            {(hayFiltrosRegistro || busqueda.trim() !== '') && (
              <button
                type="button"
                onClick={limpiarRegistro}
                className="inline-flex h-10 items-center gap-1 rounded-[10px] border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Limpiar
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {textoPeriodo(registro.filtros)}
            {registro.filtros.instrumento && ` · ${labelInstrumento(registro.filtros.instrumento)}`}
            {' · '}
            {filtradas.length} {filtradas.length === 1 ? 'registro' : 'registros'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void exportarRegistro('pdf')}
              disabled={exportando !== null}
              title="Listado en PDF"
              className={botonExportCls}
            >
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">
                {exportando === 'listado' ? 'Generando…' : 'PDF'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void exportarRegistro('xlsx')}
              disabled={exportando !== null}
              title="Descargar en Excel"
              className={botonExportCls}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">
                {exportando === 'xlsx' ? 'Exportando…' : 'Excel'}
              </span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          {filtradas.length === 0 ? (
            <EmptyState
              icon={<Landmark className="h-6 w-6" />}
              text="Sin registros"
              description="No hay cobranzas ni movimientos de caja con esos filtros."
            />
          ) : (
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3">Instrumento</th>
                  <th className="px-4 py-3">Rubro</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Adjunto</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => (
                  <tr
                    key={l.id}
                    className={`border-b border-gray-100 last:border-0 ${
                      l.anulado ? 'text-gray-400 line-through' : ''
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {ymdALegible(l.fecha)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {l.reciboId ? (
                        <Link
                          href={`/ventas/recibo/${l.reciboId}?from=tesoreria`}
                          className="font-medium text-[#175861] hover:underline"
                        >
                          {l.numero}
                        </Link>
                      ) : (
                        <span className="text-gray-700">{l.numero}</span>
                      )}
                      {l.anulado && (
                        <span
                          className="ml-2 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 no-underline"
                          title={
                            l.anuladoAt
                              ? `Anulado el ${ymdALegible(l.anuladoAt.slice(0, 10))}`
                              : 'Anulado'
                          }
                        >
                          Anulado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      <div>{l.detalle}</div>
                      {l.observaciones && (
                        <div className="mt-0.5 text-xs text-gray-500">{l.observaciones}</div>
                      )}
                      {l.datos && (
                        <div className="mt-0.5 text-xs text-gray-400">
                          {resumenDatosInstrumento(l.instrumento, l.datos)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {labelInstrumento(l.instrumento)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {l.rubro}
                      {l.subrubro && <span className="text-gray-400"> / {l.subrubro}</span>}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                        l.tipo === 'ingreso' ? 'text-[#175861]' : 'text-red-600'
                      }`}
                    >
                      {l.tipo === 'ingreso' ? '+' : '-'}
                      {fmtMoney(l.monto)}
                      {l.montoUsd != null && (
                        <div className="text-xs font-normal text-gray-400">
                          {l.tipo === 'ingreso' ? '+' : '-'}
                          {fmtUsd(l.montoUsd)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-gray-900">
                      {fmtMoney(l.saldo)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {l.adjuntoUrl ? (
                        <a
                          href={l.adjuntoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={l.adjuntoNombre ?? 'Ver adjunto'}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#175861] hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          Ver
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {l.origen === 'manual' && !l.anulado ? (
                        anulandoId === l.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => anular(l)}
                              disabled={anulando}
                              className="rounded-[8px] bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                            >
                              {anulando ? 'Anulando…' : 'Confirmar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAnulandoId(null)}
                              disabled={anulando}
                              className="rounded-[8px] border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          // Fuera del período del club los botones quedan
                          // deshabilitados con el motivo en el tooltip. El
                          // gate real está en el server.
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditando(l)}
                              disabled={!puedeEditarMovimiento(l.fecha, periodoEdicion)}
                              title={
                                puedeEditarMovimiento(l.fecha, periodoEdicion)
                                  ? undefined
                                  : motivoBloqueoEdicion(periodoEdicion)
                              }
                              className="rounded-[8px] border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => setAnulandoId(l.id)}
                              disabled={!puedeEditarMovimiento(l.fecha, periodoEdicion)}
                              title={
                                puedeEditarMovimiento(l.fecha, periodoEdicion)
                                  ? undefined
                                  : motivoBloqueoEdicion(periodoEdicion)
                              }
                              className="rounded-[8px] border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
                            >
                              Anular
                            </button>
                          </span>
                        )
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editando && (
        <NuevoMovimientoModal
          hoy={hoy}
          periodoCarga={periodoCarga}
          editar={editando}
          onClose={() => setEditando(null)}
          onCreado={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      )}

      {modalOpen && (
        <NuevoMovimientoModal
          hoy={hoy}
          periodoCarga={periodoCarga}
          onClose={() => setModalOpen(false)}
          onCreado={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal "Nuevo movimiento" (misma estructura que "Nueva cobranza") ───────

function NuevoMovimientoModal({
  hoy,
  periodoCarga,
  editar = null,
  onClose,
  onCreado,
}: {
  hoy: string;
  periodoCarga: PeriodoCarga;
  /** Con un movimiento, el modal lo modifica en vez de crear uno nuevo. */
  editar?: LineaTesoreriaUI | null;
  onClose: () => void;
  onCreado: () => void;
}) {
  // Piso de fecha según la configuración del club; el techo es siempre hoy.
  const fechaMinima = fechaMinimaCarga(periodoCarga, hoy);
  const formRef = useRef<HTMLFormElement>(null);
  const [guardando, startGuardar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Rubro y subrubro salen del catálogo (pedido del cliente: nada escrito a
  // mano). El subrubro depende del rubro, por eso el rubro es controlado.
  const [rubro, setRubro] = useState(editar?.rubro ?? '');
  const subrubros = subrubrosDe(rubro);
  // Instrumento controlado: según cuál sea se piden datos adicionales (los
  // mismos que Cobranzas por forma de pago). En dólares el monto en pesos se
  // calcula solo (USD × tipo de cambio) y queda editable.
  const [instrumento, setInstrumento] = useState<Instrumento>(editar?.instrumento ?? 'efectivo');
  const [datos, setDatos] = useState<Record<string, string>>(editar?.datos ?? {});
  const [monto, setMonto] = useState(editar ? editar.monto.toFixed(2) : '');
  const camposInstrumento = CAMPOS_INSTRUMENTO[instrumento];

  function cambiarInstrumento(v: Instrumento) {
    setInstrumento(v);
    setDatos({});
  }

  function setDato(key: string, value: string) {
    const next = { ...datos, [key]: value };
    setDatos(next);
    if (instrumento === 'efectivo_usd') {
      const usd = numeroDecimal(next.usd);
      const tc = numeroDecimal(next.tc);
      if (usd > 0 && tc > 0) setMonto((Math.round(usd * tc * 100) / 100).toFixed(2));
    }
  }

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startGuardar(async () => {
      const res = editar?.movimientoId
        ? await editarMovimientoTesoreriaAction(editar.movimientoId, fd)
        : await crearMovimientoTesoreriaAction(fd);
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(
        editar ? `Movimiento ${res.codigo} guardado.` : `Movimiento ${res.codigo} cargado.`,
      );
      onCreado();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        ref={formRef}
        onSubmit={guardar}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-[18px] font-bold" style={{ color: '#101828' }}>
              {editar ? `Modificar movimiento ${editar.numero}` : 'Nuevo movimiento'}
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
              {editar
                ? 'El tipo y el código no cambian. Si no cargás un adjunto nuevo, se conserva el que tenía.'
                : 'Retiros, gastos, depósitos o ingresos que no son cobranzas. Las cobranzas entran solas desde los recibos.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-gray-200" />

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de movimiento">
              <select
                name="tipo"
                required
                defaultValue={editar?.tipo ?? 'ingreso'}
                disabled={!!editar}
                className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-500`}
              >
                <option value="ingreso">Ingreso (Caja)</option>
                <option value="egreso">Egreso (Caja)</option>
              </select>
            </Field>
            <Field label="Fecha de Registración">
              <input
                name="fecha"
                type="date"
                required
                defaultValue={editar?.fecha ?? hoy}
                min={fechaMinima ?? undefined}
                max={hoy}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-gray-400">
                {fechaMinima === hoy
                  ? 'Solo se puede cargar con la fecha de hoy.'
                  : fechaMinima
                    ? `Desde el ${ymdALegible(fechaMinima)} hasta hoy (${labelPeriodoCarga(periodoCarga)}).`
                    : 'Hasta hoy; no se admiten fechas futuras.'}
              </p>
            </Field>
            <Field label="Instrumento">
              <select
                name="instrumento"
                required
                value={instrumento}
                onChange={(e) => cambiarInstrumento(e.target.value as Instrumento)}
                className={inputCls}
              >
                {INSTRUMENTOS.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={instrumento === 'efectivo_usd' ? 'Monto Pesos (USD × TC)' : 'Monto Pesos'}
            >
              <input
                name="monto"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0,00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className={inputCls}
              />
            </Field>
            {camposInstrumento.length > 0 && (
              <div className="rounded-[10px] border border-gray-200 bg-[#F4F8F8] p-4 sm:col-span-2">
                <p className="mb-3 text-xs font-semibold" style={{ color: '#101828' }}>
                  Datos de {labelInstrumento(instrumento).toLowerCase()}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {camposInstrumento.map((c) => (
                    <Field key={c.key} label={c.requerido ? c.label : `${c.label} (opcional)`}>
                      {c.tipo === 'select' ? (
                        <select
                          name={`datos.${c.key}`}
                          required={c.requerido}
                          value={datos[c.key] ?? ''}
                          onChange={(e) => setDato(c.key, e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Seleccione...</option>
                          {c.opciones?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          name={`datos.${c.key}`}
                          type={c.tipo === 'date' ? 'date' : 'text'}
                          inputMode={c.tipo === 'decimal' ? 'decimal' : undefined}
                          required={c.requerido}
                          maxLength={c.key === 'ultimos4' ? 4 : 120}
                          placeholder={c.placeholder}
                          value={datos[c.key] ?? ''}
                          onChange={(e) => setDato(c.key, e.target.value)}
                          className={inputCls}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            )}
            <Field label="Rubro">
              <select
                name="rubro"
                required
                value={rubro}
                onChange={(e) => setRubro(e.target.value)}
                className={inputCls}
              >
                <option value="">Elegí un rubro</option>
                {RUBROS.map((r) => (
                  <option key={r.rubro} value={r.rubro}>
                    {r.rubro}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subrubro">
              {/* key={rubro}: al cambiar el rubro el select vuelve a "Elegí…" */}
              <select
                key={rubro}
                name="subrubro"
                required
                disabled={!rubro}
                defaultValue={editar && editar.rubro === rubro ? (editar.subrubro ?? '') : ''}
                className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}
              >
                <option value="">{rubro ? 'Elegí un subrubro' : 'Primero elegí el rubro'}</option>
                {subrubros.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Detalle">
                <input
                  name="detalle"
                  required
                  maxLength={200}
                  defaultValue={editar?.detalle ?? ''}
                  placeholder="Qué fue este movimiento"
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Observaciones">
                <textarea
                  name="observaciones"
                  required
                  maxLength={1000}
                  rows={2}
                  defaultValue={editar?.observaciones ?? ''}
                  className="w-full rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#101828] focus:border-[#175861] focus:ring-1 focus:ring-[#175861] focus:outline-none"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field
                label={
                  editar?.adjuntoNombre
                    ? 'Reemplazar comprobante adjunto (opcional)'
                    : 'Comprobante adjunto (opcional)'
                }
              >
                <input
                  name="adjunto"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-[10px] file:border file:border-gray-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50"
                />
                <p className="mt-1 text-xs text-gray-400">
                  {editar?.adjuntoNombre
                    ? `Actual: ${editar.adjuntoNombre}. PDF, JPG, PNG o WebP, hasta 8 MB.`
                    : 'PDF, JPG, PNG o WebP, hasta 8 MB.'}
                </p>
              </Field>
            </div>
          </div>
          {error && (
            <div className="rounded-[10px] border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 p-6">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[10px] border border-[#d1d5dc] bg-white py-2.5 text-sm font-medium text-[#364153] transition hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 rounded-[10px] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: '#175861' }}
            >
              {guardando ? 'Guardando…' : editar ? 'Guardar cambios' : 'Guardar movimiento'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
