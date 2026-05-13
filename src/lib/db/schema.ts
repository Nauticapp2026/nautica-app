import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// =============================================================================
// ENUMS
// =============================================================================

export const rolEnum = pgEnum('rol', [
  'super_admin',
  'administrador_general',
  'administrativo',
  'operario',
  'contable',
  'mantenimiento',
  'comunicaciones',
  'restaurantes',
  'socio',
  'invitado',
  'proveedor',
  'seguridad',
]);

export const planEnum = pgEnum('plan', ['classic', 'plus', 'platinum']);

export const membershipStatusEnum = pgEnum('membership_status', ['active', 'suspended', 'removed']);

export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
]);

export const estadoEspacioEnum = pgEnum('estado_espacio', ['disponible', 'ocupado', 'reservado']);

export const estadoSocioEnum = pgEnum('estado_socio', ['activo', 'moroso']);

export const estadoMiembroEnum = pgEnum('estado_miembro', ['activo', 'inactivo']);

export const estadoInvitadoEnum = pgEnum('estado_invitado', ['activo', 'inactivo']);

export const estadoTareaEnum = pgEnum('estado_tarea', [
  'preparar',
  'navegando',
  'guardada',
  'lavado',
]);

export const estadoFacturaEnum = pgEnum('estado_factura', ['pagada', 'pendiente', 'vencida']);

export const estadoCtaCteEnum = pgEnum('estado_cta_cte', ['pagado', 'no_pagado', 'facturado']);

export const estadoQrEnum = pgEnum('estado_qr', ['activo', 'usado', 'revocado']);

export const estadoServicioEnum = pgEnum('estado_servicio', ['activo', 'inactivo']);

export const estadoProveedorEnum = pgEnum('estado_proveedor', ['activo', 'inactivo']);

export const estadoOrdenEnum = pgEnum('estado_orden', [
  'pendiente',
  'en_preparacion',
  'listo',
  'entregado',
]);

export const estadoPagoEnum = pgEnum('estado_pago', ['pendiente', 'fallido', 'aprobado']);

export const estadoReservaEnum = pgEnum('estado_reserva', ['pendiente', 'confirmada', 'rechazada']);

export const medioPagoEnum = pgEnum('medio_pago', [
  'efectivo',
  'tarjeta_credito',
  'tarjeta_debito',
  'debito_automatico',
  'transferencia',
  'cheque',
]);

export const tipoDocumentoEnum = pgEnum('tipo_documento', [
  'dni',
  'cuit',
  'pasaporte',
  'cdi',
  'cuil',
]);

export const tipoDocumentoAdjuntoEnum = pgEnum('tipo_documento_adjunto', [
  'carnet_nautico',
  'matricula',
  'seguro',
]);

export const condicionFrenteIvaEnum = pgEnum('condicion_frente_iva', [
  'consumidor_final',
  'responsable_inscripto',
  'monotributo',
  'exento',
  'cliente_exterior',
  'iva_no_alcanzado',
  'proveedor_exterior',
]);

export const condicionVentaEnum = pgEnum('condicion_venta', [
  'dias_5',
  'dias_10',
  'dias_15',
  'dias_20',
  'dias_30',
  'dias_45',
  'dias_60',
  'dias_90',
  'contado',
  'cuenta_corriente',
  'transferencia_bancaria',
  'tarjeta_credito',
  'tarjeta_debito',
  'otros',
  'mercadopago',
  'payway',
]);

export const tipoFacturaEnum = pgEnum('tipo_factura', ['factura_a', 'factura_b', 'factura_c']);

export const tipoCuentaCorrienteEnum = pgEnum('tipo_cta_cte', ['mensual', 'espacio', 'otro']);

export const tipoServicioEnum = pgEnum('tipo_servicio', ['cuota_mensual', 'servicios', 'espacios']);

export const tipoComunicacionEnum = pgEnum('tipo_comunicacion', ['socios', 'publica']);

export const tamanoPublicidadEnum = pgEnum('tamano_publicidad', ['350x300', '353x119']);

export const categoriaComunicacionEnum = pgEnum('categoria_comunicacion', [
  'informacion',
  'anuncio',
  'evento',
  'mantenimiento',
  'alerta',
]);

export const tipoPorteriaEnum = pgEnum('tipo_porteria', [
  'salida_embarcacion',
  'ingreso_embarcacion',
]);

export const porteriaTipoEnum = pgEnum('porteria_tipo', ['salida', 'acceso_externo']);

export const tipoAlertaEnum = pgEnum('tipo_alerta', ['retorno_proximo', 'sin_respuesta']);

export const estadoAlertaEnum = pgEnum('estado_alerta', ['pendiente', 'resuelta']);

export const estadoSolicitudLavadoEnum = pgEnum('estado_solicitud_lavado', [
  'pendiente',
  'en_proceso',
  'lista',
  'cancelada',
]);

export const tipoInvitadoEnum = pgEnum('tipo_invitado', ['titular', 'autorizado']);

