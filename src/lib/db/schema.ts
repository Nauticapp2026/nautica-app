import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  smallint,
  numeric,
  timestamp,
  date,
  jsonb,
  primaryKey,
  unique,
  uniqueIndex,
  index,
  type AnyPgColumn,
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
  'marinero',
  'contable',
  'mantenimiento',
  'comunicaciones',
  'restaurantes',
  'socio',
  'invitado',
  'proveedor',
  'seguridad',
]);

export const planEnum = pgEnum('plan', ['esencial', 'premium', 'elite']);

export const membershipStatusEnum = pgEnum('membership_status', [
  'active',
  'suspended',
  'removed',
  'inactivo',
]);

export const estadoSolicitudMembershipEnum = pgEnum('estado_solicitud_membership', [
  'pendiente',
  'aprobada',
  'rechazada',
]);

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
  'salida_programada',
  'preparar',
  'navegando',
  'guardada',
  'lavado',
]);

export const estadoFacturaEnum = pgEnum('estado_factura', ['pagada', 'pendiente', 'vencida']);

export const estadoCtaCteEnum = pgEnum('estado_cta_cte', ['pagado', 'no_pagado', 'facturado']);

export const estadoQrEnum = pgEnum('estado_qr', ['activo', 'usado', 'revocado']);

export const estadoServicioEnum = pgEnum('estado_servicio', ['activo', 'inactivo', 'pausado']);

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
  'mercado_pago',
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

