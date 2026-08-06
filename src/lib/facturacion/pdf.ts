import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { facturacion, guarderiaCentrosEmisores } from '@/lib/db/schema';
import { consultarComprobante, type TusFacturasCredentials } from '@/lib/tusfacturas/client';
import { TIPO_DB_API } from '@/lib/tusfacturas/mappers';

export type RegenerarPdfResult = { url?: string; error?: string };

// Regenera un link fresco del PDF de un comprobante fiscal (ARCA) vía TusFacturas
// y lo persiste en `facturacion.archivo`. El `archivo` que se guarda al emitir es
// una URL TEMPORAL de TusFacturas: al tiempo vence y su página muestra "no se ha
// encontrado información asociada a tu búsqueda". La consulta no consume requests
// del plan y devuelve un link recién generado.
//
// Gemelo del server action `obtenerPdfFacturaAction` (actions/facturacion.ts), que
// es el que usa el admin web. Este helper NO valida permisos ni rol: el caller es
// responsable de haber verificado que `gId` es la guardería dueña del comprobante
// (admin de esa guardería, o el socio dueño desde la app mobile vía
// /api/facturas/pdf).
export async function regenerarPdfComprobante(
  facturaId: string,
  gId: string,
): Promise<RegenerarPdfResult> {
  const [f] = await db
    .select({
      codigo: facturacion.codigo,
      tipoFactura: facturacion.tipoFactura,
    })
    .from(facturacion)
    .where(and(eq(facturacion.id, facturaId), eq(facturacion.guarderiaId, gId)))
    .limit(1);
  if (!f) return { error: 'Comprobante no encontrado.' };

  const tipoApi = TIPO_DB_API[f.tipoFactura ?? ''];
  if (!tipoApi) return { error: 'Este comprobante no es fiscal — no tiene PDF de ARCA.' };

  // codigo = comprobante_nro de TusFacturas, formato "PPPPP-NNNNNNNN".
  const [pv, nro] = (f.codigo ?? '').split('-');
  if (!pv || !nro) {
    return { error: 'Este comprobante no tiene número de ARCA (puede haber quedado rechazado).' };
  }

  // Creds del centro emisor que emitió este comprobante (el POS va en el prefijo
  // del codigo) — con varios centros, las del principal no sirven para consultar
  // un comprobante de otro POS.
  const creds = await cargarCredsPorPuntoVenta(gId, parseInt(pv, 10));
  if (!creds) return { error: 'Faltan las credenciales de TusFacturas de la guardería.' };

  try {
    const rta = await consultarComprobante(
      {
        tipo: tipoApi,
        punto_venta: String(parseInt(pv, 10)),
        numero: String(parseInt(nro, 10)),
      },
      creds,
    );
    // La consulta anida los datos dentro de `comprobante` (la emisión los trae en
    // la raíz — por eso el fallback).
    const pdfUrl =
      rta.comprobante?.comprobante_pdf_url ?? (rta.comprobante_pdf_url as string | undefined);
    if (!pdfUrl) return { error: 'TusFacturas no devolvió el PDF de este comprobante.' };

    // Refrescar el link guardado, así queda el más nuevo disponible.
    await db.update(facturacion).set({ archivo: pdfUrl }).where(eq(facturacion.id, facturaId));

    return { url: pdfUrl };
  } catch (err) {
    console.error('[regenerarPdfComprobante]', facturaId, err);
    return {
      error: err instanceof Error ? err.message : 'No se pudo obtener el PDF del comprobante.',
    };
  }
}

async function cargarCredsPorPuntoVenta(
  gId: string,
  puntoVenta: number,
): Promise<TusFacturasCredentials | null> {
  const [centro] = await db
    .select({
      apikey: guarderiaCentrosEmisores.apikey,
      apitoken: guarderiaCentrosEmisores.apitoken,
      usertoken: guarderiaCentrosEmisores.usertoken,
    })
    .from(guarderiaCentrosEmisores)
    .where(
      and(
        eq(guarderiaCentrosEmisores.guarderiaId, gId),
        eq(guarderiaCentrosEmisores.puntoDeVenta, puntoVenta),
      ),
    )
    .limit(1);

  if (!centro?.apikey || !centro.apitoken || !centro.usertoken) return null;
  return { apikey: centro.apikey, apitoken: centro.apitoken, usertoken: centro.usertoken };
}