export const categoriaProveedorEnum = pgEnum('categoria_proveedor', [
  'mantenimiento',
  'combustible',
  'electronica',
  'pinturas',
  'grua',
  'velas',
  'seguridad',
  'motores',
  'limpieza',
  'accesorios',
]);

export const diaSemanaEnum = pgEnum('dia_semana', [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
]);

// Servicios de categoría "espacios": locación (dónde se aplica) y unidad de metraje.
export const locacionServicioEnum = pgEnum('locacion_servicio', ['camas', 'amarra']);

export const unidadMetrajeEnum = pgEnum('unidad_metraje', ['metros', 'pies']);

// Rangos de eslora/manga para tarifas (Medidas en Bubble)
export const medidaEnum = pgEnum('medida', [
  'hasta_16',
  'hasta_18',
  'hasta_19',
  'hasta_21',
  'hasta_23',
  'hasta_25',
  'hasta_29',
  'hasta_32',
  'hasta_35',
  'hasta_40',
  'hasta_42',
  'hasta_44',
  'hasta_46',
  'hasta_50',
  'hasta_55',
  'hasta_60',
  'hasta_65',
  'hasta_70',
  'hasta_74',
  'hasta_86',
  'hasta_105',
]);

// =============================================================================
// TENANT — GUARDERÍAS
// =============================================================================

export const guarderias = pgTable(
  'guarderias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: text('nombre').notNull(),
    slug: text('slug').notNull(),
    descripcion: text('descripcion'),
    cuit: text('cuit'),
    email: text('email'),
    telefono: text('telefono'),
    direccion: text('direccion'),
    ciudad: text('ciudad'),
    provincia: text('provincia'),
    codigoPostal: text('codigo_postal'),
    // Coordenadas geográficas, geocodificadas con Nominatim a partir de direccion+ciudad+provincia.
    // NULL si el geocoding falló: la app móvil cae a fallback (Tigre).
    latitud: numeric('latitud', { precision: 9, scale: 6 }),
    longitud: numeric('longitud', { precision: 9, scale: 6 }),
    tipo: text('tipo'),
    logoUrl: text('logo_url'),
    imagenes: text('imagenes').array(),
    facebook: text('facebook'),
    instagram: text('instagram'),
    plan: planEnum('plan').default('classic'),
    // Feature flags
    activarClimaYMareas: boolean('activar_clima_y_mareas').default(false),
    activarMenuGastronomico: boolean('activar_menu_gastronomico').default(false),
    activarNotificaciones: boolean('activar_notificaciones').default(false),
    activarPagosOnline: boolean('activar_pagos_online').default(false),
    activarReservasOnline: boolean('activar_reservas_online').default(false),
    // Punto de venta / facturación electrónica (tusfacturas.app)
    puntoDeVenta: integer('punto_de_venta'),
    razonSocial: text('razon_social'),
    condicionIva: condicionFrenteIvaEnum('condicion_iva'),
    rubro: text('rubro'),
    iibb: text('iibb'),
    fechaInicio: timestamp('fecha_inicio', { withTimezone: true }),
    // Día del mes (1-28) en que se generan movimientos mensuales y auto-facturación.
    diaFacturacion: integer('dia_facturacion').default(1),
    // Credenciales devueltas por tusfacturas al crear el POS de esta guardería.
    tusfacturasApikey: text('tusfacturas_apikey'),
    tusfacturasApitoken: text('tusfacturas_apitoken'),
    tusfacturasUsertoken: text('tusfacturas_usertoken'),
    // Certificado de enlace con AFIP — true = instalado y confirmado, puede facturar.
    certificadoAfipOk: boolean('certificado_afip_ok').default(false).notNull(),
    // Activación a nivel plataforma. false = los usuarios de la guardería ven
    // una pantalla "pendiente de activación" en lugar del dashboard. El super
    // admin activa desde /super-admin/guarderias.
    activa: boolean('activa').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('guarderias_slug_idx').on(t.slug)],
);

// =============================================================================
// AUTH — PROFILES & MEMBERSHIPS
// =============================================================================

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // coincide con auth.users.id
  email: text('email').notNull(),
  nombre: text('nombre'),
  apellido: text('apellido'),
  telefono: text('telefono'),
  direccion: text('direccion'),
  numeroDocumento: text('numero_documento'),
  tipoDocumento: tipoDocumentoEnum('tipo_documento'),
  condicionIva: condicionFrenteIvaEnum('condicion_iva'),
  razonSocial: text('razon_social'),
  sede: text('sede'),
  usertoken: text('usertoken'),
  qr: text('qr'),
  deuda: numeric('deuda', { precision: 12, scale: 2 }).default('0'),
  estadoSocio: estadoSocioEnum('estado_socio').default('activo'),
  estadoMiembro: estadoMiembroEnum('estado_miembro').default('activo'),
  isSuperAdmin: boolean('is_super_admin').default(false).notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    rol: rolEnum('rol').notNull().default('socio'),
    status: membershipStatusEnum('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('memberships_user_guarderia_idx').on(t.userId, t.guarderiaId),
    index('memberships_guarderia_idx').on(t.guarderiaId),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    rol: rolEnum('rol').notNull(),
    token: text('token').notNull(),
    invitedBy: uuid('invited_by').references(() => profiles.id, { onDelete: 'set null' }),
    status: invitationStatusEnum('status').default('pending').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .default(sql`now() + interval '7 days'`)
      .notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('invitations_token_idx').on(t.token),
    index('invitations_guarderia_email_idx').on(t.guarderiaId, t.email),
  ],
);