export const condicionIibbEnum = pgEnum('condicion_iibb', [
  'convenio_multilateral',
  'local',
  'exento',
  'no_gravado',
  'no_corresponde',
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

export const tipoFacturaEnum = pgEnum('tipo_factura', [
  'factura_a',
  'factura_b',
  'factura_c',
  'recibo',
  'nota_credito_a',
  'nota_credito_b',
  'nota_credito_c',
  'nota_debito_a',
  'nota_debito_b',
  'nota_debito_c',
  // A diferencia de nota_credito_a/b/c (siempre fiscales, van a ARCA), esta
  // anula/reduce un Comprobante interno (CM-/CL-) sin pasar por TusFacturas.
  // Numeración propia NCI-NNNNNN.
  'nota_credito_interna',
]);

// Solo para recibos de cobranza (RC-): si los comprobantes que cobró son
// facturas fiscales o comprobantes internos (CM-/CL-) — un mismo recibo no
// puede mezclar los dos tipos, se valida al registrar la cobranza.
export const tipoReciboEnum = pgEnum('tipo_recibo', ['fiscal', 'interno']);

export const tipoCuentaCorrienteEnum = pgEnum('tipo_cta_cte', [
  'mensual',
  'espacio',
  'otro',
  // Asiento (haber) que genera una Nota de Crédito al anular/reducir un
  // cargo — se distingue de 'otro' para que la cuenta corriente pueda
  // mostrar "Anulado (NC)" en vez de "Cobrado" quien cubre el cargo.
  'nota_credito',
  // Contraasiento (debe) que genera la anulación de un recibo de cobranza:
  // revierte el haber del pago sin borrarlo (queda el rastro). El par
  // pago+contraasiento se excluye del pool FIFO de cobertura. Mig 0138.
  'anulacion_recibo',
]);

export const tipoServicioEnum = pgEnum('tipo_servicio', [
  'espacio_guarda',
  'cuota_social',
  'membresia',
  'expensas_ordinarias',
  'expensas_extraordinarias',
  'servicio_extra',
]);

export const tipoCobroServicioEnum = pgEnum('tipo_cobro_servicio', ['fijo', 'variable']);
export const periodoTarifaVariableEnum = pgEnum('periodo_tarifa_variable', ['diaria', 'mensual']);

// Cómo se factura la baja de un servicio cuando el socio cancela antes de fin
// de mes. 'proporcional' es el comportamiento histórico (precio mensual /
// días del mes, sin redondeo); 'mes_completo' factura el mes entero igual.
export const politicaBajaAnticipadaEnum = pgEnum('politica_baja_anticipada', [
  'mes_completo',
  'proporcional',
]);

export const tipoComunicacionEnum = pgEnum('tipo_comunicacion', ['socios', 'publica']);

export const tamanoPublicidadEnum = pgEnum('tamano_publicidad', ['350x300', '353x119']);

export const publicidadSeccionEnum = pgEnum('publicidad_seccion', [
  'home',
  'nautishop',
  'mi_club',
  'contactos',
  'solicitud_lavado',
  'acceso_externo',
  'qr',
  'marketplace_embarcacion',
  'marketplace_propiedad',
]);

export const notificacionAudienciaEnum = pgEnum('notificacion_audiencia', [
  'todos',
  'con_club',
  'sin_club',
  'plan_esencial',
  'plan_premium',
  'plan_elite',
]);

export const notificacionEstadoEnum = pgEnum('notificacion_estado', [
  'pendiente',
  'enviada',
  'fallida',
]);

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
  'aceptada',
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

export const tipoPublicacionEnum = pgEnum('tipo_publicacion', ['amarra', 'cama']);

export const estadoPublicacionEnum = pgEnum('estado_publicacion', ['borrador', 'publicada']);

export const servicioPublicacionEnum = pgEnum('servicio_publicacion', [
  'agua_potable',
  'conexion_220v',
  'abierto_24hs',
  'combustible',
  'seguridad_24hs',
  'vestuarios',
  'confiteria',
  'lavadero',
  'aire_libre',
  'bajo_techo',
  'sin_arco',
]);

// Servicios de categoría "espacios": locación (dónde se aplica) y unidad de metraje.
export const locacionServicioEnum = pgEnum('locacion_servicio', ['camas', 'amarra']);

export const unidadMetrajeEnum = pgEnum('unidad_metraje', ['metros', 'pies']);

export const paywayCobroEstadoEnum = pgEnum('payway_cobro_estado', [
  'aprobado',
  'rechazado',
  'pendiente',
  'error',
]);

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
    plan: planEnum('plan').default('esencial'),
    planPendiente: planEnum('plan_pendiente'),
    // Feature flags
    activarClimaYMareas: boolean('activar_clima_y_mareas').default(true),
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
    condicionIibb: condicionIibbEnum('condicion_iibb'),
    fechaInicio: timestamp('fecha_inicio', { withTimezone: true }),
    // Día del mes (1-28) en que se generan movimientos mensuales y auto-facturación.
    diaFacturacion: integer('dia_facturacion').default(1),
    // Si true, ignora diaFacturacion y cobra el primer día hábil del mes.
    facturacionPrimerHabil: boolean('facturacion_primer_habil').default(false).notNull(),
    // Credenciales devueltas por tusfacturas al crear el POS de esta guardería.
    tusfacturasApikey: text('tusfacturas_apikey'),
    tusfacturasApitoken: text('tusfacturas_apitoken'),
    tusfacturasUsertoken: text('tusfacturas_usertoken'),
    // Certificado de enlace con AFIP — true = instalado y confirmado, puede facturar.
    certificadoAfipOk: boolean('certificado_afip_ok').default(false).notNull(),
    // Credenciales Payway por guardería (débito automático con tarjeta tokenizada).
    paywayPublicKey: text('payway_public_key'),
    paywayPrivateKey: text('payway_private_key'),
    // Medios de pago que el club admite para comprobantes internos (sección
    // "Configuración de cobranzas" en Mi Perfil → Datos Impositivos). Valores
    // del set MEDIOS_PAGO (enum medio_pago). Vacío = comprobantes internos
    // deshabilitados en toda la app. Mig 0136.
    mediosCobroInternos: text('medios_cobro_internos')
      .array()
      .notNull()
      .default(sql`'{efectivo}'`),
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
  ciudad: text('ciudad'),
  provincia: text('provincia'),
  codigoPostal: text('codigo_postal'),
  contactoEmergencia: text('contacto_emergencia'),
  cuit: text('cuit'),
  direccionFiscal: text('direccion_fiscal'),
  condicionIibb: condicionIibbEnum('condicion_iibb'),
  numeroDocumento: text('numero_documento'),
  tipoDocumento: tipoDocumentoEnum('tipo_documento'),
  condicionIva: condicionFrenteIvaEnum('condicion_iva'),
  // Condición frente al IVA de la identidad PERSONAL (pestaña Generales). Se usa
  // cuando se factura con datos personales (memberships.facturaFiscal = true).
  // condicionIva (arriba) es la de los Datos Impositivos / razón social.
  condicionIvaPersonal: condicionFrenteIvaEnum('condicion_iva_personal'),
  razonSocial: text('razon_social'),
  // Email al que se envía el comprobante (Datos Impositivos). Si está vacío se
  // usa `email` (el de la cuenta). Separado del email de login.
  emailFacturacion: text('email_facturacion'),
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
    numeroSocio: integer('numero_socio'),
    // Semántica: true = facturar con los datos PERSONALES del socio (pestaña
    // Generales: nombre/apellido, DNI, dirección, condicionIvaPersonal).
    // false = facturar con los Datos Impositivos (razón social, CUIT, dirección
    // fiscal, condicionIva). El nombre de la columna quedó histórico; NO indica
    // "factura fiscal sí/no". Default false = se factura con Datos Impositivos.
    facturaFiscal: boolean('factura_fiscal').notNull().default(false),
    // Tilde "Comprobante interno" (Datos Impositivos del socio): default del
    // toggle Interno/Fiscal al cargarle un servicio. Mig 0132.
    comprobanteInterno: boolean('comprobante_interno').notNull().default(false),
    // Tilde "Cobro Automático Payway" (Datos Impositivos del socio): sus
    // servicios contratados con debito_automatico se cobran por el cron Payway.
    // Requiere tarjeta cargada (payway_tokens activo). Mig 0136.
    cobroAutomaticoPayway: boolean('cobro_automatico_payway').notNull().default(false),
    // Fecha del último destilde de cobro_automatico_payway; se blanquea al
    // re-tildar (arranca un período nuevo de adhesión).
    cobroAutomaticoBaja: date('cobro_automatico_baja'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('memberships_user_guarderia_idx').on(t.userId, t.guarderiaId),
    index('memberships_guarderia_idx').on(t.guarderiaId),
    index('memberships_user_idx').on(t.userId),
  ],
);

// Pedido de un usuario para sumarse a una guardería como socio. Lo crea la app
// mobile cuando un sin_rol busca un club y toca "Solicitar ingreso". El admin
// del club lo aprueba o rechaza desde /solicitudes-socio en el panel web.
// La aprobación dispara un trigger BEFORE UPDATE en la base que crea la
// membership rol='socio' del solicitante en la guardería.
// Tabla creada en mig mobile 0038; RLS en la misma mig.
export const solicitudesMembership = pgTable(
  'solicitudes_membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    solicitanteId: uuid('solicitante_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    estado: estadoSolicitudMembershipEnum('estado').notNull().default('pendiente'),
    motivoRechazo: text('motivo_rechazo'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('solicitudes_membership_guarderia_idx').on(t.guarderiaId, t.estado),
    index('solicitudes_membership_solicitante_idx').on(t.solicitanteId, t.createdAt),
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

// Invitaciones de equipo cargadas durante el onboarding mientras la guardería
// sigue pendiente de alta (guarderias.activa = false). El mail de invitación
// NO se envía en ese momento: queda encolado acá y se despacha cuando el
// super admin activa la guardería (setGuarderiaActivaAction). Mig 0131.
export const equipoInvitacionesPendientes = pgTable(
  'equipo_invitaciones_pendientes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    apellido: text('apellido').notNull().default(''),
    email: text('email').notNull(),
    rol: rolEnum('rol').notNull(),
    telefono: text('telefono'),
    sede: text('sede'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('equipo_inv_pendientes_guarderia_email_idx').on(t.guarderiaId, t.email)],
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
    tipoCobro: tipoCobroServicioEnum('tipo_cobro').notNull().default('fijo'),
    // Solo para tipoCobro = 'variable': si el precio es por día o por mes.
    // NULL en servicios Fijo. Con 'diaria', "Cargar Servicio" pide la
    // cantidad de días y el cargo único sale de precio diario × días.
    tarifaVariable: periodoTarifaVariableEnum('tarifa_variable'),
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
    vigenciaDesde: date('vigencia_desde').notNull(),
    vigenciaHasta: date('vigencia_hasta').notNull(),
    alicuotaIva: numeric('alicuota_iva', { precision: 5, scale: 2 }).notNull().default('21'),
    plazoPagoDias: smallint('plazo_pago_dias').notNull().default(0),
    // NULL = sin política definida (checkbox "Establecer política de baja
    // anticipada" destildado en el form). Solo aplica a servicios Fijo.
    politicaBajaAnticipada: politicaBajaAnticipadaEnum('politica_baja_anticipada'),
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

// Ajustes de precio del tarifario agendados a futuro (Ajuste masivo con
// vigencia desde futura). El cron diario los aplica en `fechaAplicacion`.
// Ver 0110_servicios_ajustes_programados.sql.
export const serviciosAjustesProgramados = pgTable(
  'servicios_ajustes_programados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    servicioId: uuid('servicio_id')
      .notNull()
      .references(() => servicios.id, { onDelete: 'cascade' }),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    precioNuevo: numeric('precio_nuevo', { precision: 12, scale: 2 }).notNull(),
    origen: text('origen').notNull().default('masivo_porcentaje'),
    fechaAplicacion: date('fecha_aplicacion').notNull(),
    aplicado: boolean('aplicado').notNull().default(false),
    aplicadoAt: timestamp('aplicado_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('servicios_ajustes_prog_servicio_idx').on(t.servicioId),
    index('servicios_ajustes_prog_guarderia_idx').on(t.guarderiaId),
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
    astillero: text('astillero'),
    modelo: text('modelo'),
    seguro: text('seguro'),
    esloraM: numeric('eslora_m', { precision: 6, scale: 2 }),
    esPrincipal: boolean('es_principal').notNull().default(false),
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
    dni: text('dni'),
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
    esNavegante: boolean('es_navegante').default(false),
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
    // Área a la que pertenece la tarea (derivada de la embarcación → espacio).
    // La tarea la ven los operarios asignados a esta área (ver areaOperarios).
    // NULL = sin área: la ven todos los operarios de la guardería.
    areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
    embarcacionId: uuid('embarcacion_id').references(() => embarcaciones.id, {
      onDelete: 'set null',
    }),
    porteriaId: uuid('porteria_id').references(() => porteria.id, { onDelete: 'set null' }),
    servicioId: uuid('servicio_id').references(() => servicios.id, { onDelete: 'set null' }),
    // true = el barco está en una marina → tarea de marinero; false = nave → operario.
    esMarina: boolean('es_marina').notNull().default(false),
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
    index('tareas_area_idx').on(t.areaId),
  ],
);

// Operarios asignados a cada área (M:N). Una tarea de un área la ven todos los
// operarios asignados a esa área; el que está disponible la "toma".
export const areaOperarios = pgTable(
  'area_operarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    areaId: uuid('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'cascade' }),
    operarioId: uuid('operario_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('area_operarios_area_operario_idx').on(t.areaId, t.operarioId),
    index('area_operarios_operario_idx').on(t.operarioId),
    index('area_operarios_guarderia_idx').on(t.guarderiaId),
  ],
);

// Marineros asignados a cada área (M:N), espejo de areaOperarios pero para
// marinas. Una tarea de marina (es_marina=true) de un área la ven los marineros
// asignados a esa área.
export const areaMarineros = pgTable(
  'area_marineros',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    areaId: uuid('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'cascade' }),
    marineroId: uuid('marinero_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('area_marineros_area_marinero_idx').on(t.areaId, t.marineroId),
    index('area_marineros_marinero_idx').on(t.marineroId),
    index('area_marineros_guarderia_idx').on(t.guarderiaId),
  ],
);

// Notificaciones in-app (campanita). Tabla MOBILE-OWNED (mig mobile 0017): el
// INSERT es solo vía triggers SECURITY DEFINER, no desde el cliente. Acá se
// refleja en Drizzle solo para LECTURA/UPDATE desde el web (ej. drenar el push
// de las notificaciones de marina). `push_sent_at` (mig mobile 0026) marca las
// que el web ya despachó por Expo.
export const notificaciones = pgTable('notificaciones', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  tipo: text('tipo').notNull(),
  payload: jsonb('payload').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  pushSentAt: timestamp('push_sent_at', { withTimezone: true }),
});

// =============================================================================
// FACTURACIÓN & CUENTA CORRIENTE
// =============================================================================

// Centros emisores (puntos de venta ARCA) de cada guardería. Las columnas
// singulares de `guarderias` (puntoDeVenta + tusfacturas*) quedan espejando
// el principal como red de seguridad — el código lee siempre de acá.
export const guarderiaCentrosEmisores = pgTable(
  'guarderia_centros_emisores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    // Número de POS en ARCA. No editable una vez creado.
    puntoDeVenta: integer('punto_de_venta').notNull(),
    // Credenciales propias del POS que devuelve TusFacturas al alta.
    apikey: text('apikey'),
    apitoken: text('apitoken'),
    usertoken: text('usertoken'),
    // El principal es el que usan el cron de auto-emisión y todo flujo que
    // no elige centro emisor a mano. Único por guardería (índice parcial).
    esPrincipal: boolean('es_principal').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('guarderia_centros_emisores_guarderia_idx').on(t.guarderiaId),
    unique('guarderia_centros_emisores_pv_unico').on(t.guarderiaId, t.puntoDeVenta),
  ],
);

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
    // Quién creó el movimiento (cargo o pago). NULL = sistema (cron mensual /
    // cobro Payway). Se completa desde los server actions.
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
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
    datosPago: jsonb('datos_pago'),
    // true = el cargo se documentó con un comprobante INTERNO (no fiscal) al
    // cargar el servicio → se excluye de la facturación automática y manual.
    comprobanteInterno: boolean('comprobante_interno').notNull().default(false),
    // true = este pago es un adelanto sin comprobante (Cobranzas -> "Continuar
    // sin comprobantes"). El pool de saldo a favor lo excluye de saldar OTROS
    // cargos solo — mig 0140, ver reconciliar-cuenta.ts.
    esAdelanto: boolean('es_adelanto').notNull().default(false),
    // Contrato (socio_servicios) que originó el cargo y período facturado
    // (primer día del mes; NULL en one-shots: variables, baja anticipada,
    // notas, cobranzas). Mig 0133: índices únicos parciales sobre
    // (socio_servicio_id, periodo), (socio_servicio_id) one-shot y
    // (espacio_id, socio_id, periodo) garantizan a nivel físico que un mismo
    // contrato/espacio no se facture dos veces el mismo período.
    socioServicioId: uuid('socio_servicio_id').references((): AnyPgColumn => socioServicios.id, {
      onDelete: 'set null',
    }),
    periodo: date('periodo'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('movimientos_socio_idx').on(t.socioId),
    index('movimientos_servicio_idx').on(t.servicioId),
    index('movimientos_created_by_idx').on(t.createdBy),
    // Compuestos para los filtros frecuentes: "pendientes del socio" y
    // "movimientos del socio ordenados por fecha" (detalle de socio, morosos).
    index('movimientos_socio_estado_idx').on(t.socioId, t.estado),
    index('movimientos_socio_fecha_idx').on(t.socioId, t.fecha),
    index('movimientos_cc_socio_servicio_idx').on(t.socioServicioId),
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
    // Identificación interna "FL-NNNNNN", correlativa por guardería. Se suma
    // al codigo que devuelve ARCA — solo para Facturación manual/lote y sus NC.
    folioLocal: text('folio_local'),
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
    cae: text('cae'),
    facturaOriginalId: uuid('factura_original_id').references((): AnyPgColumn => facturacion.id, {
      onDelete: 'set null',
    }),
    movimientoId: uuid('movimiento_id').references(() => movimientosCuentaCorriente.id, {
      onDelete: 'set null',
    }),
    // Recibo de cobranza (RC-): anulación + comprobantes que cobró (para revertir).
    anulada: boolean('anulada').notNull().default(false),
    anuladaAt: timestamp('anulada_at', { withTimezone: true }),
    cobranzaComprobanteIds: uuid('cobranza_comprobante_ids').array(),
    // Solo para recibos de cobranza (RC-). Se calcula sobre TODOS los
    // comprobantes elegidos al registrar la cobranza (no solo los que
    // terminaron cubiertos enteros por el FIFO, que puede quedar vacío en un
    // pago parcial chico) — por eso es un campo propio y no se deriva de
    // `cobranzaComprobanteIds`.
    tipoRecibo: tipoReciboEnum('tipo_recibo'),
    // Factura fiscal rechazada por ARCA vía TusFacturas: se persiste igual
    // (sin folioLocal/codigo/cae) para poder mostrar el motivo y reenviarla
    // una vez corregida, en vez de perder el intento.
    rechazada: boolean('rechazada').notNull().default(false),
    motivoError: text('motivo_error'),
    // Desglose del importe (solo se completa desde que se agregó — los
    // comprobantes viejos quedan en null, no hay de dónde backfillearlos).
    montoNeto: numeric('monto_neto', { precision: 12, scale: 2 }),
    montoExento: numeric('monto_exento', { precision: 12, scale: 2 }),
    montoIva: numeric('monto_iva', { precision: 12, scale: 2 }),
    // Vencimiento del CAE que devuelve TusFacturas (no confundir con
    // `vencimiento`, que es la fecha límite de pago).
    caeVencimiento: date('cae_vencimiento'),
    // Centro emisor (punto de venta) por el que salió — o intentó salir —
    // este comprobante. Permite reenviar una rechazada por el mismo POS.
    centroEmisorId: uuid('centro_emisor_id').references(() => guarderiaCentrosEmisores.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('facturacion_guarderia_idx').on(t.guarderiaId),
    index('facturacion_socio_idx').on(t.socioId),
    index('facturacion_emision_idx').on(t.emision),
    // Compuestos para los filtros del listado de comprobantes: por estado
    // (pendiente/pagada/vencida) y por rango de emisión, siempre scopeados
    // a la guardería.
    index('facturacion_guarderia_estado_idx').on(t.guarderiaId, t.estado),
    index('facturacion_guarderia_emision_idx').on(t.guarderiaId, t.emision),
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
    motivoCancelacion: text('motivo_cancelacion'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('solicitudes_lavado_socio_idx').on(t.socioId, t.estado),
    index('solicitudes_lavado_guarderia_idx').on(t.guarderiaId, t.estado),
    index('solicitudes_lavado_tarea_idx').on(t.tareaId),
    uniqueIndex('solicitudes_lavado_socio_activa_unique')
      .on(t.socioId)
      .where(sql`${t.estado} in ('pendiente', 'aceptada')`),
  ],
);

export const publicaciones = pgTable(
  'publicaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    autorId: uuid('autor_id').references(() => profiles.id, { onDelete: 'set null' }),
    tipo: tipoPublicacionEnum('tipo').notNull(),
    ubicacion: text('ubicacion'),
    eslora: numeric('eslora', { precision: 8, scale: 2 }),
    manga: numeric('manga', { precision: 8, scale: 2 }),
    unidadMetraje: unidadMetrajeEnum('unidad_metraje').notNull().default('metros'),
    puntual: numeric('puntual', { precision: 12, scale: 2 }),
    expensas: numeric('expensas', { precision: 12, scale: 2 }),
    precio: numeric('precio', { precision: 12, scale: 2 }),
    servicios: servicioPublicacionEnum('servicios')
      .array()
      .notNull()
      .default(sql`'{}'`),
    imagenUrls: text('imagen_urls')
      .array()
      .notNull()
      .default(sql`'{}'`),
    estado: estadoPublicacionEnum('estado').notNull().default('borrador'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('publicaciones_guarderia_idx').on(t.guarderiaId)],
);

// =============================================================================
// PAYWAY — débito automático con tarjeta tokenizada
// =============================================================================

export const paywayTokens = pgTable(
  'payway_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    socioId: uuid('socio_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    customerToken: text('customer_token').notNull(),
    paymentMethodId: integer('payment_method_id').notNull(), // 1=Visa, 2=Mastercard, 65=Amex
    bin: text('bin').notNull().default(''), // primeros 6 dígitos, requerido en MIT
    lastFour: text('last_four').notNull(),
    activo: boolean('activo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('payway_tokens_guarderia_socio_unique').on(t.guarderiaId, t.socioId),
    index('payway_tokens_guarderia_idx').on(t.guarderiaId),
    index('payway_tokens_socio_idx').on(t.socioId),
  ],
);

export const paywayCobros = pgTable(
  'payway_cobros',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    socioId: uuid('socio_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    monto: integer('monto').notNull(), // en centavos, ej. $3.000 = 300000
    siteTransactionId: uuid('site_transaction_id').notNull().unique(),
    paywayPaymentId: text('payway_payment_id'),
    estado: paywayCobroEstadoEnum('estado').notNull().default('pendiente'),
    errorMensaje: text('error_mensaje'),
    movimientosIds: uuid('movimientos_ids')
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('payway_cobros_guarderia_idx').on(t.guarderiaId),
    index('payway_cobros_socio_idx').on(t.socioId),
    index('payway_cobros_created_idx').on(t.createdAt),
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

// Listado canónico de features de los planes. group_label se usa solo en el
// grid del super admin para agrupar visualmente (ej "BASE — INCLUIDO EN TODOS
// LOS PLANES"); landing/onboarding/tab Plan del admin lo ignoran y muestran
// lista plana.
export const pricingFeatures = pgTable('pricing_features', {
  id: text('id').primaryKey(),
  groupLabel: text('group_label').notNull(),
  label: text('label').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
});

// Valor de cada (plan, feature). String libre, nullable:
//   NULL/'' = feature no incluida en ese plan
//   '✓'     = incluida sin valor extra (cards muestran solo el label)
//   otro    = incluida con detalle (ej '2 / mes', '30 días gratis')
export const pricingPlanFeatures = pgTable(
  'pricing_plan_features',
  {
    planSlug: planEnum('plan_slug').notNull(),
    featureId: text('feature_id')
      .notNull()
      .references(() => pricingFeatures.id, { onDelete: 'cascade' }),
    value: text('value'),
    bold: boolean('bold').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.planSlug, t.featureId] })],
);

// Snapshot del plan/rate/espacios cada vez que una guardería elige o cambia
// de plan (en onboarding o desde el tab Plan del admin). El plan vigente se
// sigue leyendo de `guarderias.plan`; este historial es solo auditoría.
export const guarderiaPlanHistorial = pgTable(
  'guarderia_plan_historial',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    planSlug: planEnum('plan_slug').notNull(),
    rate: integer('rate').notNull(),
    espacios: integer('espacios').notNull(),
    montoMensual: integer('monto_mensual').notNull(),
    efectivoDesde: timestamp('efectivo_desde', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (t) => [index('guarderia_plan_historial_guarderia_idx').on(t.guarderiaId, t.efectivoDesde)],
);

export const socioServiciosCancelados = pgTable(
  'socio_servicios_cancelados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    socioId: uuid('socio_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    servicioId: uuid('servicio_id')
      .notNull()
      .references(() => servicios.id, { onDelete: 'cascade' }),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    fechaCancelacion: date('fecha_cancelacion').notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.socioId, t.servicioId, t.guarderiaId)],
);

