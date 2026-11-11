'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import type { PersonaSelector } from '@/lib/legajo/consultas';
import { agregarCatalogoAction } from '@/app/actions/catalogos-club';
import { LABEL_CATALOGO, unirOpciones, type Opcion, type TipoCatalogo } from '@/lib/catalogos-club';

/** Mismas clases que el Input de shadcn (el ring neutro es decisión de diseño: no se pisa). */
export const inputCls =
  'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50';

export const textareaCls =
  'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-[88px] w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]';

export const botonPrimario =
  'rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0f4249] disabled:cursor-not-allowed disabled:opacity-60';

export const botonSecundario =
  'rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60';

export function Campo({
  label,
  requerido,
  ayuda,
  className,
  children,
}: {
  label: string;
  requerido?: boolean;
  ayuda?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {requerido && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {ayuda && <p className="mt-1 text-xs text-gray-500">{ayuda}</p>}
    </div>
  );
}

export function Tarjeta({
  titulo,
  descripcion,
  acciones,
  children,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold" style={{ color: '#101828' }}>
            {titulo}
          </h2>
          {descripcion && <p className="mt-0.5 text-sm text-gray-500">{descripcion}</p>}
        </div>
        {acciones && <div className="shrink-0">{acciones}</div>}
      </div>
      {children}
    </section>
  );
}

/** Select nativo con las mismas clases de tokens que el Input. */
export function Selector({
  value,
  onChange,
  opciones,
  placeholder = 'Elegí una opción',
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones: Opcion[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={inputCls}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {opciones.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── Listas desplegables que el club puede ampliar ──────────────────────────

const AGREGAR = '__agregar__';

/** Agrega un valor a la lista del club y devuelve el valor guardado (o null si falló). */
function useAgregarCatalogo(tipo: TipoCatalogo) {
  const [pending, startTransition] = useTransition();
  const agregar = (valor: string, alExito: (v: string) => void) => {
    startTransition(async () => {
      const res = await agregarCatalogoAction(tipo, valor);
      if (res.error || !res.valor) {
        toast.error(res.error ?? 'No se pudo agregar.');
        return;
      }
      alExito(res.valor);
    });
  };
  return { pending, agregar };
}

function NuevoValor({
  tipo,
  onAgregado,
  onCancelar,
}: {
  tipo: TipoCatalogo;
  onAgregado: (v: string) => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const { pending, agregar } = useAgregarCatalogo(tipo);
  const confirmar = () => agregar(texto, onAgregado);
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        className={inputCls}
        value={texto}
        maxLength={80}
        placeholder={`Escribí la opción nueva (${LABEL_CATALOGO[tipo]})`}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirmar();
          }
          if (e.key === 'Escape') onCancelar();
        }}
      />
      <button
        type="button"
        className={botonPrimario}
        disabled={pending || texto.trim().length < 2}
        onClick={confirmar}
      >
        {pending ? '…' : 'Agregar'}
      </button>
      <button type="button" className={botonSecundario} onClick={onCancelar} aria-label="Cancelar">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Lista desplegable de una sola opción, con "Agregar nuevo…" al final. */
export function CatalogoSelect({
  tipo,
  value,
  onChange,
  opciones,
  placeholder = 'Elegí una opción',
}: {
  tipo: TipoCatalogo;
  value: string;
  onChange: (v: string) => void;
  opciones: string[];
  placeholder?: string;
}) {
  const [extra, setExtra] = useState<string[]>([]);
  const [agregando, setAgregando] = useState(false);
  // El valor ya guardado siempre figura, aunque ya no esté entre las sugerencias.
  const lista = unirOpciones(opciones, extra, value ? [value] : []);

  if (agregando) {
    return (
      <NuevoValor
        tipo={tipo}
        onCancelar={() => setAgregando(false)}
        onAgregado={(v) => {
          setExtra((x) => [...x, v]);
          onChange(v);
          setAgregando(false);
        }}
      />
    );
  }
  return (
    <select
      className={inputCls}
      value={value}
      onChange={(e) => (e.target.value === AGREGAR ? setAgregando(true) : onChange(e.target.value))}
    >
      <option value="">{placeholder}</option>
      {lista.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={AGREGAR}>＋ Agregar otra opción…</option>
    </select>
  );
}

/** Selección múltiple (varias sedes, ubicaciones o bienes de uso): chips + desplegable. */
export function CatalogoMulti({
  tipo,
  value,
  onChange,
  opciones,
  placeholder,
}: {
  tipo: TipoCatalogo;
  value: string[];
  onChange: (v: string[]) => void;
  opciones: string[];
  placeholder: string;
}) {
  const [extra, setExtra] = useState<string[]>([]);
  const [agregando, setAgregando] = useState(false);
  const lista = unirOpciones(opciones, extra, value);
  const disponibles = lista.filter((o) => !value.includes(o));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-[#D9EBE9] px-2.5 py-1 text-xs font-medium text-[#175861]"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                aria-label={`Quitar ${v}`}
                className="rounded-full p-0.5 hover:bg-white/60"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {agregando ? (
        <NuevoValor
          tipo={tipo}
          onCancelar={() => setAgregando(false)}
          onAgregado={(v) => {
            setExtra((x) => [...x, v]);
            if (!value.includes(v)) onChange([...value, v]);
            setAgregando(false);
          }}
        />
      ) : (
        <select
          className={inputCls}
          value=""
          onChange={(e) => {
            if (e.target.value === AGREGAR) setAgregando(true);
            else if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="">{value.length === 0 ? placeholder : 'Sumar otra…'}</option>
          {disponibles.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value={AGREGAR}>＋ Agregar otra opción…</option>
        </select>
      )}
    </div>
  );
}

/** Varias personas (a quienes reporta, empleados autorizados…): chips + desplegable. */
export function PersonasMulti({
  value,
  onChange,
  personas,
  vacio,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  personas: PersonaSelector[];
  vacio: string;
}) {
  const nombre = (id: string) =>
    personas.find((p) => p.value === id)?.label ?? 'Persona dada de baja';
  const disponibles = personas.filter((p) => !value.includes(p.value));
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-[#D9EBE9] px-2.5 py-1 text-xs font-medium text-[#175861]"
            >
              {nombre(id)}
              <button
                type="button"
                aria-label="Quitar"
                onClick={() => onChange(value.filter((x) => x !== id))}
                className="rounded-full p-0.5 hover:bg-white/60"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {personas.length === 0 ? (
        <p className="text-xs text-gray-500">{vacio}</p>
      ) : (
        <select
          className={inputCls}
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        >
          <option value="">{value.length === 0 ? 'Elegí una persona' : 'Sumar otra…'}</option>
          {disponibles.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
              {p.detalle ? ` · ${p.detalle}` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function IconoMas() {
  return <Plus className="h-4 w-4" />;
}

/**
 * Ejecuta una acción del servidor mostrando el resultado con un toast y refrescando la
 * pantalla. El campo "aviso" es un mensaje informativo que devuelve la acción (se hizo, pero
 * conviene que el admin lo sepa).
 */
export function useAccion() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ejecutar = (
    fn: () => Promise<{ error?: string; aviso?: string }>,
    mensajeOk?: string,
    despues?: () => void,
  ) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (mensajeOk) toast.success(mensajeOk);
      if (res.aviso) toast.warning(res.aviso, { duration: 12000 });
      despues?.();
      router.refresh();
    });
  };
  return { pending, ejecutar };
}