// =============================================================================
// JERARQUÍA DE ESPACIOS: Guarderia → Areas → Naves → Lados → Pisos → Espacios
//                                         ↘ Marinas (peines/docks)
// =============================================================================

export const areas = pgTable(
  'areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('areas_guarderia_idx').on(t.guarderiaId)],
);

export const naves = pgTable(
  'naves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
    nombre: text('nombre').notNull(),
    eslora: numeric('eslora', { precision: 8, scale: 2 }),
    manga: numeric('manga', { precision: 8, scale: 2 }),
    notas: text('notas'),
    orden: integer('orden').default(0),
    puntual: numeric('puntual', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('naves_guarderia_idx').on(t.guarderiaId)],
);

export const lados = pgTable(
  'lados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
    naveId: uuid('nave_id').references(() => naves.id, { onDelete: 'set null' }),
    nombre: text('nombre').notNull(),
    cantidadPisos: integer('cantidad_pisos').default(0),
    espaciosTotal: integer('espacios_total').default(0),
    confirmado: boolean('confirmado').default(false),
    // Secuencias de layout generadas por el builder
    espacios: integer('espacios').array(),
    espaciosResto: integer('espacios_resto').array(),
    pisos: integer('pisos').array(),
    resto: integer('resto').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('lados_nave_idx').on(t.naveId)],
);

export const pisos = pgTable(
  'pisos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
    ladoId: uuid('lado_id').references(() => lados.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    orden: integer('orden').default(0),
    ultimo: integer('ultimo').default(0),
    espacios: integer('espacios').array(),
    espaciosResto: integer('espacios_resto').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('pisos_lado_idx').on(t.ladoId)],
);

// Peines / docks — agrupación alternativa dentro del area
export const marinas = pgTable(
  'marinas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
    nombre: text('nombre').notNull(),
    eslora: numeric('eslora', { precision: 8, scale: 2 }),
    medidaEslora: medidaEnum('medida_eslora'),
    manga: numeric('manga', { precision: 8, scale: 2 }),
    notas: text('notas'),
    orden: integer('orden').default(0),
    precio: numeric('precio', { precision: 12, scale: 2 }),
    puntual: numeric('puntual', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('marinas_guarderia_idx').on(t.guarderiaId)],
);

export const categoriasAmarras = pgTable('categorias_amarras', {
  id: uuid('id').primaryKey().defaultRandom(),
  guarderiaId: uuid('guarderia_id')
    .notNull()
    .references(() => guarderias.id, { onDelete: 'cascade' }),
  nombre: text('nombre').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Servicios = tarifas con dimensiones (cuota mensual, espacio, servicio)
export const servicios = pgTable(
  'servicios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    categoriaAmarraId: uuid('categoria_amarra_id').references(() => categoriasAmarras.id, {
      onDelete: 'set null',
    }),
    nombre: text('nombre').notNull(),
    tipo: tipoServicioEnum('tipo').notNull(),
    estado: estadoServicioEnum('estado').default('activo'),
    precio: numeric('precio', { precision: 12, scale: 2 }),
    eslora: numeric('eslora', { precision: 8, scale: 2 }),
    medidaEslora: medidaEnum('medida_eslora'),
    manga: numeric('manga', { precision: 8, scale: 2 }),
    medidaManga: medidaEnum('medida_manga'),
    medida: medidaEnum('medida'),
    puntual: numeric('puntual', { precision: 12, scale: 2 }),
    medidaPuntual: medidaEnum('medida_puntual'),
    // Campos específicos de servicios tipo "espacios"
    locacion: locacionServicioEnum('locacion'),
    unidadMetraje: unidadMetrajeEnum('unidad_metraje'),
    clases: text('clases'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('servicios_guarderia_idx').on(t.guarderiaId)],
);

// Historial de cambios de precio. Lo escribe el trigger
// `_on_servicio_precio_change` definido en 0015_servicios_historial.sql.
export const serviciosHistorial = pgTable(
  'servicios_historial',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    servicioId: uuid('servicio_id')
      .notNull()
      .references(() => servicios.id, { onDelete: 'cascade' }),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    precioAnterior: numeric('precio_anterior', { precision: 12, scale: 2 }),
    precioNuevo: numeric('precio_nuevo', { precision: 12, scale: 2 }),
    origen: text('origen').notNull().default('manual'),
    usuarioId: uuid('usuario_id').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('servicios_historial_servicio_idx').on(t.servicioId, t.createdAt),
    index('servicios_historial_guarderia_idx').on(t.guarderiaId),
  ],
);