// Servicio Contratado: un registro por contrato (socio + servicio), con su
// propia ventana de vigencia. A diferencia de `socioServiciosCancelados`
// (existence check sin historial) esta tabla SÍ guarda historial — un socio
// puede cancelar y volver a contratar el mismo servicio más adelante, cada
// vez con su propia fila. `fechaInicio`/`fechaBaja` pueden ser pasadas o
// futuras (solo se exige fechaBaja >= fechaInicio) y son la fuente de verdad
// tanto para la UI de "Servicios Contratados" como para el cron de
// facturación mensual (`runMonthlyGeneracionServiciosRecurrentes`), que las
// usa para decidir a quién cobrar — "Cargar Servicio" ya no crea ningún
// movimiento en cuenta corriente al contratar, eso lo hace el cron cuando
// corresponda facturar.
export const socioServicios = pgTable(
  'socio_servicios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    socioId: uuid('socio_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    servicioId: uuid('servicio_id')
      .notNull()
      .references(() => servicios.id, { onDelete: 'cascade' }),
    // Solo para contratos de Espacio de guarda: el espacio físico asociado.
    espacioId: uuid('espacio_id').references(() => espacios.id, { onDelete: 'set null' }),
    // Correlativo global por guardería (entre todos los socios), asignado
    // una vez y nunca reasignado. Mismo patrón que `nextFolioLocal` en
    // facturacion.ts, sin prefijo de letra.
    numeroOperacion: integer('numero_operacion').notNull(),
    // Fecha de creación del registro (inmutable, se muestra como "Fecha de
    // asignación"). No confundir con `fechaInicio`.
    fechaAsignacion: timestamp('fecha_asignacion', { withTimezone: true }).defaultNow().notNull(),
    fechaInicio: date('fecha_inicio').notNull(),
    fechaBaja: date('fecha_baja'),
    // true = los cargos que genere el cron para este contrato se marcan como
    // comprobante interno (no fiscal), igual que `comprobanteInterno` en
    // movimientos_cuenta_corriente. Elegido una vez al contratar.
    comprobanteInterno: boolean('comprobante_interno').notNull().default(false),
    // true = los cargos de este contrato entran al débito automático Payway,
    // si además el socio está adherido (memberships.cobro_automatico_payway).
    // Default al contratar = tilde del socio; editable después. Mig 0136.
    debitoAutomatico: boolean('debito_automatico').notNull().default(false),
    // Detalle opcional tipeado al contratar; si es null, el cron usa el
    // nombre de la tarifa como concepto del cargo.
    concepto: text('concepto'),
    // Solo para contratos de tarifa Variable diaria (servicios.tarifa_variable
    // = 'diaria'): cantidad de días contratados, tipeada al cargar el
    // servicio. El cargo único del cron = precio diario × cantidad de días.
    cantidadDias: integer('cantidad_dias'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('socio_servicios_guarderia_socio_servicio_idx').on(
      t.guarderiaId,
      t.socioId,
      t.servicioId,
    ),
    index('socio_servicios_vigencia_idx').on(t.socioId, t.fechaInicio, t.fechaBaja),
  ],
);

