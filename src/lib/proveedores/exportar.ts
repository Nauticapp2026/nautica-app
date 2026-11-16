/**
 * Armado de las columnas y filas de la exportación del maestro de proveedores (Excel y CSV
 * llevan todos los datos; el PDF lleva solo las columnas principales para que se pueda leer).
 * Módulo plano, sin acceso a la base: lo usa la pantalla del navegador.
 */

import { fechaLegible } from '@/lib/documentacion-fechas';
import { TIPOS_CUENTA, labelDe } from '@/lib/legajo/constantes';
import type { FilaProveedor } from '@/lib/proveedores/consultas';
import {
  CONDICIONES_IIBB,
  CONDICIONES_IVA,
  ESTADOS_PROVEEDOR,
  MONEDAS,
  RETENCIONES,
  TIPOS_SUJETO,
} from '@/lib/proveedores/constantes';

/** Las columnas principales (las del PDF). */
export const COLUMNAS_RESUMEN = [
  'Código',
  'Razón social',
  'Nombre comercial',
  'Tipo de sujeto',
  'Área',
  'CUIT',
  'Condición IVA',
  'Estado',
  'Teléfono',
  'Email de facturación',
  'Ciudad',
  'Provincia',
  'Requisitos pendientes',
];

export const filaResumen = (f: FilaProveedor): string[] => [
  f.codigo,
  f.nombre,
  f.nombreComercial ?? '',
  labelDe(TIPOS_SUJETO, f.tipoSujeto),
  f.areaSector ?? '',
  f.cuit ?? '',
  labelDe(CONDICIONES_IVA, f.condicionIva),
  labelDe(ESTADOS_PROVEEDOR, f.estado),
  f.telefono ?? '',
  f.email ?? '',
  f.ciudad ?? '',
  f.provincia ?? '',
  String(f.requisitosPendientes),
];

/** Todos los datos del proveedor (Excel y CSV). */
export const COLUMNAS_COMPLETAS = [
  'Código',
  'Razón social',
  'Nombre comercial',
  'Tipo de sujeto',
  'Área o sector',
  'Estado',
  'CUIT',
  'Proveedor del exterior',
  'Condición frente al IVA',
  'Ingresos Brutos',
  'Nº de Ingresos Brutos',
  'Actividad principal',
  'Pasible de retenciones',
  'Certificado de exclusión',
  'Certificado: impuesto',
  'Certificado: vigente desde',
  'Certificado: vigente hasta',
  'Certificado: % de exclusión',
  'Dirección fiscal',
  'Dirección comercial',
  'Código postal',
  'Ciudad',
  'Provincia',
  'País',
  'Contacto principal',
  'Teléfono',
  'Email de facturación',
  'Cuentas contables',
  'Moneda',
  'Condiciones de pago',
  'Forma de pago preferida',
  'Cuentas bancarias',
  'Requisitos pendientes',
  'Requisitos vencidos',
  'Notas',
];

const lista = (l: string[]) => l.join(', ');

export const filaCompleta = (f: FilaProveedor): string[] => [
  f.codigo,
  f.nombre,
  f.nombreComercial ?? '',
  labelDe(TIPOS_SUJETO, f.tipoSujeto),
  f.areaSector ?? '',
  labelDe(ESTADOS_PROVEEDOR, f.estado),
  f.cuit ?? '',
  f.esExterior ? 'Sí' : 'No',
  labelDe(CONDICIONES_IVA, f.condicionIva),
  labelDe(CONDICIONES_IIBB, f.condicionIibb),
  f.nroIibb ?? '',
  lista(f.actividades),
  lista(f.retenciones.map((r) => labelDe(RETENCIONES, r))),
  f.certificadoRetencion ? 'Sí' : 'No',
  f.certificadoRetencion ? labelDe(RETENCIONES, f.certRetImpuesto) : '',
  f.certificadoRetencion && f.certRetDesde ? fechaLegible(f.certRetDesde) : '',
  f.certificadoRetencion && f.certRetHasta ? fechaLegible(f.certRetHasta) : '',
  f.certificadoRetencion && f.certRetPorcentaje !== null ? `${Number(f.certRetPorcentaje)}%` : '',
  f.dirFiscal,
  f.dirComercial,
  f.codigoPostal ?? '',
  f.ciudad ?? '',
  f.provincia ?? '',
  f.pais,
  f.contactoNombre ?? '',
  f.telefono ?? '',
  f.email ?? '',
  lista(f.cuentasContables),
  labelDe(MONEDAS, f.moneda),
  f.condicionPago ?? '',
  f.formaPago ?? '',
  f.cuentasBancarias
    .map((c) =>
      [
        c.banco,
        c.tipoCuenta && labelDe(TIPOS_CUENTA, c.tipoCuenta),
        c.cbu && `CBU ${c.cbu}`,
        c.alias && `Alias ${c.alias}`,
        c.nroCuenta && `Cuenta ${c.nroCuenta}`,
        c.titular && `Titular ${c.titular}`,
      ]
        .filter(Boolean)
        .join(' · '),
    )
    .join(' | '),
  String(f.requisitosPendientes),
  String(f.requisitosVencidos),
  f.notas ?? '',
];