// Tarifas = bandas de precio por medida de eslora
export const tarifas = pgTable(
  'tarifas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    medida: medidaEnum('medida').notNull(),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    vigente: boolean('vigente').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('tarifas_guarderia_idx').on(t.guarderiaId)],
);

// Espacios = slips individuales (amarras)
export const espacios = pgTable(
  'espacios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
    naveId: uuid('nave_id').references(() => naves.id, { onDelete: 'set null' }),
    ladoId: uuid('lado_id').references(() => lados.id, { onDelete: 'set null' }),
    pisoId: uuid('piso_id').references(() => pisos.id, { onDelete: 'set null' }),
    marinaId: uuid('marina_id').references(() => marinas.id, { onDelete: 'set null' }),
    ocupanteId: uuid('ocupante_id').references(() => profiles.id, { onDelete: 'set null' }),
    servicioId: uuid('servicio_id').references(() => servicios.id, { onDelete: 'set null' }),
    // Día de cobro mensual: se setea cuando ocupanteId pasa de null a not null
    // o cambia de socio. NULL = modelo viejo (cobro el día 1).
    fechaAsignacion: timestamp('fecha_asignacion', { withTimezone: true }),
    nomenclatura: text('nomenclatura'),
    lugar: text('lugar'),
    tipo: text('tipo'),
    estado: estadoEspacioEnum('estado').default('disponible'),
    eslora: numeric('eslora', { precision: 8, scale: 2 }),
    manga: numeric('manga', { precision: 8, scale: 2 }),
    global: numeric('global', { precision: 12, scale: 2 }),
    puntual: numeric('puntual', { precision: 12, scale: 2 }),
    tarifa: numeric('tarifa', { precision: 12, scale: 2 }),
    orden: integer('orden').notNull().default(0),
    observaciones: text('observaciones'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('espacios_guarderia_idx').on(t.guarderiaId),
    index('espacios_estado_idx').on(t.estado),
  ],
);

// =============================================================================
// EMBARCACIONES & DOCUMENTOS
// =============================================================================

export const embarcaciones = pgTable(
  'embarcaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    espacioId: uuid('espacio_id').references(() => espacios.id, { onDelete: 'set null' }),
    nombre: text('nombre').notNull(),
    matricula: text('matricula'),
    modelo: text('modelo'),
    seguro: text('seguro'),
    esloraM: numeric('eslora_m', { precision: 6, scale: 2 }),
    fotoUrl: text('foto_url'),
    ubicacion: text('ubicacion'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('embarcaciones_guarderia_idx').on(t.guarderiaId),
    index('embarcaciones_profile_idx').on(t.profileId),
  ],
);

export const documentos = pgTable(
  'documentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    tipo: tipoDocumentoAdjuntoEnum('tipo'),
    documentoUrl: text('documento_url'),
    vencimiento: timestamp('vencimiento', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('documentos_profile_idx').on(t.profileId)],
);

// =============================================================================
// INVITADOS & PORTERÍA
// =============================================================================

export const invitados = pgTable(
  'invitados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    socioId: uuid('socio_id').references(() => profiles.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
    nombre: text('nombre').notNull(),
    apellido: text('apellido'),
    email: text('email'),
    telefono: text('telefono'),
    motivo: text('motivo'),
    tipo: tipoInvitadoEnum('tipo').default('titular'),
    estado: estadoInvitadoEnum('estado').default('activo'),
    validoHasta: timestamp('valido_hasta', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('invitados_guarderia_idx').on(t.guarderiaId)],
);

export const porteria = pgTable(
  'porteria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    socioId: uuid('socio_id').references(() => profiles.id, { onDelete: 'set null' }),
    invitadoUserId: uuid('invitado_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    embarcacionId: uuid('embarcacion_id').references(() => embarcaciones.id, {
      onDelete: 'set null',
    }),
    qr: text('qr').unique(),
    estado: estadoQrEnum('estado').default('activo'),
    tipo: porteriaTipoEnum('tipo').notNull().default('salida'),
    motivo: text('motivo'),
    desde: timestamp('desde', { withTimezone: true }),
    hasta: timestamp('hasta', { withTimezone: true }),
    expiracion: timestamp('expiracion', { withTimezone: true }),
    arribadaEn: timestamp('arribada_en', { withTimezone: true }),
    socioIngresoEn: timestamp('socio_ingreso_en', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('porteria_guarderia_idx').on(t.guarderiaId), index('porteria_tipo_idx').on(t.tipo)],
);

export const porteriaInvitados = pgTable(
  'porteria_invitados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    porteriaId: uuid('porteria_id')
      .notNull()
      .references(() => porteria.id, { onDelete: 'cascade' }),
    invitadoId: uuid('invitado_id')
      .notNull()
      .references(() => invitados.id, { onDelete: 'cascade' }),
    cantidadAcompanantes: integer('cantidad_acompanantes').default(0),
    esTecnico: boolean('es_tecnico').default(false).notNull(),
    motivoTecnico: text('motivo_tecnico'),
    ingresoEn: timestamp('ingreso_en', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('porteria_invitados_porteria_idx').on(t.porteriaId),
    index('porteria_invitados_invitado_idx').on(t.invitadoId),
    uniqueIndex('porteria_invitados_unique').on(t.porteriaId, t.invitadoId),
  ],
);

