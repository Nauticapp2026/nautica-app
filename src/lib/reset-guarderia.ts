/**
 * Reset "de cero" de una guardería (super admin).
 *
 * Deja el club como recién salido del onboarding: conserva su configuración y
 * borra toda la operación. Pedido del cliente 2026-09-15 para clubes de
 * PRUEBA; la decisión explícita fue "todo menos la configuración", numeración
 * de comprobantes desde 1, y sin distinguir facturas aceptadas por ARCA (son
 * clubes de prueba — en uno real, borrar el rastro local de una factura que
 * ARCA sí tiene sería un problema serio).
 *
 * Qué se CONSERVA: la fila de `guarderias` (datos impositivos, plan, creds
 * Payway, fotos, período de anulación, etc.), `guarderia_centros_emisores`,
 * `guarderia_plan_historial`, `horarios_dia`, las memberships del EQUIPO
 * (todo rol distinto de socio), `invitations` y `equipo_invitaciones_pendientes`.
 *
 * Qué se BORRA: socios (membership + cuenta, ver abajo), embarcaciones, toda la
 * estructura de espacios (áreas, marinas, naves, lados, pisos, espacios),
 * tarifario, servicios contratados, cuenta corriente, comprobantes, cobranzas,
 * débitos Payway y tarjetas, portería, tareas, lavados, invitados, accesos,
 * solicitudes de membresía, comunicaciones, mails masivos y publicaciones —
 * con sus archivos en Storage.
 *
 * Dos reglas que salen de cómo está modelada la base:
 *
 * 1. `movimientos_cuenta_corriente` NO tiene guarderia_id: cuelga del socio.
 *    Si un socio está en dos clubes, borrar "sus" movimientos le borra también
 *    los del otro. Por eso el reset se NIEGA si algún socio del club tiene
 *    membership en otra guardería. Hoy no pasa; el código no lo asume.
 *
 * 2. La numeración de comprobantes (RC-/RI-/FM-/FL-/FA-/CM-/CL-/CA-/NCI-) y el
 *    Nº de socio se calculan CONTANDO filas por club, no hay contadores
 *    guardados. Al borrar las filas, el próximo número es 000001 solo. No hay
 *    nada que "resetear" aparte.
 *
 * La función de borrado recibe la transacción por parámetro para poder
 * correrla contra un club real y hacer ROLLBACK (así se verificó antes de
 * exponer el botón). Storage y auth.users van fuera de la transacción: no son
 * transaccionales, y se hacen recién cuando la base ya quedó consistente.
 */

import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { memberships, profiles } from '@/lib/db/schema';
import { createAdminClient } from '@/lib/supabase/admin';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ResumenReset = {
  /** Filas borradas por tabla, en el orden en que se borraron. */
  porTabla: { tabla: string; filas: number }[];
  /** Socios cuya membership se borró. */
  socios: number;
  /** Ids de socio cuyo perfil se borró de la base (cuenta exclusiva del club). */
  perfilesBorrados: string[];
  /** Socios que se desvincularon pero conservan su cuenta (super admins). */
  perfilesConservados: string[];
};

/**
 * Tablas con `guarderia_id` que se vacían para el club, hijas antes que
 * padres. Todas las FK involucradas son CASCADE o SET NULL (verificado en prod
 * el 2026-09-15), así que el orden no es estricto — está para que se lea.
 * Las `backup_*` tienen guarderia_id y NO están acá a propósito.
 */
const TABLAS_CLUB_EN_ORDEN = [
  // Portería y operación
  'alertas',
  'actividad_porteria',
  'porteria', // cascade: porteria_invitados
  'solicitudes_lavado',
  'tareas',
  'invitados',
  'entradas_socio',
  'solicitudes_membership',
  // Plata
  'payway_cobros',
  'payway_tokens',
  'cargos_pendientes',
  'facturacion', // cascade: facturacion_items -> facturacion_item_movimientos
  'socio_servicios_cancelados',
  'socio_servicios',
  'servicios_ajustes_programados',
  'servicios_historial',
  'servicios',
  // Contenido
  'comunicaciones_mails',
  'comunicaciones',
  'publicaciones',
  // Estructura física
  'embarcaciones',
  'espacios',
  'lados', // cascade: pisos
  'naves',
  'marinas',
  'areas', // cascade: area_operarios, area_marineros
  'categorias_amarras',
  'proveedores',
  'restaurantes',
  'tarifas',
] as const;

