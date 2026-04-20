CREATE TYPE "public"."categoria_comunicacion" AS ENUM('informacion', 'anuncio', 'evento', 'mantenimiento', 'alerta');--> statement-breakpoint
CREATE TYPE "public"."categoria_proveedor" AS ENUM('mantenimiento', 'combustible', 'electronica', 'pinturas', 'grua', 'velas', 'seguridad', 'motores', 'limpieza', 'accesorios');--> statement-breakpoint
CREATE TYPE "public"."condicion_frente_iva" AS ENUM('consumidor_final', 'responsable_inscripto', 'monotributo', 'exento', 'cliente_exterior', 'iva_no_alcanzado');--> statement-breakpoint
CREATE TYPE "public"."condicion_venta" AS ENUM('dias_5', 'dias_10', 'dias_15', 'dias_20', 'dias_30', 'dias_45', 'dias_60', 'dias_90', 'contado', 'cuenta_corriente', 'transferencia_bancaria', 'tarjeta_credito', 'tarjeta_debito', 'otros', 'mercadopago', 'payway');--> statement-breakpoint
CREATE TYPE "public"."dia_semana" AS ENUM('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo');--> statement-breakpoint
CREATE TYPE "public"."estado_cta_cte" AS ENUM('pagado', 'no_pagado', 'facturado');--> statement-breakpoint
CREATE TYPE "public"."estado_espacio" AS ENUM('disponible', 'ocupado', 'reservado');--> statement-breakpoint
CREATE TYPE "public"."estado_factura" AS ENUM('pagada', 'pendiente', 'vencida');--> statement-breakpoint
CREATE TYPE "public"."estado_invitado" AS ENUM('activo', 'inactivo');--> statement-breakpoint
CREATE TYPE "public"."estado_miembro" AS ENUM('activo', 'inactivo');--> statement-breakpoint
CREATE TYPE "public"."estado_orden" AS ENUM('pendiente', 'en_preparacion', 'listo', 'entregado');--> statement-breakpoint
CREATE TYPE "public"."estado_pago" AS ENUM('pendiente', 'fallido', 'aprobado');--> statement-breakpoint
CREATE TYPE "public"."estado_proveedor" AS ENUM('activo', 'inactivo');--> statement-breakpoint
CREATE TYPE "public"."estado_qr" AS ENUM('activo', 'usado', 'revocado');--> statement-breakpoint
CREATE TYPE "public"."estado_reserva" AS ENUM('pendiente', 'confirmada', 'rechazada');--> statement-breakpoint
CREATE TYPE "public"."estado_servicio" AS ENUM('activo', 'inactivo');--> statement-breakpoint
CREATE TYPE "public"."estado_socio" AS ENUM('activo', 'moroso');--> statement-breakpoint
CREATE TYPE "public"."estado_tarea" AS ENUM('preparar', 'navegando', 'guardada', 'lavado');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."medida" AS ENUM('hasta_16', 'hasta_18', 'hasta_19', 'hasta_21', 'hasta_23', 'hasta_25', 'hasta_29', 'hasta_32', 'hasta_35', 'hasta_40', 'hasta_42', 'hasta_44', 'hasta_46', 'hasta_50', 'hasta_55', 'hasta_60', 'hasta_65', 'hasta_70', 'hasta_74', 'hasta_86', 'hasta_105');--> statement-breakpoint
CREATE TYPE "public"."medio_pago" AS ENUM('efectivo', 'tarjeta_credito', 'tarjeta_debito', 'debito_automatico', 'transferencia', 'cheque');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'suspended', 'removed');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('classic', 'plus', 'platinum');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('super_admin', 'administrador_general', 'operario', 'contable', 'mantenimiento', 'comunicaciones', 'restaurantes', 'socio', 'invitado', 'proveedor');--> statement-breakpoint
CREATE TYPE "public"."tipo_comunicacion" AS ENUM('socios', 'publica');--> statement-breakpoint
CREATE TYPE "public"."tipo_cta_cte" AS ENUM('mensual', 'espacio', 'otro');--> statement-breakpoint
CREATE TYPE "public"."tipo_documento_adjunto" AS ENUM('carnet_nautico', 'matricula', 'seguro');--> statement-breakpoint
CREATE TYPE "public"."tipo_documento" AS ENUM('dni', 'cuit', 'pasaporte', 'cdi', 'cuil');--> statement-breakpoint
CREATE TYPE "public"."tipo_factura" AS ENUM('factura_a', 'factura_b', 'factura_c');--> statement-breakpoint
CREATE TYPE "public"."tipo_invitado" AS ENUM('titular', 'autorizado');--> statement-breakpoint
CREATE TYPE "public"."tipo_porteria" AS ENUM('salida_embarcacion', 'ingreso_embarcacion');--> statement-breakpoint
CREATE TYPE "public"."tipo_servicio" AS ENUM('cuota_mensual', 'servicios', 'espacios');--> statement-breakpoint
CREATE TABLE "actividad_porteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"porteria_id" uuid,
	"socio_id" uuid,
	"invitado_id" uuid,
	"tipo" "tipo_porteria",
	"fecha" timestamp with time zone DEFAULT now(),
	"hora" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias_amarras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comunicaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"autor_id" uuid,
	"titulo" text NOT NULL,
	"texto" text,
	"categoria" "categoria_comunicacion",
	"tipo" "tipo_comunicacion" DEFAULT 'socios',
	"publicar" boolean DEFAULT false,
	"fecha" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datos_facturacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"razon_social" text,
	"numero_de_documento" text,
	"tipo_de_documento" "tipo_documento",
	"condicion_frente_iva" "condicion_frente_iva",
	"punto_de_venta" integer,
	"rubro" text,
	"fecha_inicio" timestamp with time zone,
	"apikey" text,
	"apitoken" text,
	"usertoken" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_documento_adjunto",
	"documento_url" text,
	"vencimiento" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embarcaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"profile_id" uuid,
	"espacio_id" uuid,
	"nombre" text NOT NULL,
	"matricula" text,
	"modelo" text,
	"seguro" text,
	"ubicacion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "espacios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"area_id" uuid,
	"nave_id" uuid,
	"lado_id" uuid,
	"piso_id" uuid,
	"marina_id" uuid,
	"ocupante_id" uuid,
	"servicio_id" uuid,
	"nomenclatura" text,
	"lugar" text,
	"tipo" text,
	"estado" "estado_espacio" DEFAULT 'disponible',
	"eslora" numeric(8, 2),
	"manga" numeric(8, 2),
	"global" numeric(12, 2),
	"puntual" numeric(12, 2),
	"tarifa" numeric(12, 2),
	"offset" integer DEFAULT 0,
	"observaciones" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facturacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"socio_id" uuid,
	"codigo" text,
	"archivo" text,
	"descripcion" text,
	"tipo_factura" "tipo_factura",
	"estado" "estado_factura" DEFAULT 'pendiente',
	"condicion_venta" "condicion_venta",
	"medio_pago" "medio_pago",
	"importe" numeric(12, 2),
	"emision" timestamp with time zone,
	"desde" timestamp with time zone,
	"hasta" timestamp with time zone,
	"vencimiento" timestamp with time zone,
	"external_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facturacion_item_movimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facturacion_item_id" uuid NOT NULL,
	"movimiento_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facturacion_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facturacion_id" uuid NOT NULL,
	"socio_id" uuid,
	"importe" numeric(12, 2),
	"confirmado" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guarderias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"descripcion" text,
	"cuit" text,
	"email" text,
	"telefono" text,
	"direccion" text,
	"ciudad" text,
	"provincia" text,
	"codigo_postal" text,
	"tipo" text,
	"logo_url" text,
	"imagenes" text[],
	"facebook" text,
	"instagram" text,
	"plan" "plan" DEFAULT 'classic',
	"activar_clima_y_mareas" boolean DEFAULT false,
	"activar_menu_gastronomico" boolean DEFAULT false,
	"activar_notificaciones" boolean DEFAULT false,
	"activar_pagos_online" boolean DEFAULT false,
	"activar_reservas_online" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horarios_dia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"dia" "dia_semana" NOT NULL,
	"horarios" text,
	"cerrado" boolean DEFAULT false,
	"orden" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"socio_id" uuid,
	"user_id" uuid,
	"nombre" text NOT NULL,
	"apellido" text,
	"email" text,
	"telefono" text,
	"motivo" text,
	"tipo" "tipo_invitado" DEFAULT 'titular',
	"estado" "estado_invitado" DEFAULT 'activo',
	"cantidad_acompanantes" integer DEFAULT 0,
	"valido_hasta" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"email" text NOT NULL,
	"rol" "rol" NOT NULL,
	"token" text NOT NULL,
	"invited_by" uuid,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items_orden" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orden_id" uuid NOT NULL,
	"plato_id" uuid,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"precio" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"area_id" uuid,
	"nave_id" uuid,
	"nombre" text NOT NULL,
	"cantidad_pisos" integer DEFAULT 0,
	"espacios_total" integer DEFAULT 0,
	"confirmado" boolean DEFAULT false,
	"espacios" integer[],
	"espacios_resto" integer[],
	"pisos" integer[],
	"resto" integer[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marinas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"area_id" uuid,
	"nombre" text NOT NULL,
	"eslora" numeric(8, 2),
	"medida_eslora" "medida",
	"manga" numeric(8, 2),
	"notas" text,
	"orden" integer DEFAULT 0,
	"precio" numeric(12, 2),
	"puntual" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"rol" "rol" DEFAULT 'socio' NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos_cuenta_corriente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"socio_id" uuid NOT NULL,
	"servicio_id" uuid,
	"concepto" text,
	"tipo" "tipo_cta_cte",
	"estado" "estado_cta_cte" DEFAULT 'no_pagado',
	"debe" numeric(12, 2) DEFAULT '0',
	"haber" numeric(12, 2) DEFAULT '0',
	"saldo_post" numeric(12, 2) DEFAULT '0',
	"importe_signed" numeric(12, 2) DEFAULT '0',
	"fecha" timestamp with time zone DEFAULT now(),
	"proximo_pago" timestamp with time zone,
	"forma_de_pago" "medio_pago",
	"banco_transferencia" text,
	"cbu_alias_transferencia" text,
	"cliente_transferencia" text,
	"monto_transferencia" numeric(12, 2),
	"fecha_transferencia" timestamp with time zone,
	"numero_operacion_transferencia" text,
	"observaciones_transferencia" text,
	"comprobante_transferencia_urls" text[],
	"banco_emisor_cheque" text,
	"cuenta_cheque" text,
	"cuit_cuil_cheque" text,
	"importe_cheque" numeric(12, 2),
	"moneda_cheque" text,
	"numero_cheque" text,
	"sucursal_cheque" text,
	"tipo_cheque" text,
	"titular_cheque" text,
	"observaciones_cheque" text,
	"comprobante_cheque_urls" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"area_id" uuid,
	"nombre" text NOT NULL,
	"eslora" numeric(8, 2),
	"manga" numeric(8, 2),
	"notas" text,
	"orden" integer DEFAULT 0,
	"puntual" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ordenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"profile_id" uuid,
	"estado" "estado_orden" DEFAULT 'pendiente',
	"total" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orden_id" uuid,
	"restaurante_id" uuid,
	"monto" numeric(12, 2),
	"estado" "estado_pago" DEFAULT 'pendiente',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pisos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid,
	"lado_id" uuid,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0,
	"ultimo" integer DEFAULT 0,
	"espacios" integer[],
	"espacios_resto" integer[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"categoria" text,
	"precio" numeric(12, 2),
	"tiempo" integer,
	"disponible" boolean DEFAULT true,
	"imagen_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "porteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"socio_id" uuid,
	"invitado_id" uuid,
	"invitado_user_id" uuid,
	"embarcacion_id" uuid,
	"qr" text,
	"estado" "estado_qr" DEFAULT 'activo',
	"motivo" text,
	"desde" timestamp with time zone,
	"hasta" timestamp with time zone,
	"expiracion" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "porteria_qr_unique" UNIQUE("qr")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nombre" text,
	"apellido" text,
	"telefono" text,
	"direccion" text,
	"numero_documento" text,
	"tipo_documento" "tipo_documento",
	"condicion_iva" "condicion_frente_iva",
	"razon_social" text,
	"sede" text,
	"usertoken" text,
	"qr" text,
	"deuda" numeric(12, 2) DEFAULT '0',
	"estado_socio" "estado_socio" DEFAULT 'activo',
	"estado_miembro" "estado_miembro" DEFAULT 'activo',
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"profile_id" uuid,
	"nombre" text NOT NULL,
	"apellido" text,
	"email" text,
	"telefono" text,
	"categoria" "categoria_proveedor",
	"estado" "estado_proveedor" DEFAULT 'activo',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurante_id" uuid NOT NULL,
	"profile_id" uuid,
	"fecha" timestamp with time zone,
	"personas" integer DEFAULT 1,
	"estado" "estado_reserva" DEFAULT 'pendiente',
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"categoria_amarra_id" uuid,
	"nombre" text NOT NULL,
	"tipo" "tipo_servicio" NOT NULL,
	"estado" "estado_servicio" DEFAULT 'activo',
	"precio" numeric(12, 2),
	"eslora" numeric(8, 2),
	"medida_eslora" "medida",
	"manga" numeric(8, 2),
	"medida_manga" "medida",
	"medida" "medida",
	"puntual" numeric(12, 2),
	"medida_puntual" "medida",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tareas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"operario_id" uuid,
	"embarcacion_id" uuid,
	"porteria_id" uuid,
	"servicio_id" uuid,
	"descripcion" text NOT NULL,
	"nota" text,
	"estado" "estado_tarea" DEFAULT 'preparar',
	"fecha_hora" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tarifas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guarderia_id" uuid NOT NULL,
	"medida" "medida" NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"vigente" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actividad_porteria" ADD CONSTRAINT "actividad_porteria_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividad_porteria" ADD CONSTRAINT "actividad_porteria_porteria_id_porteria_id_fk" FOREIGN KEY ("porteria_id") REFERENCES "public"."porteria"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividad_porteria" ADD CONSTRAINT "actividad_porteria_socio_id_profiles_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividad_porteria" ADD CONSTRAINT "actividad_porteria_invitado_id_profiles_id_fk" FOREIGN KEY ("invitado_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias_amarras" ADD CONSTRAINT "categorias_amarras_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicaciones" ADD CONSTRAINT "comunicaciones_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicaciones" ADD CONSTRAINT "comunicaciones_autor_id_profiles_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datos_facturacion" ADD CONSTRAINT "datos_facturacion_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embarcaciones" ADD CONSTRAINT "embarcaciones_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embarcaciones" ADD CONSTRAINT "embarcaciones_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embarcaciones" ADD CONSTRAINT "embarcaciones_espacio_id_espacios_id_fk" FOREIGN KEY ("espacio_id") REFERENCES "public"."espacios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espacios" ADD CONSTRAINT "espacios_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espacios" ADD CONSTRAINT "espacios_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espacios" ADD CONSTRAINT "espacios_nave_id_naves_id_fk" FOREIGN KEY ("nave_id") REFERENCES "public"."naves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espacios" ADD CONSTRAINT "espacios_lado_id_lados_id_fk" FOREIGN KEY ("lado_id") REFERENCES "public"."lados"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espacios" ADD CONSTRAINT "espacios_piso_id_pisos_id_fk" FOREIGN KEY ("piso_id") REFERENCES "public"."pisos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espacios" ADD CONSTRAINT "espacios_marina_id_marinas_id_fk" FOREIGN KEY ("marina_id") REFERENCES "public"."marinas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espacios" ADD CONSTRAINT "espacios_ocupante_id_profiles_id_fk" FOREIGN KEY ("ocupante_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "espacios" ADD CONSTRAINT "espacios_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturacion" ADD CONSTRAINT "facturacion_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturacion" ADD CONSTRAINT "facturacion_socio_id_profiles_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturacion_item_movimientos" ADD CONSTRAINT "facturacion_item_movimientos_facturacion_item_id_facturacion_items_id_fk" FOREIGN KEY ("facturacion_item_id") REFERENCES "public"."facturacion_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturacion_item_movimientos" ADD CONSTRAINT "facturacion_item_movimientos_movimiento_id_movimientos_cuenta_corriente_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."movimientos_cuenta_corriente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturacion_items" ADD CONSTRAINT "facturacion_items_facturacion_id_facturacion_id_fk" FOREIGN KEY ("facturacion_id") REFERENCES "public"."facturacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturacion_items" ADD CONSTRAINT "facturacion_items_socio_id_profiles_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_dia" ADD CONSTRAINT "horarios_dia_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados" ADD CONSTRAINT "invitados_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados" ADD CONSTRAINT "invitados_socio_id_profiles_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados" ADD CONSTRAINT "invitados_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items_orden" ADD CONSTRAINT "items_orden_orden_id_ordenes_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items_orden" ADD CONSTRAINT "items_orden_plato_id_platos_id_fk" FOREIGN KEY ("plato_id") REFERENCES "public"."platos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lados" ADD CONSTRAINT "lados_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lados" ADD CONSTRAINT "lados_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lados" ADD CONSTRAINT "lados_nave_id_naves_id_fk" FOREIGN KEY ("nave_id") REFERENCES "public"."naves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marinas" ADD CONSTRAINT "marinas_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marinas" ADD CONSTRAINT "marinas_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_cuenta_corriente" ADD CONSTRAINT "movimientos_cuenta_corriente_socio_id_profiles_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_cuenta_corriente" ADD CONSTRAINT "movimientos_cuenta_corriente_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naves" ADD CONSTRAINT "naves_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "naves" ADD CONSTRAINT "naves_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_orden_id_ordenes_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pisos" ADD CONSTRAINT "pisos_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pisos" ADD CONSTRAINT "pisos_lado_id_lados_id_fk" FOREIGN KEY ("lado_id") REFERENCES "public"."lados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platos" ADD CONSTRAINT "platos_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "porteria" ADD CONSTRAINT "porteria_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "porteria" ADD CONSTRAINT "porteria_socio_id_profiles_id_fk" FOREIGN KEY ("socio_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "porteria" ADD CONSTRAINT "porteria_invitado_id_invitados_id_fk" FOREIGN KEY ("invitado_id") REFERENCES "public"."invitados"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "porteria" ADD CONSTRAINT "porteria_invitado_user_id_profiles_id_fk" FOREIGN KEY ("invitado_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "porteria" ADD CONSTRAINT "porteria_embarcacion_id_embarcaciones_id_fk" FOREIGN KEY ("embarcacion_id") REFERENCES "public"."embarcaciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_restaurante_id_restaurantes_id_fk" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurantes" ADD CONSTRAINT "restaurantes_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_categoria_amarra_id_categorias_amarras_id_fk" FOREIGN KEY ("categoria_amarra_id") REFERENCES "public"."categorias_amarras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_operario_id_profiles_id_fk" FOREIGN KEY ("operario_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_embarcacion_id_embarcaciones_id_fk" FOREIGN KEY ("embarcacion_id") REFERENCES "public"."embarcaciones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_porteria_id_porteria_id_fk" FOREIGN KEY ("porteria_id") REFERENCES "public"."porteria"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_guarderia_id_guarderias_id_fk" FOREIGN KEY ("guarderia_id") REFERENCES "public"."guarderias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actividad_porteria_guarderia_idx" ON "actividad_porteria" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "areas_guarderia_idx" ON "areas" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "comunicaciones_guarderia_idx" ON "comunicaciones" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "documentos_profile_idx" ON "documentos" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "embarcaciones_guarderia_idx" ON "embarcaciones" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "espacios_guarderia_idx" ON "espacios" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "espacios_estado_idx" ON "espacios" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "facturacion_guarderia_idx" ON "facturacion" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "facturacion_socio_idx" ON "facturacion" USING btree ("socio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guarderias_slug_idx" ON "guarderias" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "invitados_guarderia_idx" ON "invitados" USING btree ("guarderia_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_idx" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invitations_guarderia_email_idx" ON "invitations" USING btree ("guarderia_id","email");--> statement-breakpoint
CREATE INDEX "lados_nave_idx" ON "lados" USING btree ("nave_id");--> statement-breakpoint
CREATE INDEX "marinas_guarderia_idx" ON "marinas" USING btree ("guarderia_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_guarderia_idx" ON "memberships" USING btree ("user_id","guarderia_id");--> statement-breakpoint
CREATE INDEX "memberships_guarderia_idx" ON "memberships" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "movimientos_socio_idx" ON "movimientos_cuenta_corriente" USING btree ("socio_id");--> statement-breakpoint
CREATE INDEX "naves_guarderia_idx" ON "naves" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "ordenes_restaurante_idx" ON "ordenes" USING btree ("restaurante_id");--> statement-breakpoint
CREATE INDEX "pisos_lado_idx" ON "pisos" USING btree ("lado_id");--> statement-breakpoint
CREATE INDEX "platos_restaurante_idx" ON "platos" USING btree ("restaurante_id");--> statement-breakpoint
CREATE INDEX "porteria_guarderia_idx" ON "porteria" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "proveedores_guarderia_idx" ON "proveedores" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "reservas_restaurante_idx" ON "reservas" USING btree ("restaurante_id");--> statement-breakpoint
CREATE INDEX "servicios_guarderia_idx" ON "servicios" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "tareas_guarderia_idx" ON "tareas" USING btree ("guarderia_id");--> statement-breakpoint
CREATE INDEX "tareas_operario_idx" ON "tareas" USING btree ("operario_id");--> statement-breakpoint
CREATE INDEX "tarifas_guarderia_idx" ON "tarifas" USING btree ("guarderia_id");