export const actividadPorteria = pgTable(
  'actividad_porteria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    porteriaId: uuid('porteria_id').references(() => porteria.id, { onDelete: 'set null' }),
    socioId: uuid('socio_id').references(() => profiles.id, { onDelete: 'set null' }),
    invitadoId: uuid('invitado_id').references(() => profiles.id, { onDelete: 'set null' }),
    tipo: tipoPorteriaEnum('tipo'),
    fecha: timestamp('fecha', { withTimezone: true }).defaultNow(),
    hora: text('hora'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('actividad_porteria_guarderia_idx').on(t.guarderiaId)],
);

export const horariosDia = pgTable('horarios_dia', {
  id: uuid('id').primaryKey().defaultRandom(),
  guarderiaId: uuid('guarderia_id')
    .notNull()
    .references(() => guarderias.id, { onDelete: 'cascade' }),
  dia: diaSemanaEnum('dia').notNull(),
  horarios: text('horarios'),
  cerrado: boolean('cerrado').default(false),
  orden: integer('orden').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// COMUNICACIONES & TAREAS
// =============================================================================

export const comunicaciones = pgTable(
  'comunicaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    autorId: uuid('autor_id').references(() => profiles.id, { onDelete: 'set null' }),
    titulo: text('titulo').notNull(),
    texto: text('texto'),
    categoria: categoriaComunicacionEnum('categoria'),
    tipo: tipoComunicacionEnum('tipo').default('socios'),
    publicar: boolean('publicar').default(false),
    fecha: timestamp('fecha', { withTimezone: true }).defaultNow(),
    imagenUrls: text('imagen_urls').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('comunicaciones_guarderia_idx').on(t.guarderiaId)],
);

export const tareas = pgTable(
  'tareas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    operarioId: uuid('operario_id').references(() => profiles.id, { onDelete: 'set null' }),
    embarcacionId: uuid('embarcacion_id').references(() => embarcaciones.id, {
      onDelete: 'set null',
    }),
    porteriaId: uuid('porteria_id').references(() => porteria.id, { onDelete: 'set null' }),
    servicioId: uuid('servicio_id').references(() => servicios.id, { onDelete: 'set null' }),
    descripcion: text('descripcion').notNull(),
    nota: text('nota'),
    estado: estadoTareaEnum('estado').default('preparar'),
    fechaHora: timestamp('fecha_hora', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('tareas_guarderia_idx').on(t.guarderiaId),
    index('tareas_operario_idx').on(t.operarioId),
  ],
);

// =============================================================================
// FACTURACIÓN & CUENTA CORRIENTE
// =============================================================================

export const datosFacturacion = pgTable('datos_facturacion', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  razonSocial: text('razon_social'),
  numeroDeDocumento: text('numero_de_documento'),
  tipoDeDocumento: tipoDocumentoEnum('tipo_de_documento'),
  condicionFrenteIva: condicionFrenteIvaEnum('condicion_frente_iva'),
  puntoDeVenta: integer('punto_de_venta'),
  rubro: text('rubro'),
  fechaInicio: timestamp('fecha_inicio', { withTimezone: true }),
  // Credenciales para integración AFIP (facturación electrónica argentina)
  apikey: text('apikey'),
  apitoken: text('apitoken'),
  usertoken: text('usertoken'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const movimientosCuentaCorriente = pgTable(
  'movimientos_cuenta_corriente',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    socioId: uuid('socio_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    servicioId: uuid('servicio_id').references(() => servicios.id, { onDelete: 'set null' }),
    espacioId: uuid('espacio_id').references(() => espacios.id, { onDelete: 'set null' }),
    concepto: text('concepto'),
    tipo: tipoCuentaCorrienteEnum('tipo'),
    estado: estadoCtaCteEnum('estado').default('no_pagado'),
    debe: numeric('debe', { precision: 12, scale: 2 }).default('0'),
    haber: numeric('haber', { precision: 12, scale: 2 }).default('0'),
    saldoPost: numeric('saldo_post', { precision: 12, scale: 2 }).default('0'),
    importeSigned: numeric('importe_signed', { precision: 12, scale: 2 }).default('0'),
    fecha: timestamp('fecha', { withTimezone: true }).defaultNow(),
    proximoPago: timestamp('proximo_pago', { withTimezone: true }),
    formaDePago: medioPagoEnum('forma_de_pago'),
    // Transferencia bancaria
    bancoTransferencia: text('banco_transferencia'),
    cbuAliasTransferencia: text('cbu_alias_transferencia'),
    clienteTransferencia: text('cliente_transferencia'),
    montoTransferencia: numeric('monto_transferencia', { precision: 12, scale: 2 }),
    fechaTransferencia: timestamp('fecha_transferencia', { withTimezone: true }),
    numeroOperacionTransferencia: text('numero_operacion_transferencia'),
    observacionesTransferencia: text('observaciones_transferencia'),
    comprobanteTransferenciaUrls: text('comprobante_transferencia_urls').array(),
    // Cheque
    bancoEmisorCheque: text('banco_emisor_cheque'),
    cuentaCheque: text('cuenta_cheque'),
    cuitCuilCheque: text('cuit_cuil_cheque'),
    importeCheque: numeric('importe_cheque', { precision: 12, scale: 2 }),
    monedaCheque: text('moneda_cheque'),
    numeroCheque: text('numero_cheque'),
    sucursalCheque: text('sucursal_cheque'),
    tipoCheque: text('tipo_cheque'),
    titularCheque: text('titular_cheque'),
    observacionesCheque: text('observaciones_cheque'),
    comprobanteChequeUrls: text('comprobante_cheque_urls').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('movimientos_socio_idx').on(t.socioId),
    index('movimientos_servicio_idx').on(t.servicioId),
  ],
);

export const facturacion = pgTable(
  'facturacion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    socioId: uuid('socio_id').references(() => profiles.id, { onDelete: 'set null' }),
    codigo: text('codigo'),
    archivo: text('archivo'),
    descripcion: text('descripcion'),
    tipoFactura: tipoFacturaEnum('tipo_factura'),
    estado: estadoFacturaEnum('estado').default('pendiente'),
    condicionVenta: condicionVentaEnum('condicion_venta'),
    medioPago: medioPagoEnum('medio_pago'),
    importe: numeric('importe', { precision: 12, scale: 2 }),
    emision: timestamp('emision', { withTimezone: true }),
    desde: timestamp('desde', { withTimezone: true }),
    hasta: timestamp('hasta', { withTimezone: true }),
    vencimiento: timestamp('vencimiento', { withTimezone: true }),
    externalReference: text('external_reference'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('facturacion_guarderia_idx').on(t.guarderiaId),
    index('facturacion_socio_idx').on(t.socioId),
    index('facturacion_emision_idx').on(t.emision),
  ],
);

export const facturacionItems = pgTable('facturacion_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  facturacionId: uuid('facturacion_id')
    .notNull()
    .references(() => facturacion.id, { onDelete: 'cascade' }),
  socioId: uuid('socio_id').references(() => profiles.id, { onDelete: 'set null' }),
  importe: numeric('importe', { precision: 12, scale: 2 }),
  confirmado: boolean('confirmado').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Relación M:N entre facturacion_items y movimientos
export const facturacionItemMovimientos = pgTable('facturacion_item_movimientos', {
  id: uuid('id').primaryKey().defaultRandom(),
  facturacionItemId: uuid('facturacion_item_id')
    .notNull()
    .references(() => facturacionItems.id, { onDelete: 'cascade' }),
  movimientoId: uuid('movimiento_id')
    .notNull()
    .references(() => movimientosCuentaCorriente.id, { onDelete: 'cascade' }),
});

// =============================================================================
// PROVEEDORES
// =============================================================================

export const proveedores = pgTable(
  'proveedores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    nombre: text('nombre').notNull(),
    apellido: text('apellido'),
    email: text('email'),
    telefono: text('telefono'),
    categoria: categoriaProveedorEnum('categoria'),
    estado: estadoProveedorEnum('estado').default('activo'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('proveedores_guarderia_idx').on(t.guarderiaId)],
);

// =============================================================================
// MÓDULO RESTAURANTE (activable por guardería con activarMenuGastronomico)
// =============================================================================

export const restaurantes = pgTable('restaurantes', {
  id: uuid('id').primaryKey().defaultRandom(),
  guarderiaId: uuid('guarderia_id')
    .notNull()
    .references(() => guarderias.id, { onDelete: 'cascade' }),
  nombre: text('nombre').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const platos = pgTable(
  'platos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restauranteId: uuid('restaurante_id')
      .notNull()
      .references(() => restaurantes.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    categoria: text('categoria'),
    precio: numeric('precio', { precision: 12, scale: 2 }),
    tiempo: integer('tiempo'),
    disponible: boolean('disponible').default(true),
    imagenUrl: text('imagen_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('platos_restaurante_idx').on(t.restauranteId)],
);

export const ordenes = pgTable(
  'ordenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restauranteId: uuid('restaurante_id')
      .notNull()
      .references(() => restaurantes.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    estado: estadoOrdenEnum('estado').default('pendiente'),
    total: numeric('total', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('ordenes_restaurante_idx').on(t.restauranteId)],
);

export const itemsOrden = pgTable('items_orden', {
  id: uuid('id').primaryKey().defaultRandom(),
  ordenId: uuid('orden_id')
    .notNull()
    .references(() => ordenes.id, { onDelete: 'cascade' }),
  platoId: uuid('plato_id').references(() => platos.id, { onDelete: 'set null' }),
  cantidad: integer('cantidad').notNull().default(1),
  precio: numeric('precio', { precision: 12, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pagos = pgTable('pagos', {
  id: uuid('id').primaryKey().defaultRandom(),
  ordenId: uuid('orden_id').references(() => ordenes.id, { onDelete: 'set null' }),
  restauranteId: uuid('restaurante_id').references(() => restaurantes.id, {
    onDelete: 'set null',
  }),
  monto: numeric('monto', { precision: 12, scale: 2 }),
  estado: estadoPagoEnum('estado').default('pendiente'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reservas = pgTable(
  'reservas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restauranteId: uuid('restaurante_id')
      .notNull()
      .references(() => restaurantes.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    fecha: timestamp('fecha', { withTimezone: true }),
    personas: integer('personas').default(1),
    estado: estadoReservaEnum('estado').default('pendiente'),
    notas: text('notas'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('reservas_restaurante_idx').on(t.restauranteId)],
);

// =============================================================================
// ALERTAS — Monitoreo de retorno (fase 1)
// =============================================================================

export const alertas = pgTable(
  'alertas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    porteriaId: uuid('porteria_id')
      .notNull()
      .references(() => porteria.id, { onDelete: 'cascade' }),
    socioId: uuid('socio_id').references(() => profiles.id, { onDelete: 'set null' }),
    tipo: tipoAlertaEnum('tipo').notNull(),
    estado: estadoAlertaEnum('estado').default('pendiente').notNull(),
    mensaje: text('mensaje'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('alertas_porteria_tipo_unique').on(t.porteriaId, t.tipo),
    index('alertas_guarderia_estado_idx').on(t.guarderiaId, t.estado),
    index('alertas_socio_estado_idx').on(t.socioId, t.estado),
  ],
);

export const solicitudesLavado = pgTable(
  'solicitudes_lavado',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    socioId: uuid('socio_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    diaUso: date('dia_uso').notNull(),
    estado: estadoSolicitudLavadoEnum('estado').default('pendiente').notNull(),
    tareaId: uuid('tarea_id').references(() => tareas.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('solicitudes_lavado_socio_idx').on(t.socioId, t.estado),
    index('solicitudes_lavado_guarderia_idx').on(t.guarderiaId, t.estado),
    index('solicitudes_lavado_tarea_idx').on(t.tareaId),
    uniqueIndex('solicitudes_lavado_socio_activa_unique')
      .on(t.socioId)
      .where(sql`${t.estado} in ('pendiente', 'en_proceso')`),
  ],
);

// =============================================================================
// PLATFORM (super admin) — config global, no scopeada por guardería
// =============================================================================

// Planes públicos de la landing. La presentación (colores, features, plan
// destacado) sigue en código; acá solo viven los datos que cambian seguido:
// nombre visible y rate por lugar de guarda. El precio mostrado se calcula
// como `rate * capacidad` en el cliente.
export const pricingPlans = pgTable('pricing_plans', {
  slug: planEnum('slug').primaryKey(),
  name: text('name').notNull(),
  rate: integer('rate').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
});

// Tabla genérica key/value para settings globales de la plataforma. Hoy guarda
// `pricing_capacities` (array de capacidades del slider de la landing).
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
});

// Comunicaciones a nivel plataforma NauticApp (no scopeadas por guardería).
// Mismo modelo que `comunicaciones` pero sin `guarderia_id`. Solo super admin
// las crea/edita; cualquier authenticated las lee.
export const platformComunicaciones = pgTable('platform_comunicaciones', {
  id: uuid('id').primaryKey().defaultRandom(),
  autorId: uuid('autor_id').references(() => profiles.id, { onDelete: 'set null' }),
  titulo: text('titulo').notNull(),
  texto: text('texto'),
  categoria: categoriaComunicacionEnum('categoria'),
  tipo: tipoComunicacionEnum('tipo').default('socios'),
  publicar: boolean('publicar').default(false),
  fecha: timestamp('fecha', { withTimezone: true }).defaultNow(),
  imagenUrls: text('imagen_urls').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Publicidades a nivel plataforma — banners que la app mobile muestra en sus
// slots "PUBLICIDAD". Cada publi tiene un tamaño fijo (350x300 o 353x119) que
// define en qué slot puede aparecer; la mobile filtra por `tamano`.
export const platformPublicidades = pgTable('platform_publicidades', {
  id: uuid('id').primaryKey().defaultRandom(),
  autorId: uuid('autor_id').references(() => profiles.id, { onDelete: 'set null' }),
  titulo: text('titulo').notNull(),
  texto: text('texto'),
  tamano: tamanoPublicidadEnum('tamano').notNull(),
  linkUrl: text('link_url'),
  imagenUrls: text('imagen_urls').array(),
  publicar: boolean('publicar').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// RELACIONES
// =============================================================================

export const guarderiaRelations = relations(guarderias, ({ many }) => ({
  memberships: many(memberships),
  invitations: many(invitations),
  areas: many(areas),
  naves: many(naves),
  marinas: many(marinas),
  categoriasAmarras: many(categoriasAmarras),
  servicios: many(servicios),
  tarifas: many(tarifas),
  espacios: many(espacios),
  embarcaciones: many(embarcaciones),
  invitados: many(invitados),
  porteria: many(porteria),
  horariosDia: many(horariosDia),
  comunicaciones: many(comunicaciones),
  tareas: many(tareas),
  facturacion: many(facturacion),
  proveedores: many(proveedores),
  restaurantes: many(restaurantes),
  solicitudesLavado: many(solicitudesLavado),
}));

export const profileRelations = relations(profiles, ({ many, one }) => ({
  memberships: many(memberships),
  documentos: many(documentos),
  embarcaciones: many(embarcaciones),
  invitadosComo: many(invitados, { relationName: 'socio' }),
  datosFacturacion: one(datosFacturacion, {
    fields: [profiles.id],
    references: [datosFacturacion.profileId],
  }),
  movimientos: many(movimientosCuentaCorriente),
  solicitudesLavado: many(solicitudesLavado),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(profiles, { fields: [memberships.userId], references: [profiles.id] }),
  guarderia: one(guarderias, { fields: [memberships.guarderiaId], references: [guarderias.id] }),
}));

export const espaciosRelations = relations(espacios, ({ one }) => ({
  guarderia: one(guarderias, { fields: [espacios.guarderiaId], references: [guarderias.id] }),
  area: one(areas, { fields: [espacios.areaId], references: [areas.id] }),
  nave: one(naves, { fields: [espacios.naveId], references: [naves.id] }),
  lado: one(lados, { fields: [espacios.ladoId], references: [lados.id] }),
  piso: one(pisos, { fields: [espacios.pisoId], references: [pisos.id] }),
  marina: one(marinas, { fields: [espacios.marinaId], references: [marinas.id] }),
  ocupante: one(profiles, { fields: [espacios.ocupanteId], references: [profiles.id] }),
  servicio: one(servicios, { fields: [espacios.servicioId], references: [servicios.id] }),
}));

export const embarcacionesRelations = relations(embarcaciones, ({ one }) => ({
  guarderia: one(guarderias, {
    fields: [embarcaciones.guarderiaId],
    references: [guarderias.id],
  }),
  profile: one(profiles, { fields: [embarcaciones.profileId], references: [profiles.id] }),
  espacio: one(espacios, { fields: [embarcaciones.espacioId], references: [espacios.id] }),
}));

export const facturacionRelations = relations(facturacion, ({ one, many }) => ({
  guarderia: one(guarderias, {
    fields: [facturacion.guarderiaId],
    references: [guarderias.id],
  }),
  socio: one(profiles, { fields: [facturacion.socioId], references: [profiles.id] }),
  items: many(facturacionItems),
}));

export const tareasRelations = relations(tareas, ({ one }) => ({
  guarderia: one(guarderias, { fields: [tareas.guarderiaId], references: [guarderias.id] }),
  operario: one(profiles, { fields: [tareas.operarioId], references: [profiles.id] }),
  embarcacion: one(embarcaciones, {
    fields: [tareas.embarcacionId],
    references: [embarcaciones.id],
  }),
}));

export const alertasRelations = relations(alertas, ({ one }) => ({
  guarderia: one(guarderias, { fields: [alertas.guarderiaId], references: [guarderias.id] }),
  porteria: one(porteria, { fields: [alertas.porteriaId], references: [porteria.id] }),
  socio: one(profiles, { fields: [alertas.socioId], references: [profiles.id] }),
  resolver: one(profiles, { fields: [alertas.resolvedBy], references: [profiles.id] }),
}));

export const solicitudesLavadoRelations = relations(solicitudesLavado, ({ one }) => ({
  guarderia: one(guarderias, {
    fields: [solicitudesLavado.guarderiaId],
    references: [guarderias.id],
  }),
  socio: one(profiles, {
    fields: [solicitudesLavado.socioId],
    references: [profiles.id],
  }),
  tarea: one(tareas, {
    fields: [solicitudesLavado.tareaId],
    references: [tareas.id],
  }),
}));

// =============================================================================
// TIPOS INFERIDOS
// =============================================================================

export type Guarderia = typeof guarderias.$inferSelect;
export type NewGuarderia = typeof guarderias.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type Espacio = typeof espacios.$inferSelect;
export type Embarcacion = typeof embarcaciones.$inferSelect;
export type Tarea = typeof tareas.$inferSelect;
export type Comunicacion = typeof comunicaciones.$inferSelect;
export type Facturacion = typeof facturacion.$inferSelect;
export type MovimientoCuentaCorriente = typeof movimientosCuentaCorriente.$inferSelect;
export type Alerta = typeof alertas.$inferSelect;
export type SolicitudLavado = typeof solicitudesLavado.$inferSelect;
export type NewSolicitudLavado = typeof solicitudesLavado.$inferInsert;
export type PricingPlan = typeof pricingPlans.$inferSelect;
export type NewPricingPlan = typeof pricingPlans.$inferInsert;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type PlatformComunicacion = typeof platformComunicaciones.$inferSelect;
export type NewPlatformComunicacion = typeof platformComunicaciones.$inferInsert;
export type PlatformPublicidad = typeof platformPublicidades.$inferSelect;
export type NewPlatformPublicidad = typeof platformPublicidades.$inferInsert;