/** Tablas sin guarderia_id que cuelgan del socio. */
const TABLAS_SOCIO_EN_ORDEN = [
  'movimientos_cuenta_corriente',
  'documentos',
  'datos_facturacion',
] as const;

async function borrarPorColumna(
  tx: Tx,
  tabla: string,
  columna: 'guarderia_id' | 'socio_id' | 'profile_id',
  valores: string[],
): Promise<number> {
  if (valores.length === 0) return 0;
  // Un parámetro por valor (`in ($1, $2, …)`). Pasar el array de JS como un
  // único parámetro `any($1::uuid[])` falló en el driver (probado 2026-09-15).
  const lista = sql.join(
    valores.map((v) => sql`${v}::uuid`),
    sql`, `,
  );
  const res = await tx.execute<{ n: number }>(sql`
    with borradas as (
      delete from ${sql.identifier(tabla)}
      where ${sql.identifier(columna)} in (${lista})
      returning 1
    )
    select count(*)::int as n from borradas
  `);
  const filas = Array.from(res as Iterable<{ n: number }>);
  return Number(filas[0]?.n ?? 0);
}

/**
 * Socios del club que también son socios/staff de OTRA guardería. Si hay
 * alguno, el reset no se puede hacer (ver regla 1 arriba).
 */
export async function sociosCompartidos(
  guarderiaId: string,
): Promise<{ id: string; nombre: string }[]> {
  const rows = await db
    .select({ id: profiles.id, nombre: profiles.nombre, apellido: profiles.apellido })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.rol, 'socio'),
        sql`exists (
          select 1 from ${memberships} m2
          where m2.user_id = ${memberships.userId} and m2.guarderia_id <> ${guarderiaId}
        )`,
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    nombre: [r.nombre, r.apellido].filter(Boolean).join(' ') || r.id,
  }));
}

/**
 * Borra la operación del club dentro de `tx`. No toca Storage ni auth.users.
 * Lanza si algún socio está compartido con otro club.
 */
export async function resetearGuarderiaEnTx(tx: Tx, guarderiaId: string): Promise<ResumenReset> {
  // Se vuelve a chequear ADENTRO de la transacción: entre la pantalla y el
  // click alguien pudo sumar al socio a otro club.
  const compartidos = await sociosCompartidos(guarderiaId);
  if (compartidos.length > 0) {
    throw new Error(
      `No se puede resetear: ${compartidos.map((c) => c.nombre).join(', ')} ${
        compartidos.length === 1 ? 'pertenece' : 'pertenecen'
      } también a otro club, y su cuenta corriente no se puede separar por club.`,
    );
  }

  const sociosRows = await tx
    .select({ id: memberships.userId, superAdmin: profiles.isSuperAdmin })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(and(eq(memberships.guarderiaId, guarderiaId), eq(memberships.rol, 'socio')));
  const socioIds = sociosRows.map((s) => s.id);
  // Un super admin que además figura como socio de un club de prueba: se lo
  // desvincula y se borra su operación, pero su cuenta queda.
  const conservar = new Set(sociosRows.filter((s) => s.superAdmin).map((s) => s.id));
  const aBorrarPerfil = socioIds.filter((id) => !conservar.has(id));

  const porTabla: ResumenReset['porTabla'] = [];

  for (const tabla of TABLAS_CLUB_EN_ORDEN) {
    porTabla.push({
      tabla,
      filas: await borrarPorColumna(tx, tabla, 'guarderia_id', [guarderiaId]),
    });
  }
  for (const tabla of TABLAS_SOCIO_EN_ORDEN) {
    const columna =
      tabla === 'documentos' || tabla === 'datos_facturacion' ? 'profile_id' : 'socio_id';
    porTabla.push({ tabla, filas: await borrarPorColumna(tx, tabla, columna, socioIds) });
  }

  // Memberships de socio de ESTE club (las del equipo quedan).
  const membs = await tx
    .delete(memberships)
    .where(and(eq(memberships.guarderiaId, guarderiaId), eq(memberships.rol, 'socio')))
    .returning({ id: memberships.id });
  porTabla.push({ tabla: 'memberships (socios)', filas: membs.length });

  // Perfiles de los socios exclusivos: al borrarlos cascadean sus restos
  // (tarjetas, aceptación de T&C, lista de compras, etc.). Las FK que no
  // cascadean quedan en NULL (autor de una comunicación, etc.) — verificado.
  if (aBorrarPerfil.length > 0) {
    const perf = await tx
      .delete(profiles)
      .where(and(inArray(profiles.id, aBorrarPerfil), ne(profiles.isSuperAdmin, true)))
      .returning({ id: profiles.id });
    porTabla.push({ tabla: 'profiles (socios)', filas: perf.length });
  }

  return {
    porTabla,
    socios: socioIds.length,
    perfilesBorrados: aBorrarPerfil,
    perfilesConservados: [...conservar],
  };
}