// Ítems one-shot "pendientes de facturar" con monto custom, no derivable del
// tarifario (hoy el único origen es el cobro por baja anticipada). Nacen
// pendientes (movimiento_id NULL); la emisión del próximo comprobante del
// socio los consume seteando movimiento_id dentro de la misma transacción.
// El admin puede descartarlos antes de emitir con anulado = true.
export const cargosPendientes = pgTable(
  'cargos_pendientes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guarderiaId: uuid('guarderia_id')
      .notNull()
      .references(() => guarderias.id, { onDelete: 'cascade' }),
    socioId: uuid('socio_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    servicioId: uuid('servicio_id').references(() => servicios.id, { onDelete: 'set null' }),
    socioServicioId: uuid('socio_servicio_id').references(() => socioServicios.id, {
      onDelete: 'set null',
    }),
    origen: text('origen').notNull(), // CHECK en DB: 'baja_anticipada'
    concepto: text('concepto').notNull(),
    importe: numeric('importe', { precision: 12, scale: 2 }).notNull(),
    alicuotaIva: numeric('alicuota_iva', { precision: 5, scale: 2 }),
    comprobanteInterno: boolean('comprobante_interno').notNull().default(false),
    movimientoId: uuid('movimiento_id').references(() => movimientosCuentaCorriente.id, {
      onDelete: 'set null',
    }),
    anulado: boolean('anulado').notNull().default(false),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('cargos_pendientes_pendientes_idx').on(t.guarderiaId, t.socioId)],
);

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
  // Secciones de la mobile donde aparece. NULL/empty = todas las secciones
  // de su tamaño. Es un array para permitir targetear varias pantallas con
  // la misma publi (mig 0034).
  secciones: publicidadSeccionEnum('secciones').array(),
  // Rango calendario de exhibición. NULL = sin restricción de fechas.
  fechaInicio: date('fecha_inicio'),
  fechaFin: date('fecha_fin'),
  linkUrl: text('link_url'),
  imagenUrls: text('imagen_urls').array(),
  publicar: boolean('publicar').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Expo Push Tokens registrados por dispositivos mobile. El cron de
