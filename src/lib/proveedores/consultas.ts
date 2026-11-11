/**
 * Consultas del maestro de proveedores (solo servidor). Todas reciben el `guarderia_id` del
 * admin actual y filtran por él; los datos salen serializables para pasarlos a las pantallas.
 */

import { and, asc, eq } from 'drizzle-orm';

import { firmarArchivos } from '@/lib/archivos-privados';
import { unirOpciones, type CatalogosDisponibles } from '@/lib/catalogos-club';
import { catalogosBaseDelClub } from '@/lib/catalogos-club-server';
import { todayArg } from '@/lib/dates';
import { db } from '@/lib/db';
import { proveedorCuentasBancarias, proveedorDocumentos, proveedores } from '@/lib/db/schema';

// ─── Lista ──────────────────────────────────────────────────────────────────

export type FilaProveedor = {
  id: string;
  codigo: string;
  nombre: string;
  nombreComercial: string | null;
  cuit: string | null;
  tipoSujeto: string | null;
  areaSector: string | null;
  estado: string;
  condicionIva: string | null;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  provincia: string | null;
  /** Requisitos obligatorios que todavía no presentó. */
  requisitosPendientes: number;
  /** Requisitos presentados cuyo vencimiento ya pasó. */
  requisitosVencidos: number;
};

export async function listarProveedores(gId: string): Promise<FilaProveedor[]> {
  const [provs, docs] = await Promise.all([
    db
      .select()
      .from(proveedores)
      .where(eq(proveedores.guarderiaId, gId))
      .orderBy(asc(proveedores.nombre)),
    db
      .select({
        proveedorId: proveedorDocumentos.proveedorId,
        clave: proveedorDocumentos.clave,
        obligatorio: proveedorDocumentos.obligatorio,
        presentado: proveedorDocumentos.presentado,
        vencimiento: proveedorDocumentos.vencimiento,
      })
      .from(proveedorDocumentos)
      .where(eq(proveedorDocumentos.guarderiaId, gId)),
  ]);

  const hoy = todayArg();
  const pendientes = new Map<string, number>();
  const vencidos = new Map<string, number>();
  for (const d of docs) {
    if (d.clave) continue; // los adjuntos fijos no son requisitos para ingresar
    if (d.obligatorio && !d.presentado) {
      pendientes.set(d.proveedorId, (pendientes.get(d.proveedorId) ?? 0) + 1);
    }
    if (d.presentado && d.vencimiento && d.vencimiento < hoy) {
      vencidos.set(d.proveedorId, (vencidos.get(d.proveedorId) ?? 0) + 1);
    }
  }

  return provs.map((p) => ({
    id: p.id,
    codigo: p.codigo ?? '',
    nombre: p.nombre,
    nombreComercial: p.nombreComercial,
    cuit: p.cuit,
    tipoSujeto: p.tipoSujeto,
    areaSector: p.areaSector,
    estado: p.estado ?? 'activo',
    condicionIva: p.condicionIva,
    telefono: p.telefono,
    email: p.email,
    ciudad: p.ciudad,
    provincia: p.provincia,
    requisitosPendientes: pendientes.get(p.id) ?? 0,
    requisitosVencidos: vencidos.get(p.id) ?? 0,
  }));
}

// ─── Un proveedor completo ──────────────────────────────────────────────────

export type ProveedorDetalle = {
  proveedor: {
    id: string;
    numero: number | null;
    codigo: string;
    nombre: string;
    nombreComercial: string | null;
    tipoSujeto: string | null;
    areaSector: string | null;
    estado: string;
    cuit: string | null;
    condicionIva: string | null;
    condicionIibb: string | null;
    actividades: string[];
    retenciones: string[];
    certificadoRetencion: boolean;
    certRetDesde: string | null;
    certRetHasta: string | null;
    certRetPorcentaje: string | null;
    dirFiscalCalle: string | null;
    dirFiscalNumero: string | null;
    dirFiscalInterior: string | null;
    dirComercialCalle: string | null;
    dirComercialNumero: string | null;
    dirComercialInterior: string | null;
    codigoPostal: string | null;
    ciudad: string | null;
    provincia: string | null;
    pais: string;
    cuentasContables: string[];
    moneda: string;
    condicionPago: string | null;
    formaPago: string | null;
    contactoNombre: string | null;
    telefono: string | null;
    email: string | null;
    notas: string | null;
  };
  cuentas: {
    id: string;
    banco: string | null;
    tipoCuenta: string | null;
    nroCuenta: string | null;
    cbu: string | null;
    alias: string | null;
    titular: string | null;
    observaciones: string | null;
  }[];
  /** Adjuntos fijos de la pestaña fiscal, por clave. */
  adjuntosFijos: Record<string, { id: string; nombre: string | null; url: string | null }>;
  requisitos: {
    id: string;
    requisito: string;
    obligatorio: boolean;
    presentado: boolean;
    vencimiento: string | null;
    notas: string | null;
    archivoNombre: string | null;
    url: string | null;
  }[];
};

