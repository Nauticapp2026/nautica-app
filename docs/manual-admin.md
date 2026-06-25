# Manual del Administrador — NauticApp

Guía paso a paso para gestionar tu club o guardería náutica desde el panel web.

---

## Índice

1. [Primeros pasos](#1-primeros-pasos)
2. [Dashboard](#2-dashboard)
3. [Usuarios — Socios](#3-usuarios--socios)
4. [Usuarios — Carga masiva](#4-usuarios--carga-masiva)
5. [Solicitudes de membresía](#5-solicitudes-de-membresía)
6. [Tareas](#6-tareas)
7. [Espacios](#7-espacios)
8. [Publicaciones](#8-publicaciones)
9. [Comunicaciones](#9-comunicaciones)
10. [Comprobantes](#10-comprobantes)
11. [Tarifario](#11-tarifario)
12. [Configuración](#12-configuración)
13. [Débito automático (Payway)](#13-débito-automático-payway)

---

## 1. Primeros pasos

### Ingresar al panel

1. Abrí el navegador y entrá a **www.nauticapp.club**.
2. Ingresá con tu **email** y **contraseña**.
3. Si es tu primera vez, revisá el email de invitación que recibiste y hacé clic en el enlace para activar tu cuenta.

### Navegar por el panel

El menú lateral izquierdo es la navegación principal. Desde ahí accedés a todas las secciones:

- **Dashboard** — resumen operativo del día
- **Usuarios** — socios, invitados y proveedores
- **Solicitudes** — pedidos de nuevos socios desde la app mobile
- **Tareas** — tablero operativo para el equipo
- **Espacios** — amarras, camas y ubicaciones
- **Publicaciones** — avisos de amarras y camas en NautiShop
- **Comunicaciones** — anuncios y novedades para socios
- **Comprobantes** — emisión y seguimiento de facturas
- **Tarifario** — precios y servicios
- **Configuración** — datos del club, equipo, plan y facturación

En la parte inferior del menú encontrás el botón **¿Necesitás ayuda?** para contactar soporte por WhatsApp.

---

## 2. Dashboard

El Dashboard es la pantalla de inicio. Muestra el estado operativo del club en tiempo real. Los datos **se actualizan automáticamente** sin necesidad de recargar la página: cualquier cambio registrado por un operario, desde la app mobile o desde otra pestaña del panel se refleja en segundos. Cuando volvés a la pestaña tras haberla tenido en segundo plano, también se refresca automáticamente.

### Qué muestra

- **Embarcaciones en guardería** — cantidad de embarcaciones actualmente activas.
- **Socios activos** — total de socios con estado activo.
- **Ingresos del mes** — monto facturado en el mes en curso.
- **Socios con deuda 2+ meses** — socios con movimientos pendientes de cobro desde hace más de dos meses.
- **Socios con documentación incompleta** — socios a los que les falta subir documentación.

### Alertas operativas

Las alertas aparecen cuando hay embarcaciones que salieron y no confirmaron su regreso dentro del horario prometido.

- **Críticas** — sin respuesta del socio (marcadas en rojo).
- **Retorno próximo** — esperando confirmación de arribo.

Cada alerta muestra el nombre del socio, la embarcación, la hora prometida y la demora acumulada.

**Resolver una alerta:**

Las acciones disponibles dependen del tipo de alerta.

**Alertas críticas (sin respuesta del socio):**

1. Si el socio tiene teléfono cargado, aparece el botón **Llamar**. Al tocarlo desde el celular abre el marcador directamente con el número del socio.
2. Si el socio no responde y necesitás cerrar la salida manualmente, hacé clic en **Cerrar salida**. Esto registra el arribo en ese momento y desactiva la alerta de forma permanente.

**Alertas de retorno próximo:**

1. Si el socio tiene teléfono cargado, aparece el botón **Llamar**.
2. Si el socio no responde y necesitás cerrar la salida manualmente, hacé clic en **Cerrar salida**. Esto registra el arribo en ese momento y desactiva la alerta de forma permanente.
3. Una vez resuelto el tema, hacé clic en **Marcar resuelta** para cerrar la alerta sin registrar arribo.

---

## 3. Usuarios — Socios

La sección Usuarios tiene tres pestañas: **Socios**, **Invitados** y **Proveedores**. Cada una muestra los miembros del club con ese rol y permite gestionarlos individualmente.

### Usuarios — Socios

Desde **Usuarios → Socios** gestionás el padrón de socios de tu club.

### Ver la lista de socios

La tabla muestra: número de socio (#), nombre, email, embarcación asignada, ubicación, fecha de ingreso, estado y deuda.

- Usá la barra de búsqueda para filtrar por nombre o email.
- Hacé clic en el encabezado **#** para ordenar la lista por número de socio (ascendente o descendente).
- La columna **Ingreso** muestra la fecha en que se incorporó el socio al club.
- El **número de socio** (#NNN) aparece como un chip junto al nombre. Podés editarlo en el perfil del socio → pestaña **Generales**.
- El **estado** de la membresía se indica con un badge de color:
  - **Verde (Activo)** — socio con membresía vigente.
  - **Ámbar (Pausado)** — membresía temporalmente suspendida.
  - **Gris (Inactivo)** — socio inactivo.
  - **Rojo (Moroso)** — socio con deuda pendiente.
- Si un socio tiene un **ícono de alerta amarillo** junto a su nombre, significa que tiene datos de perfil o documentación incompletos. Hacé clic en su nombre para ver qué falta completar.
- Cada fila tiene un **botón chevron (›)** a la derecha. Al hacerle clic se despliega un panel con:
  - **Invitados autorizados** — personas registradas por el socio como invitados permanentes. Cada nombre muestra la fecha hasta la que está autorizado (ej: `· válido hasta 30/06/2026`). No incluye accesos externos.
  - **Accesos externos recientes** — últimas entradas registradas por portería como acceso externo. Cada nombre muestra la fecha de la última entrada (ej: `· desde 19/06/2026`). Si la misma persona ingresó varias veces, aparece una sola vez con la entrada más reciente.

### Dar de alta un socio manualmente

1. Hacé clic en **Agregar socio**.
2. Completá los datos en el formulario (las secciones se van desplegando):

   **Datos personales**
   - Nombre y apellido
   - Email _(requerido)_
   - Teléfono
   - Tipo de documento _(requerido)_: DNI / CUIT / CUIL / Pasaporte / CDI
   - Número de documento _(requerido)_

   **Datos impositivos**
   - **Emite comprobante fiscal** — si está marcado, el socio aparece en los selectores de facturación (individual, ventanilla y lote) y se habilitan los campos de Razón social y Condición frente al IVA. Desmarcalo si el socio no requiere factura fiscal — esos campos se desactivan y el socio no aparecerá en ningún flujo de emisión de comprobantes AFIP.
   - Razón social _(disponible solo si marcaste "Emite comprobante fiscal")_
   - Condición frente al IVA _(disponible solo si marcaste "Emite comprobante fiscal")_: Consumidor Final / Responsable Monotributo / IVA Responsable Inscripto / IVA Sujeto Exento / Proveedor del Exterior / Cliente del Exterior / IVA No Alcanzado
   - Dirección, ciudad, código postal

   **Datos de embarcación** _(opcional al momento del alta)_
   - Nombre de la embarcación
   - Matrícula
   - Modelo
   - Eslora: ingresá el valor y usá el toggle **m / pies** para elegir la unidad (siempre se guarda en metros)
   - Manga

   **Adjuntos** _(opcional)_
   - Podés subir documentación desde esta sección o hacerlo después desde el perfil del socio.

3. Hacé clic en **Guardar**.

### Ver y editar el perfil de un socio

Hacé clic en el nombre del socio en la tabla para abrir su perfil. El perfil tiene nueve pestañas:

#### Pestaña Generales

Mostrá y editá los datos personales: nombre, apellido, email, teléfono, documento y dirección.

- **Número de socio** — campo editable para asignar o modificar el número interno del socio. El número aparece como chip (#NNN) en la cabecera del perfil y en la lista de socios.
- **Estado de membresía** — selector en la cabecera del perfil para cambiar el estado: **Activo**, **Pausado**, **Inactivo**. También está disponible la opción **Eliminar** para desvincular al socio del club.

#### Pestaña Datos Impositivos

Mostrá y editá los datos fiscales del socio: razón social, CUIT, dirección fiscal, **email de facturación**, condición frente al IVA e Ingresos Brutos.

El **email de facturación** es la dirección a la que se envía el comprobante. Si se deja vacío, se usa el email de la cuenta del socio (pestaña Generales).

**Usar datos personales para facturación** — checkbox en la parte superior de esta pestaña. Define **con qué datos se emiten los comprobantes** del socio:

- **Desactivado** (valor por defecto): se factura con los **Datos Impositivos** (razón social, CUIT, dirección fiscal y condición frente al IVA de esta pestaña).
- **Activado**: se factura con los **datos personales** del socio (nombre y apellido, tipo y número de documento, dirección y condición frente al IVA cargados en la pestaña **Generales**).

> **Importante:** todos los socios activos aparecen en los flujos de facturación (individual, ventanilla y lote). Este checkbox ya **no** controla si el socio aparece o no en el módulo: solo elige el conjunto de datos con el que se emite.

> **Campos requeridos para poder emitir factura AFIP al socio:**
>
> Según el modo elegido, el receptor del comprobante necesita: **razón social / nombre**, **documento** (CUIT para Responsable Inscripto o Monotributo —11 dígitos sin guiones—; DNI válido para Consumidor Final), **condición frente al IVA** (determina si es comprobante A, B o C) y **dirección**.
>
> - Con el checkbox **desactivado** estos datos salen de la pestaña Datos Impositivos.
> - Con el checkbox **activado** salen de la pestaña Generales (incluida la nueva **Condición frente al IVA** de datos personales).
>
> Si alguno de estos datos falta en el modo elegido, la emisión puede fallar o generar un rechazo de AFIP. Completalos antes de intentar facturar al socio.

#### Pestaña Embarcación

Muestra las embarcaciones del socio. Podés editar o eliminar cada una.

Cada embarcación tiene su **propio espacio asignado**. Dentro de la tarjeta de cada embarcación hay un selector de espacio que muestra la amarra o cama actual. Podés asignar o cambiar el espacio directamente desde ahí, sin necesidad de ir a la sección Espacios. Si el socio tiene varias embarcaciones, cada una puede estar en un espacio diferente.

#### Pestaña Servicios Contratados

Lista los servicios que el socio consume, cargados mediante **Cargar consumo** en la Cuenta Corriente. Los servicios se agrupan por tipo y muestran el historial de movimientos asociados.

### Ver cargos individuales

Cada fila de servicio tiene un **chevron (›)** a la izquierda del nombre. Al hacerle clic se despliegan los cargos individuales de ese servicio, ordenados del más reciente al más viejo, con fecha, concepto y monto de cada uno.

### Editar un cargo

1. Expandí la fila del servicio con el chevron.
2. Hacé clic en el ícono de **lápiz** junto al cargo que querés corregir.
3. En el modal podés modificar:
   - **Concepto** — descripción del cargo.
   - **Fecha** — fecha en que se registró.
4. Hacé clic en **Guardar**.

> El monto del cargo no se puede modificar desde este formulario. Los cargos que ya tienen una factura AFIP emitida no muestran el botón de edición.

**Cancelar un servicio:**

1. Hacé clic en **Cancelar** en el servicio que querés dar de baja.
2. Si el servicio tiene precio fijo, el sistema pregunta si querés cobrar el proporcional del mes: días utilizados en el mes actual dividido la cantidad de días del mes, multiplicado por el precio.
   - **Solo cancelar** — registra la cancelación sin generar cargo adicional.
   - **Cobrar y cancelar** — genera un movimiento en la Cuenta Corriente por el proporcional y registra la cancelación.
3. El servicio queda marcado como **Cancelado** con la fecha de baja. El historial de movimientos anteriores se conserva.

> La cancelación no borra datos. Si necesitás reactivar el servicio, tenés que volver a cargarlo mediante Cargar consumo.

#### Pestaña Cuenta Corriente

Muestra los movimientos del socio: facturas, cobros y saldo.

Arriba de la tabla hay tres tarjetas: **Ingresos por venta**, **Cobranzas** y **Saldo** del socio.

- **Agregar servicio** (Cargar consumo) — registrá un servicio o cargo adicional. El campo Fecha se pre-carga con el día de hoy; podés cambiarlo si el cargo corresponde a otra fecha. Todo consumo cargado queda como **pendiente**: para registrar su cobro usá **Informar pago** o **Marcar como pagadas**.
- **Informar pago** (Registrar pago) — registrá un pago recibido sin emitir factura (el saldo queda como "saldo a favor" en la cuenta).
- **Marcar como pagadas** — seleccioná una o más facturas con la casilla de verificación y hacé clic en este botón para registrarlas como cobradas. Te pedirá el medio de pago.

**Filtros.** Sobre la tabla podés filtrar los movimientos por:

- **Desde / Hasta** — rango de fechas.
- **Estado** — Pagado o En Plazo. Un cargo figura **Pagado** cuando los pagos registrados alcanzan a cubrirlo (se asignan del más viejo al más nuevo); si todavía no está cubierto, figura **En Plazo**.
- **Tipo de comprobante** — Factura A/B/C, Recibo, Nota de crédito o Sin comprobante.

Al aplicar filtros, las tarjetas de **Ingresos por venta** y **Cobranzas** muestran los totales de lo filtrado. La tarjeta de **Saldo** siempre muestra el saldo real del socio (no se ve afectada por los filtros).

La tabla incluye una columna **Tipo de comprobante** (antes del Nº de comprobante) que indica el tipo de factura asociada a cada movimiento.

#### Pestaña Accesos Externos

Historial de accesos externos registrados por el socio. Muestra todas las personas que ingresaron al club bajo la autorización del socio como acceso externo.

Cada registro muestra el nombre de la persona, el período autorizado (desde / hasta) y un badge de estado:

- **Autorizado a Navegar** — el acceso está activo.
- **Ingresó** — la persona ya registró entrada en portería.
- **Cancelado** — el acceso fue revocado desde la app.
- **Navega** — la persona está autorizada a navegar con la embarcación del socio.

#### Pestaña Invitados

Lista los invitados autorizados por el socio (los mismos que aparecen al desplegar la fila del socio en la lista de Usuarios). Cada invitado muestra su nombre, la fecha hasta la que está autorizado, teléfono, DNI y un badge **Titular** o **Autorizado**.

> No incluye los accesos externos (esos están en la pestaña Accesos Externos).

#### Pestaña Salidas

Historial de salidas y entradas de la embarcación. Las salidas que el socio canceló desde la app mobile aparecen con el badge **Cancelada** en rojo.

#### Pestaña Documentación

- **Subir documento** — seleccioná el tipo de documento y adjuntá el archivo.
- Los documentos subidos aparecen listados con tipo, fecha y enlace para verlos.
- Podés eliminar documentos desde esta misma pestaña.

#### Pestaña Débito automático

Registrá y gestioná la tarjeta de crédito o débito del socio para el cobro automático mensual. Ver sección 13 para el flujo completo.

---

## 4. Usuarios — Carga masiva

Si tenés muchos socios o embarcaciones para cargar, podés hacerlo importando un archivo Excel.

### Importar socios desde Excel

1. En **Usuarios → Socios**, hacé clic en **Importar socios**.
2. Descargá la plantilla haciendo clic en **Descargar plantilla**. Abrí el archivo `.xlsx` y completá los datos de cada socio en una fila. La plantilla incluye una columna **Número de socio** (opcional); si la completás, se asigna ese número al socio; si la dejás vacía, el sistema asigna el siguiente número disponible automáticamente.
3. Guardá el archivo y volvé al panel. Hacé clic en **Elegir archivo .xlsx** y seleccioná tu archivo.
4. El sistema mostrará una vista previa con el resultado del análisis:
   - **A crear** (verde) — socios nuevos que se van a agregar.
   - **A vincular** (amarillo) — emails que ya existen en el sistema; el socio se va a vincular a tu club.
   - **Se saltan** (amarillo) — filas duplicadas o que ya están vinculadas.
   - **Con error** (rojo) — filas con datos inválidos; revisá el detalle para corregirlas.
5. Si el resultado es correcto, hacé clic en **Confirmar importación**.
6. Una vez completada, verás el resumen: Creados, Vinculados, Saltados.

> Si quedaron filas con error, corregí esas filas en el Excel y volvé a importar solo las filas corregidas.

### Importar embarcaciones desde Excel

> Antes de importar embarcaciones, asegurate de que los socios dueños ya estén cargados en el sistema.

1. Hacé clic en **Importar embarcaciones**.
2. Descargá la plantilla y completá los datos. Cada embarcación debe tener el email del socio dueño.
3. Subí el archivo y revisá la vista previa:
   - **A crear** — embarcaciones nuevas.
   - **Se saltan** — embarcaciones ya existentes.
   - **Con error** — filas con datos inválidos o con email de socio no encontrado.
4. Confirmá la importación. Las embarcaciones quedan vinculadas a sus dueños **sin amarra asignada**; podés asignarlas desde la sección Espacios.

---

## 5. Solicitudes de membresía

Cuando un usuario pide unirse al club desde la **app mobile**, la solicitud aparece aquí.

### Ver solicitudes pendientes

1. Entrá a **Solicitudes** desde el menú lateral.
2. La pestaña **Pendientes** muestra los pedidos sin resolver.
3. Cada solicitud muestra: nombre, email, teléfono, fecha del pedido y si el solicitante ya cargó su embarcación en la app.

> Si ves el aviso "No cargó embarcación en la app", pedile al solicitante que registre su embarcación en la app mobile antes de continuar. No es posible aprobar sin embarcación.

### Aprobar una solicitud

1. Verificá los datos del solicitante.
2. Hacé clic en el botón con el tilde (**Aprobar**).
3. El sistema crea automáticamente el perfil de socio con los datos que el usuario cargó en la app, y le envía un email de bienvenida.

### Rechazar una solicitud

1. Hacé clic en el botón con la **X** (**Rechazar**).
2. Escribí un motivo (opcional) — el solicitante lo verá en la app.
3. Hacé clic en **Rechazar** para confirmar.

### Ver solicitudes resueltas

La pestaña **Resueltas** muestra el historial de solicitudes aprobadas y rechazadas, con la fecha de resolución y el motivo de rechazo si corresponde.

---

## 6. Tareas

El tablero de Tareas organiza el trabajo operativo del equipo en columnas por estado.

### Estados del tablero

| Columna           | Qué representa                       |
| ----------------- | ------------------------------------ |
| Salida programada | Embarcaciones con salida planificada |
| Preparar          | Tareas en preparación                |
| Navegando         | Embarcación actualmente en el agua   |
| Guardada          | Embarcación de regreso y guardada    |
| Lavado            | Solicitudes de lavado                |

### Qué muestra cada tarjeta

Cada tarjeta muestra:

- **Nombre del socio** (arriba, en gris).
- **Nombre de la embarcación** (en negrita).
- **Ubicación** — nave y/o número de espacio donde está guardada la embarcación (ej. "Nave A — A-12"). Aparece si el espacio está asignado en el sistema.
- **Para el DD/MM** — solo en tarjetas de lavado: la fecha en que el socio pidió que el lavado esté listo.
- **Descripción / nota** — si la tarea tiene texto.

### Visibilidad según estado

- **Salida programada** — solo se muestran las salidas del día en curso. Las del futuro se ocultarán hasta que llegue su fecha.
- **Guardada** — las embarcaciones guardadas aparecen en esa columna. Pasadas **24 horas** desde que se guardaron, la tarea desaparece del tablero y se **borra automáticamente** (no queda en el historial).
- **Lavado lista** — cuando marcás un lavado como **Lista**, la tarjeta se mantiene visible el resto del día y desaparece sola al día siguiente.

### Crear una tarea

1. Hacé clic en el botón **+** de la columna correspondiente, o en **Nueva tarea** (si lo tiene el header).
2. Completá el formulario:
   - **Descripción** _(requerida)_ — qué hay que hacer.
   - **Operario** — a quién se le asigna (opcional; el operario la verá en su lista).
   - **Embarcación** — embarcación relacionada.
   - **Estado** — columna inicial del tablero.
   - **Fecha y hora** — cuándo debe realizarse.
   - **Nota** — información adicional para el operario.
3. Hacé clic en **Guardar**.

### Mover una tarea de estado

Desde la tarjeta de la tarea, usá el selector **Mover a...** para cambiar la columna.

### Asignar o reasignar un operario

En la tarjeta de la tarea, usá el selector **Operario** para asignar o cambiar la persona responsable.

### Operarios por área (a quién le aparecen las tareas)

Cada tarea (lavado, salida, etc.) se asocia automáticamente al **área** del espacio de la embarcación. Las tareas de un área le aparecen a **los operarios asignados a esa área**, y el que está disponible la **toma**.

- Los operarios se asignan a cada área desde **Espacios** (ver "Asignar operarios a un área").
- Una tarea **sin** área (ej. una tarea genérica sin embarcación) la ven **todos** los operarios de la guardería.
- El administrador sigue viendo **todas** las tareas.

### Tareas de lavado

Las solicitudes de lavado que llegan desde la app mobile aparecen en la columna **Lavado**. Cada tarjeta muestra el nombre de la embarcación, su ubicación en el club y la fecha para la que el socio pidió que el lavado esté listo.

- La solicitud puede estar en estado: **Pendiente**, **Aceptada**, **Lista** o **Cancelada**.
- Para cancelar una solicitud de lavado, hacé clic en la opción correspondiente e ingresá el motivo (ej. "No tenemos turno disponible para ese día").
- En una tarea de lavado, la **embarcación** y la **fecha/hora** vienen de la solicitud del socio y **no se pueden editar** desde la web (quedan de solo lectura). Sí podés editar el resto (nota, operario, estado).

---

## 7. Espacios

Aquí gestionás la estructura física de tu club: amarras, camas y sus ocupantes.

### Estructura de espacios

- **Marina** → Peines → Amarras
- **Nave** → Lados → Pisos → Camas

### Buscar un espacio disponible

En la parte superior de la pantalla podés filtrar espacios por:

- **Eslora** y **Manga** del barco (con selector de unidad: Metros / Pies)
- **Tipo**: Marina o Nave
- **Solo disponibles** (casilla de verificación)

Los espacios se muestran con colores:

- **Teal** — disponible
- **Rojo** — ocupado
- **Amarillo** — reservado

### Asignar operarios a un área

En la sección **Áreas** (arriba de Espacios), cada tarjeta de área tiene un botón **Asignar** junto a "Operarios". Ahí elegís uno o más operarios para esa área. Esos operarios son los que van a ver y poder tomar las tareas de las embarcaciones ubicadas en esa área (lavados, salidas, etc.). También podés asignar operarios **al crear el área** (ver abajo); después los cambiás desde la tarjeta.

### Crear una nueva área

1. Hacé clic en **Nueva área**.
2. Seleccioná el tipo: **Marina** o **Nave**.
3. Para **Marina**: ingresá el nombre, la cantidad de peines y la cantidad de amarras por peine.
4. Para **Nave**: ingresá el nombre, los lados, los pisos por lado y la cantidad de camas por piso.
5. (Opcional) Tildá los **operarios** que van a atender esa área.
6. Confirmá. Los espacios se crean automáticamente.

### Asignar un espacio a un socio

1. Hacé clic sobre el espacio disponible.
2. Seleccioná el socio y la embarcación.
3. Opcionalmente, asignale una tarifa.
4. Confirmá la asignación.

> Si el espacio tiene una tarifa con eslora/manga, el sistema valida que la embarcación sea compatible antes de confirmar un cambio de espacio. En el alta inicial no bloquea.

### Mover un socio a otro espacio (mudanza)

1. Hacé clic en el espacio ocupado y seleccioná **Cambiar ubicación**.
2. Elegí el espacio destino (puede estar en otra marina o nave).
3. Confirmá. El socio conserva su fecha de asignación original y sus embarcaciones se mueven con él.

### Reordenar espacios

Podés arrastrar los espacios dentro de un peine o piso para cambiar el orden de visualización. El nuevo orden se guarda automáticamente.

### Carga masiva de áreas

1. Hacé clic en **Importar áreas**.
2. Descargá la plantilla y completá las áreas a crear (marinas con peines y amarras, o naves con lados, pisos y camas).
3. Subí el archivo, revisá la vista previa y confirmá.
4. Las áreas y sus espacios quedan creados listos para configurar tarifas y asignar ocupantes.

---

## 8. Publicaciones

Desde esta sección publicás amarras y camas disponibles en tu club para que los usuarios de la app mobile las puedan ver. Las publicaciones **no están ligadas a un espacio en particular**: son avisos independientes con su propia foto, descripción y precio.

### Límite según plan

| Plan     | Publicaciones permitidas por mes |
| -------- | -------------------------------- |
| Esencial | 0 (no disponible)                |
| Premium  | 2 por mes                        |
| Elite    | 5 por mes                        |

El contador en la parte superior muestra cuántas publicaciones usaste del total disponible en el mes en curso. Al inicio de cada mes el conteo se reinicia.

Si tu plan es Esencial, verás un aviso indicando que debés actualizar a Premium para usar esta sección.

### Crear una publicación

1. Hacé clic en **Nueva publicación**.
2. Elegí el tipo: **Amarra** o **Cama**.
3. Subí una o más fotos del espacio.
4. Completá los campos:
   - **Dirección / Ubicación** — dirección física o referencia del lugar (ej: "Av. del Puerto 123, Tigre").
   - **Dimensiones** — eslora y manga. Usá el toggle **m / pies** para elegir la unidad (metros o pies); la unidad queda guardada junto con el número.
   - **Precio / mes** y **Expensas / mes** — ambos opcionales.
5. Seleccioná los servicios e instalaciones disponibles (podés elegir varios): Agua potable, Conexión 220V, Abierto 24 hs, Combustible, Seguridad 24 hs, Vestuarios, Confitería, Lavadero, Aire libre, Bajo techo, Con arco.
6. Elegí el estado:
   - **Guardar borrador** — se guarda pero no aparece en la app mobile todavía.
   - **Publicar** — queda visible en la app de inmediato.

### Editar o eliminar una publicación

1. Hacé clic en **EDITAR** en la tarjeta de la publicación.
2. Modificá los campos que necesitás y hacé clic en **Publicar** o **Guardar borrador**.
3. Para eliminarla, hacé clic en **Eliminar** al pie del formulario y confirmá.

> Solo podés editar una publicación dentro de las **24 horas** siguientes a su creación. Pasado ese tiempo el botón de edición desaparece.

### Filtros y búsqueda

Podés filtrar las publicaciones por tipo (Amarras / Camas), por estado (Publicadas / Borradores) y ordenarlas por fecha o precio. También podés buscar por dirección usando el campo de búsqueda.

---

## 9. Comunicaciones

Desde esta sección enviás anuncios y novedades a los socios de tu club.

### Límite según plan

Las comunicaciones tienen un límite mensual según el plan y el tipo:

| Plan     | A socios del club | Públicas (landing) |
| -------- | ----------------- | ------------------ |
| Esencial | 2 por mes         | 0 (no disponible)  |
| Premium  | 2 por mes         | 2 por mes          |
| Elite    | 5 por mes         | 5 por mes          |

El contador en la parte superior de cada tipo muestra el uso del mes en curso.

### Ver comunicaciones existentes

La pantalla muestra el listado de comunicaciones con título, fecha, categoría, tipo y estado (publicada o borrador).

Podés buscar por título usando la barra de búsqueda.

### Crear una comunicación

1. Hacé clic en **Nueva comunicación**.
2. Completá el formulario:
   - **Título** — asunto del anuncio.
   - **Contenido** — texto del mensaje.
   - **Tipo**: **Socios** (solo los socios de tu club la ven en la app) o **Pública** (visible en la landing pública).
   - **Categoría**: Información / Anuncio / Evento / Mantenimiento / Alerta.
   - **Imágenes** _(opcional)_ — podés adjuntar imágenes en relación 16:9.
3. Elegí una acción:
   - **Guardar borrador** — queda guardada pero no se publica todavía.
   - **Publicar** — se publica de inmediato y los socios la ven en la app.

### Editar o despublicar

Hacé clic en la comunicación en la lista para abrirla y editarla. Podés volver a guardarla como borrador si necesitás pausar su visibilidad.

> Solo podés editar una comunicación dentro de las **24 horas** siguientes a su creación. Pasado ese tiempo el botón de edición desaparece.

---

## 10. Comprobantes

Desde esta sección emitís y gestionás las facturas de tu club.

> Para poder emitir facturas AFIP necesitás tener configurado el **Punto de Venta** y haber confirmado el **Certificado AFIP**. Podés hacerlo desde **Configuración → Datos de facturación**. Si la emisión está bloqueada, el panel muestra un aviso explicando qué falta. Los **recibos internos** se pueden emitir aunque el certificado todavía no esté configurado.

### Datos requeridos para emitir facturas AFIP

Para que la emisión no falle, tanto el **club** como cada **socio** deben tener ciertos datos completos:

**Del club** (Configuración → Información general):

- CUIT del club
- Condición frente al IVA
- Punto de Venta configurado y Certificado AFIP confirmado

**Del socio** (perfil):

- **Usar datos personales para facturación** — elige con qué datos se emite: desactivado usa los **Datos Impositivos**; activado usa los datos de **Generales**.
- **Razón social / nombre** — nombre que figura en el comprobante (razón social si es por Datos Impositivos; nombre y apellido si es por datos personales).
- **CUIT / documento** — CUIT obligatorio para Responsable Inscripto y Monotributo (11 dígitos). Para Consumidor Final se acepta DNI.
- **Condición frente al IVA** — define si se emite Factura A, B o C. Está en Datos Impositivos y, para datos personales, en Generales.
- **Dirección** — requerida para el encabezado del comprobante (fiscal o personal según el modo).

Si alguno de estos datos falta en el modo elegido, el sistema puede rechazar la emisión o TusFacturas puede devolver un error de AFIP. Completalos antes de intentar facturarle.

### Resumen de facturación

Las tarjetas superiores muestran:

- **Pendientes de cobro** — monto total de facturas sin cobrar.
- **Pagadas este mes** — monto cobrado en el mes.
- **Vencidas** — facturas que superaron su fecha de vencimiento sin cobro.
- **Total facturado** — acumulado histórico.

### Emitir una factura individual

1. Hacé clic en **Nueva factura**.
2. Seleccioná el **socio** en el campo Cliente.
3. El sistema muestra automáticamente los **conceptos pendientes** del socio (movimientos mensuales sin facturar). Marcá los que querés incluir. Podés usar **Todos** o **Ninguno** para seleccionar rápido.
4. Completá los campos:
   - **Tipo de comprobante** — se determina automáticamente según la condición IVA del club y del socio (campo de solo lectura):
     - Club Monotributo → siempre **Factura C**.
     - Club Responsable Inscripto + Socio Responsable Inscripto → **Factura A**.
     - Club Responsable Inscripto + cualquier otra condición → **Factura B**.
   - **Condición de venta**: Contado, Transferencia bancaria, Tarjeta de crédito, Mercado Pago, etc.
   - **Fecha** y **Vencimiento**.
   - **Período desde / hasta**.
5. Hacé clic en **Emitir factura**. La factura se envía a AFIP y queda registrada.

> Solo aparecen en el selector los socios con **Emite comprobante fiscal** activado. Los socios sin ese flag no se muestran en este formulario.

### Emitir comprobante por ventanilla

Para facturar servicios puntuales que no están cargados como movimientos del socio:

1. Hacé clic en **Ventanilla**.
2. Seleccioná el socio. El **tipo de comprobante** se asigna automáticamente (igual que en la factura individual) y aparece como campo de solo lectura.
3. Agregá los ítems: descripción, cantidad y precio unitario de cada uno.
4. Completá condición de venta y fecha.
5. Hacé clic en **Emitir**. La factura se envía a AFIP de inmediato.

> Solo disponible si el POS y el certificado AFIP están configurados. Solo aparecen socios con **Emite comprobante fiscal** activado.

### Facturación en lote

Emití facturas para múltiples socios al mismo tiempo.

1. Hacé clic en **Factura en lote**.
2. El sistema lista los socios con conceptos pendientes (solo socios con **Emite comprobante fiscal** activado). Cada socio puede tener uno o más conceptos expandibles.
   - La **casilla del socio** selecciona o deselecciona todos sus conceptos de una vez.
   - Podés marcar o desmarcar conceptos individuales dentro del socio. Si solo algunos están marcados, la casilla del socio muestra el estado **intermedio** (guión) indicando selección parcial.
3. Revisá el resumen y confirmá.

El tipo de comprobante se determina automáticamente para cada socio según la condición IVA del club y de cada socio individualmente (igual que en la factura individual). La condición de venta es siempre **Contado**.

> La facturación mensual automática corre el día del mes que configuraste en **Configuración → Información general** (campo "Día de facturación"). Solo aplica a socios que ya tuvieron al menos una factura emitida.

### Recibos internos

Los recibos internos son comprobantes de pago propios del club, sin intervención de AFIP. Son útiles para registrar cobros cuando todavía no tenés el certificado AFIP configurado, o para socios que no requieren factura fiscal.

Para emitir uno:

1. En el perfil del socio → **Cuenta Corriente**, hacé clic en **Informar pago** y completá el formulario.
2. Al confirmar el pago, el sistema muestra una pantalla preguntando si querés emitir un recibo interno.
3. Hacé clic en **Emitir recibo** para generarlo. Queda disponible para imprimir o descargar.

Los recibos emitidos aparecen en **Comprobantes → tab Recibos internos**. No tienen CAE ni validez fiscal ante AFIP.

### Emitir una nota de crédito

Si necesitás anular parcial o totalmente una factura ya emitida, podés emitir una nota de crédito:

1. Andá a **Comprobantes** en el menú lateral → tab **Comprobantes AFIP**.
2. Encontrá la factura original en la tabla y hacé clic en el ícono de flecha curva (↩) al final de la fila.
3. Seleccioná el motivo:
   - **Anulación total** — anula la factura completa; el importe se toma automáticamente.
   - **Descuento parcial** — acreditá un monto parcial; ingresás el importe manualmente.
   - **Devolución de servicio** — igual que descuento parcial, con un motivo descriptivo diferente.
4. Confirmá.

> El botón solo aparece en facturas tipo A, B o C que ya tienen **CAE** asignado. El CAE es el código que AFIP emite al autorizar una factura — sin él la factura no es válida fiscalmente ni puede tener nota de crédito asociada.

### Filtrar y exportar comprobantes

En el tab **Comprobantes AFIP** podés acotar la tabla con los siguientes filtros:

- **Estado**: Todos / Pendiente / Pagada / Vencida
- **Tipo**: Todos / Facturas AFIP / Notas de Crédito
- **Período**: fecha desde y fecha hasta

Para exportar los comprobantes actualmente visibles (respetando los filtros activos), hacé clic en **Exportar** — se descarga un archivo CSV.

### Registrar un pago

Una vez que un socio abona, marcá la factura como pagada:

1. En la tabla de facturas, encontrá la factura correspondiente y hacé clic en la acción **Marcar como pagada** (o usá la casilla en el perfil del socio → Cuenta Corriente).
2. Seleccioná el **medio de pago**.
3. Confirmá.

---

## 11. Tarifario

Desde aquí definís los precios de los servicios que ofrece tu club.

### Ver las tarifas

Las tarifas están agrupadas por categoría. Podés filtrar usando los botones:

- **Todas** — muestra todo.
- **Espacios** — tarifas para amarras o camas (por metro/pie de eslora o manga).
- **Cuota mensual** — cuotas periódicas.
- **Servicios Extra** — servicios adicionales (lavado, amarre de pasada, etc.).

Cada tarifa muestra su concepto, período de vigencia, precio y estado. En la columna de precio se muestran dos valores:

- **Precio c/IVA** — el precio de lista (incluye IVA).
- **Precio s/IVA** — calculado automáticamente según la alícuota configurada (precio ÷ (1 + alícuota)). Si la alícuota es 0 %, aparece el texto "Sin IVA".

Si la fecha de vencimiento ya pasó, el estado aparece como **Vencida** (en ámbar) en lugar de Activa.

### Crear una tarifa

1. Hacé clic en **Nueva tarifa**.
2. Seleccioná la **Categoría**:
   - **Espacios** — seleccioná si es para Camas o Amarra, la unidad de metraje (Metros o Pies), la eslora, la manga y opcionalmente un valor puntual.
   - **Cuota mensual** — ingresá el concepto, la medida (rangos de eslora desde "Hasta 16" hasta "Hasta 105") y el precio.
   - **Servicios Extra** — ingresá el concepto y el precio.
3. Ingresá el **Precio** y la **Alícuota de IVA**: 0 %, 10,5 % o 21 %.
4. Definí la **Vigencia**:
   - **Vigencia desde** — fecha a partir de la cual la tarifa está activa.
   - **Vencimiento** — fecha hasta la que aplica.
   - No pueden existir dos tarifas del mismo concepto con fechas superpuestas.
5. Hacé clic en **Guardar tarifa**.

### Editar una tarifa

Hacé clic en el ícono de edición (lápiz) en la fila de la tarifa. Podés cambiar el precio, el concepto, la alícuota de IVA, las fechas de vigencia o desactivarla cambiando el **Estado** a "Inactivo".

### Ajuste masivo de precios

Si necesitás actualizar todos los precios a la vez:

1. En la sección **Ajuste Masivo de Tarifas**, seleccioná:
   - **Tipo**: Porcentaje o Monto fijo.
   - **Dirección** (si es Porcentaje): Aumentar o Descontar.
   - **Valor** — el porcentaje o monto a aplicar.
2. Hacé clic en **Aplicar a todas**.

### Historial de cambios

Cada tarifa tiene un acordeón **Historial de cambios** donde podés ver los precios anteriores, la variación porcentual, la fecha del cambio, el origen (manual o ajuste masivo) y quién lo realizó.

---

## 12. Configuración

Desde **Configuración** administrás los datos de tu club y las integraciones.

### Pestaña: Información general

Datos básicos del club y configuración de facturación, todo en una sola pestaña.

**Datos del club:**

- **Nombre del club / guardería** _(requerido)_
- **CUIT** _(requerido)_
- **Tipo**: Club Náutico / Marina Privada / Guardería Náutica / Puerto Deportivo / Otro
- **Dirección, Ciudad, Provincia, Código Postal** _(requeridos)_
- **Teléfono operativo** _(requerido)_
- **Email operativo** _(requerido)_
- **Día de facturación** — configura cuándo corre la facturación automática mensual. Tenés dos opciones:
  - **Día fijo (1 al 28)** — ingresá el número del día del mes en que querés que se genere la facturación.
  - **Primer día hábil del mes** — marcá la casilla "Primer día hábil del mes" para que la facturación corra el primer día hábil de cada mes. Si el 1º es sábado, corre el lunes 3; si es domingo, corre el lunes 2; si es día de semana, corre el 1º. Al marcar esta opción, el campo de día numérico se oculta.

**Horarios de atención:**
Para cada día de la semana podés configurar:

- Horario de apertura y cierre.
- Activar el toggle **Cerrado** si el club no abre ese día.

**Fotos del club:**
Podés subir fotos que se muestran en el perfil público del club.

Hacé clic en **Guardar cambios** al terminar.

**Datos de facturación (AFIP):**

Esta sección aparece debajo de las fotos. Configurá aquí el Punto de Venta para poder emitir facturas electrónicas.

_Paso 1 — Configurar el Punto de Venta:_

1. Completá los datos:
   - **Número de Punto de Venta** _(requerido)_ — debe existir previamente en AFIP (Servicios → Administrador de Relaciones → POS de Facturación Electrónica).
   - **Razón social** _(requerida)_
   - **CUIT** _(requerido)_
   - **Condición frente al IVA** _(requerida)_ — la de tu club.
   - **Condición Ingresos Brutos** _(opcional)_
   - **Fecha de inicio de actividades** _(requerida)_
2. Hacé clic en **Guardar cambios**.

Una vez creado, el **número de Punto de Venta no se puede cambiar**. El resto de los datos (razón social, CUIT, condición IVA, fecha de inicio) son editables: modificalos y hacé clic en **Guardar cambios** cuando necesites actualizarlos.

> Si el POS ya tiene facturas emitidas, TusFacturas puede bloquear la edición del CUIT y la condición frente al IVA. En ese caso el sistema mostrará el mensaje de error devuelto por TusFacturas.

_Paso 2 — Certificado de enlace con AFIP:_

El certificado permite que el sistema emita facturas directamente a AFIP en nombre de tu club.

1. Hacé clic en **Solicitar certificado AFIP**. TusFacturas va a enviar las instrucciones al mail del administrador de la cuenta de TusFacturas.
2. Instalá el certificado en el portal de AFIP siguiendo las instrucciones recibidas.
3. Volvé al panel y hacé clic en **Confirmar instalación** para habilitar la emisión.

> Hasta que no confirmes la instalación del certificado, el botón "Nueva factura" aparece deshabilitado.

### Pestaña: Equipo

Gestioná el personal del club que tiene acceso al panel web o a la app mobile.

**Agregar un miembro del equipo:**

1. Hacé clic en **Agregar miembro**.
2. Completá los datos:
   - **Nombre y Apellido** _(requeridos)_
   - **Email** _(requerido)_ — será el usuario de acceso.
   - **Rol** _(requerido)_:
     - **Admin** — acceso total al panel web.
     - **Administrativo** — mismos permisos que Admin.
     - **Operario** — solo ve y resuelve las tareas asignadas.
     - **Portería/Seguridad** — opera exclusivamente desde la app mobile (ingreso y egreso de embarcaciones).
   - **DNI**, **Teléfono**, **Sede** _(opcionales)_
3. Hacé clic en **Guardar**. El nuevo miembro recibe un email de invitación para activar su cuenta.

**Editar o eliminar un miembro:**
Usá los íconos de edición y eliminación en la tarjeta del miembro.

> Eliminar un miembro del equipo lo desvincula de tu club pero no borra su cuenta (puede estar en otro club). Si necesitás revocar el acceso completamente, contactá a soporte.

### Pestaña: Plan

Muestra tu plan actual y te permite cambiarlo.

Los tres planes disponibles son **Esencial**, **Premium** y **Élite**. Cada uno incluye un conjunto diferente de funcionalidades.

**Cambiar de plan:**

1. Hacé clic en **Cambiar a [nombre del plan]** bajo el plan deseado.
2. Confirmá el cambio en el modal. El sistema te indica la fecha exacta en que se aplicará.
3. El cambio **no es inmediato**: se programa para el **último día del mes en curso**. Hasta esa fecha seguís con tu plan actual.

Si confirmaste un cambio y querés cancelarlo antes de que se aplique, aparece un aviso ámbar en la parte superior de la pestaña con el detalle del cambio pendiente y un botón **Cancelar cambio**.

---

## 13. Débito automático (Payway)

El débito automático permite cobrar la cuota mensual directamente desde la tarjeta de crédito o débito del socio, sin necesidad de que el socio realice ninguna acción. El cobro se genera automáticamente el día de facturación de tu club.

### ¿Cómo funciona?

1. El admin configura las credenciales de Payway de tu club (una sola vez).
2. El admin registra la tarjeta de cada socio que quiera adherirse al débito automático.
3. Cada mes, el sistema genera la factura y cobra automáticamente desde la tarjeta.
4. Si un cobro falla, el admin puede reintentarlo desde el panel de comprobantes.

### Paso 1 — Configurar Payway en tu club

> Necesitás tener una cuenta en **Payway (Decidir)** y tus claves pública y privada. Si no las tenés, contactá a Payway para darlas de alta.

> **Requisito previo:** el débito automático requiere que Payway habilite la funcionalidad "Store Credential / MIT" en tu cuenta. Solicitalo a tu ejecutivo de cuentas o al soporte de Payway antes de empezar. Sin esta habilitación el sistema no puede generar los tokens para cobrar mensualmente.

1. Andá a **Configuración** en el menú lateral.
2. Hacé clic en la pestaña **Payway**.
3. Ingresá tu **Clave pública** y tu **Clave privada**.
4. Hacé clic en **Guardar credenciales**.

Una vez configurado, el tab muestra el estado **Conectado**.

Para desconectar Payway, usá el botón **Desconectar** en esa misma pantalla. Esto no elimina las tarjetas de los socios, pero los cobros automáticos dejarán de procesarse.

### Paso 2 — Registrar la tarjeta de un socio

1. Andá a **Usuarios** y abrí el perfil del socio.
2. Hacé clic en la pestaña **Débito automático**.
3. Completá los datos de la tarjeta:
   - Número de tarjeta
   - Mes y año de vencimiento
   - Código de seguridad (CVV)
   - Nombre del titular (tal como figura en la tarjeta)
4. Hacé clic en **Registrar tarjeta**.

Una vez registrada, el tab muestra la tarjeta activa con los últimos 4 dígitos y la marca.

**Para reemplazar una tarjeta:** hacé clic en **Reemplazar** y completá los nuevos datos. El proceso es el mismo que el alta.

**Para dar de baja el débito automático:** hacé clic en **Eliminar tarjeta** al pie de la sección. Los cobros automáticos se detienen, pero los movimientos pendientes siguen en la cuenta del socio.

### Paso 3 — Cobros mensuales automáticos

No hace falta hacer nada. El día de facturación configurado en tu club, el sistema:

1. Genera los movimientos mensuales de cada espacio asignado.
2. Emite la factura automáticamente (para socios que ya tuvieron al menos una factura).
3. Cobra via débito automático a todos los socios con tarjeta registrada.

Cuando el cobro se aprueba, se registra un pago **Pago — Débito automático** en la cuenta corriente del socio y su saldo queda saldado. El monto cobrado es el **saldo real** del socio (todos los cargos pendientes menos los pagos ya registrados), no la suma de cargos sin descontar lo ya pagado.

### Ver el historial de cobros

1. Andá a **Comprobantes** en el menú lateral.
2. Hacé clic en la pestaña **Débito automático**.

Vas a ver:

- **Total cobrado** en el período.
- **Cantidad de cobros aprobados y rechazados.**
- **Tabla con cada cobro**: socio, fecha, monto, estado y detalle del error si lo hubo.

#### Estados posibles

| Estado    | Significado                                                                        |
| --------- | ---------------------------------------------------------------------------------- |
| Aprobado  | El cobro fue procesado correctamente.                                              |
| Rechazado | Payway rechazó el cobro (fondos insuficientes, tarjeta vencida, etc.).             |
| Error     | No se pudo conectar con Payway o hubo un error técnico.                            |
| Pendiente | El cobro está en proceso (transitorio, no debería verse por más de unos segundos). |

### Reintentar un cobro fallido

Si un cobro aparece como **Rechazado** o **Error**:

1. En la tabla de **Débito automático**, buscá el cobro fallido.
2. Hacé clic en **Reintentar**.
3. El sistema vuelve a intentar el cobro con la misma tarjeta registrada.
4. Si sale aprobado, los movimientos quedan marcados como pagados automáticamente.

> Si el cobro vuelve a fallar, probablemente la tarjeta tiene un problema. Comunicarte con el socio para actualizar los datos.

### Preguntas frecuentes sobre débito automático

**¿El socio recibe alguna notificación del cobro?**
Payway envía la notificación directamente al banco del socio. La app no envía notificación adicional por el momento.

**¿Qué pasa si el socio tiene deuda de meses anteriores?**
El cron cobra el **saldo real** del socio en ese momento (todos los cargos pendientes menos los pagos ya registrados), no solo el mes corriente. Si tenía deuda acumulada, se cobra todo junto.

**¿Se puede configurar un tope de monto?**
No. Se cobra el saldo pendiente completo sin tope.

**¿Qué pasa si el socio no tiene movimientos pendientes ese mes?**
No se genera ningún cobro. El débito automático solo se dispara si el socio tiene saldo pendiente — no importa si tiene o no espacio asignado.

---

## Preguntas frecuentes

**¿Cómo agrego una embarcación a un socio que ya existe?**
Entrá al perfil del socio → pestaña **Embarcación** → hacé clic en el botón de agregar embarcación.

**¿Qué pasa si importo socios con emails que ya están en el sistema?**
El sistema los detecta como "A vincular" (no los duplica). Los vincula a tu club manteniendo su cuenta existente.

**¿Puedo asignar un espacio sin tarifa?**
Sí. La tarifa es opcional al momento de asignar. Podés cargarla después; cuando lo hagas, el sistema genera el movimiento mensual correspondiente con cálculo proporcional desde la fecha de asignación.

**¿La facturación automática mensual aplica a todos los socios?**
Solo a los socios que ya tuvieron al menos una factura emitida. Los socios nuevos sin factura previa hay que facturarlos la primera vez de forma manual.

**¿Cómo contacto a soporte?**
Desde el menú lateral, hacé clic en **¿Necesitás ayuda?** para abrir el chat de soporte por WhatsApp.