// /api/cron/notificaciones-push lee esta tabla para resolver a qué tokens
// le pega el Expo Push Service por cada notificación pendiente.
export const deviceTokens = pgTable('device_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  expoPushToken: text('expo_push_token').notNull().unique(),
  platform: text('platform'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Cola de notificaciones push a nivel plataforma. El super admin las compone
// desde /super-admin/notificaciones; el cron en /api/cron/notificaciones-push
// las consume y dispara los pushes vía Expo Push Service.
export const platformNotificaciones = pgTable('platform_notificaciones', {
  id: uuid('id').primaryKey().defaultRandom(),
  autorId: uuid('autor_id').references(() => profiles.id, { onDelete: 'set null' }),
  titulo: text('titulo').notNull(),
  cuerpo: text('cuerpo').notNull(),
  audiencia: notificacionAudienciaEnum('audiencia').notNull(),
  estado: notificacionEstadoEnum('estado').notNull().default('pendiente'),
  error: text('error'),
  enviadoEn: timestamp('enviado_en', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Versiones publicadas de los Términos y Condiciones. La vigente es la
// fila con el mayor `version`. Texto en markdown.
export const terminosVersiones = pgTable(
  'terminos_versiones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: integer('version').notNull().unique(),
    contenido: text('contenido').notNull(),
    publicadoEn: timestamp('publicado_en', { withTimezone: true }).defaultNow().notNull(),
    publicadoPor: uuid('publicado_por').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (t) => [index('terminos_versiones_version_desc_idx').on(t.version)],
);

// Histórico de aceptaciones de T&C por usuario. Una fila por cada vez que
// el user acepta una versión (al registrarse o cuando cambia la versión
// vigente y vuelve a aceptar). Inmutable.
export const terminosAceptaciones = pgTable(
  'terminos_aceptaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    aceptadoEn: timestamp('aceptado_en', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('terminos_aceptaciones_user_idx').on(t.userId, t.aceptadoEn),
    index('terminos_aceptaciones_user_version_idx').on(t.userId, t.version),
  ],
);

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
  publicaciones: many(publicaciones),
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

export const publicacionesRelations = relations(publicaciones, ({ one }) => ({
  guarderia: one(guarderias, { fields: [publicaciones.guarderiaId], references: [guarderias.id] }),
  autor: one(profiles, { fields: [publicaciones.autorId], references: [profiles.id] }),
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
export type PricingFeature = typeof pricingFeatures.$inferSelect;
export type NewPricingFeature = typeof pricingFeatures.$inferInsert;
export type PricingPlanFeature = typeof pricingPlanFeatures.$inferSelect;
export type NewPricingPlanFeature = typeof pricingPlanFeatures.$inferInsert;
export type GuarderiaPlanHistorial = typeof guarderiaPlanHistorial.$inferSelect;
export type NewGuarderiaPlanHistorial = typeof guarderiaPlanHistorial.$inferInsert;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type PlatformComunicacion = typeof platformComunicaciones.$inferSelect;
export type NewPlatformComunicacion = typeof platformComunicaciones.$inferInsert;
export type PlatformPublicidad = typeof platformPublicidades.$inferSelect;
export type NewPlatformPublicidad = typeof platformPublicidades.$inferInsert;
export type Publicacion = typeof publicaciones.$inferSelect;
export type NewPublicacion = typeof publicaciones.$inferInsert;