/**
 * Borra los archivos del club en Storage. Best-effort: devuelve los errores en
 * vez de lanzar — la base ya quedó limpia y un archivo huérfano no la rompe.
 *
 * Convenciones de path (ver las actions que suben):
 *   documentos/{socioId}/{archivo}
 *   comunicaciones/{guarderiaId}/{autorId}/{archivo}
 *   publicaciones/{guarderiaId}/{autorId}/{archivo}
 */
export async function limpiarStorageGuarderia(
  guarderiaId: string,
  socioIds: string[],
): Promise<{ archivos: number; errores: string[] }> {
  const admin = createAdminClient();
  const errores: string[] = [];
  let archivos = 0;

  // Lista recursiva acotada: los buckets tienen a lo sumo dos niveles.
  async function listarTodo(bucket: string, prefijo: string, nivel = 0): Promise<string[]> {
    const { data, error } = await admin.storage.from(bucket).list(prefijo, { limit: 1000 });
    if (error) {
      errores.push(`${bucket}/${prefijo}: ${error.message}`);
      return [];
    }
    const paths: string[] = [];
    for (const item of data ?? []) {
      const path = prefijo ? `${prefijo}/${item.name}` : item.name;
      // Un "folder" en Supabase Storage viene sin id.
      if (item.id == null) {
        if (nivel < 3) paths.push(...(await listarTodo(bucket, path, nivel + 1)));
      } else {
        paths.push(path);
      }
    }
    return paths;
  }

  async function vaciar(bucket: string, prefijo: string) {
    const paths = await listarTodo(bucket, prefijo);
    for (let i = 0; i < paths.length; i += 100) {
      const lote = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(bucket).remove(lote);
      if (error) errores.push(`${bucket}: ${error.message}`);
      else archivos += lote.length;
    }
  }

  await vaciar('comunicaciones', guarderiaId);
  await vaciar('publicaciones', guarderiaId);
  for (const socioId of socioIds) await vaciar('documentos', socioId);

  return { archivos, errores };
}

/**
 * Borra las cuentas de auth de los socios cuyo perfil ya se borró. Best-effort
 * por cuenta: una que falle queda como cuenta sin perfil (el login la manda a
 * crear-cuenta / no-access) y se informa.
 */
export async function eliminarCuentasSocios(
  ids: string[],
): Promise<{ borradas: number; errores: string[] }> {
  const admin = createAdminClient();
  const errores: string[] = [];
  let borradas = 0;
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) errores.push(`${id}: ${error.message}`);
    else borradas++;
  }
  return { borradas, errores };
}