export async function obtenerProveedor(gId: string, id: string): Promise<ProveedorDetalle | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await db
    .select()
    .from(proveedores)
    .where(and(eq(proveedores.id, id), eq(proveedores.guarderiaId, gId)))
    .limit(1);
  if (!p) return null;

  const [cuentas, docs] = await Promise.all([
    db
      .select()
      .from(proveedorCuentasBancarias)
      .where(
        and(
          eq(proveedorCuentasBancarias.proveedorId, id),
          eq(proveedorCuentasBancarias.guarderiaId, gId),
        ),
      )
      .orderBy(asc(proveedorCuentasBancarias.createdAt)),
    db
      .select()
      .from(proveedorDocumentos)
      .where(and(eq(proveedorDocumentos.proveedorId, id), eq(proveedorDocumentos.guarderiaId, gId)))
      .orderBy(asc(proveedorDocumentos.createdAt)),
  ]);

  const urls = await firmarArchivos(docs.map((d) => d.archivoPath));
  const urlDe = (path: string | null) => (path ? (urls.get(path) ?? null) : null);

  const adjuntosFijos: ProveedorDetalle['adjuntosFijos'] = {};
  for (const d of docs) {
    if (d.clave) {
      adjuntosFijos[d.clave] = { id: d.id, nombre: d.archivoNombre, url: urlDe(d.archivoPath) };
    }
  }

  return {
    proveedor: {
      id: p.id,
      numero: p.numero,
      codigo: p.codigo ?? '',
      nombre: p.nombre,
      nombreComercial: p.nombreComercial,
      tipoSujeto: p.tipoSujeto,
      areaSector: p.areaSector,
      estado: p.estado ?? 'activo',
      cuit: p.cuit,
      condicionIva: p.condicionIva,
      condicionIibb: p.condicionIibb,
      actividades: p.actividades,
      retenciones: p.retenciones,
      certificadoRetencion: p.certificadoRetencion,
      certRetDesde: p.certRetDesde,
      certRetHasta: p.certRetHasta,
      certRetPorcentaje: p.certRetPorcentaje,
      dirFiscalCalle: p.dirFiscalCalle,
      dirFiscalNumero: p.dirFiscalNumero,
      dirFiscalInterior: p.dirFiscalInterior,
      dirComercialCalle: p.dirComercialCalle,
      dirComercialNumero: p.dirComercialNumero,
      dirComercialInterior: p.dirComercialInterior,
      codigoPostal: p.codigoPostal,
      ciudad: p.ciudad,
      provincia: p.provincia,
      pais: p.pais,
      cuentasContables: p.cuentasContables,
      moneda: p.moneda,
      condicionPago: p.condicionPago,
      formaPago: p.formaPago,
      contactoNombre: p.contactoNombre,
      telefono: p.telefono,
      email: p.email,
      notas: p.notas,
    },
    cuentas: cuentas.map((c) => ({
      id: c.id,
      banco: c.banco,
      tipoCuenta: c.tipoCuenta,
      nroCuenta: c.nroCuenta,
      cbu: c.cbu,
      alias: c.alias,
      titular: c.titular,
      observaciones: c.observaciones,
    })),
    adjuntosFijos,
    requisitos: docs
      .filter((d) => !d.clave)
      .map((d) => ({
        id: d.id,
        requisito: d.requisito,
        obligatorio: d.obligatorio,
        presentado: d.presentado,
        vencimiento: d.vencimiento,
        notas: d.notas,
        archivoNombre: d.archivoNombre,
        url: urlDe(d.archivoPath),
      })),
  };
}

// ─── Listas desplegables ────────────────────────────────────────────────────

/** Opciones de cada lista: las sugerencias, lo que agregó el club y lo que ya usan sus proveedores. */
export async function catalogosProveedor(gId: string): Promise<CatalogosDisponibles> {
  const [out, usados, reqs] = await Promise.all([
    catalogosBaseDelClub(gId),
    db
      .select({
        areaSector: proveedores.areaSector,
        actividades: proveedores.actividades,
        cuentasContables: proveedores.cuentasContables,
        condicionPago: proveedores.condicionPago,
        formaPago: proveedores.formaPago,
      })
      .from(proveedores)
      .where(eq(proveedores.guarderiaId, gId)),
    db
      .select({ requisito: proveedorDocumentos.requisito, clave: proveedorDocumentos.clave })
      .from(proveedorDocumentos)
      .where(eq(proveedorDocumentos.guarderiaId, gId)),
  ]);
  const unicos = (l: (string | null)[]) => l.filter((x): x is string => !!x);
  out.prov_area = unirOpciones(out.prov_area, unicos(usados.map((u) => u.areaSector)));
  out.prov_actividad = unirOpciones(
    out.prov_actividad,
    usados.flatMap((u) => u.actividades),
  );
  out.prov_cuenta_contable = unirOpciones(
    out.prov_cuenta_contable,
    usados.flatMap((u) => u.cuentasContables),
  );
  out.prov_condicion_pago = unirOpciones(
    out.prov_condicion_pago,
    unicos(usados.map((u) => u.condicionPago)),
  );
  out.prov_forma_pago = unirOpciones(out.prov_forma_pago, unicos(usados.map((u) => u.formaPago)));
  out.prov_documento = unirOpciones(
    out.prov_documento,
    reqs.filter((r) => !r.clave).map((r) => r.requisito),
  );
  return out;
}

/** Proveedores activos para los desplegables de otros módulos (p. ej. quién hizo una reparación). */
export async function proveedoresParaSelector(
  gId: string,
): Promise<{ value: string; label: string; detalle?: string }[]> {
  const rows = await db
    .select({
      id: proveedores.id,
      nombre: proveedores.nombre,
      nombreComercial: proveedores.nombreComercial,
      estado: proveedores.estado,
      areaSector: proveedores.areaSector,
    })
    .from(proveedores)
    .where(eq(proveedores.guarderiaId, gId))
    .orderBy(asc(proveedores.nombre));
  return rows
    .filter((r) => r.estado !== 'inactivo')
    .map((r) => ({
      value: r.id,
      label: r.nombreComercial ? `${r.nombre} (${r.nombreComercial})` : r.nombre,
      detalle: r.areaSector ?? undefined,
    }));
}
