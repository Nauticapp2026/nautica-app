# Manual del Administrador — NauticApp

Guía paso a paso para gestionar tu club o guardería náutica desde el panel web.

---

## Índice

1. [Primeros pasos](#1-primeros-pasos)
2. [Dashboard](#2-dashboard)
3. [Socios](#3-socios)
4. [Carga masiva](#4-carga-masiva)
5. [Solicitudes de membresía](#5-solicitudes-de-membresía)
6. [Tareas](#6-tareas)
7. [Espacios](#7-espacios)
8. [Publicaciones](#8-publicaciones)
9. [Comunicaciones](#9-comunicaciones)
10. [Ventas](#10-ventas)
11. [Cobranzas](#11-cobranzas)
12. [Tarifario](#12-tarifario)
13. [Mi perfil](#13-mi-perfil)
14. [Débito automático (Payway)](#14-débito-automático-payway)

---

## 1. Primeros pasos

### Ingresar al panel

1. Abrí el navegador y entrá a **www.nauticapp.club**.
2. Ingresá con tu **email** y **contraseña**.
3. Si es tu primera vez, revisá el email de invitación que recibiste y hacé clic en el enlace para activar tu cuenta.

### Navegar por el panel

El menú lateral izquierdo es la navegación principal. Desde ahí accedés a todas las secciones:

- **Dashboard** — resumen operativo del día
- **Socios** — listado y perfil de los socios del club
- **Ventas** — emisión y seguimiento de facturas y comprobantes internos
- **Cobranzas** — registrar cobros y ver el historial de débito automático
- **Solicitudes** — pedidos de nuevos socios desde la app mobile
- **Tareas** — tablero operativo para el equipo (Operarios y Marineros)
- **Espacios** — amarras, camas y ubicaciones
- **Publicaciones** — avisos de amarras y camas en NautiShop
- **Comunicaciones** — anuncios y novedades para socios
- **Tarifario** — precios y servicios
- **Mi perfil** — datos del club, equipo, plan y datos impositivos

En la parte inferior del menú encontrás el botón **¿Necesitás ayuda?** para contactar soporte por WhatsApp.

---

## 2. Dashboard

El Dashboard es la pantalla de inicio. Muestra el estado operativo del club en tiempo real. Los datos **se actualizan automáticamente** sin necesidad de recargar la página: cualquier cambio registrado por un operario, desde la app mobile o desde otra pestaña del panel se refleja en segundos. Cuando volvés a la pestaña tras haberla tenido en segundo plano, también se refresca automáticamente.

### Qué muestra

- **Embarcaciones en guardería** — cantidad de embarcaciones actualmente activas.
- **Socios activos** — total de socios con estado activo.
- **Ingresos del mes** — monto **cobrado** (facturas pagadas) en el mes en curso.
- **Socios con deuda 2+ meses** — socios con movimientos pendientes de cobro desde hace más de dos meses.
- **Socios con documentación incompleta** — socios a los que les falta subir documentación.

Más abajo, el Dashboard también muestra un panel de **Operarios / Marineros** (lista al personal de ambos roles, con un badge que indica cuál es cada uno) y otro de **Comunicaciones recientes**.

### Alertas operativas

Las alertas aparecen cuando hay embarcaciones que salieron y no confirmaron su regreso dentro del horario prometido.

- **Críticas** — sin respuesta del socio (marcadas en rojo).
- **Retorno próximo** — esperando confirmación de arribo.

Cada alerta muestra el nombre del socio, la embarcación, la hora prometida y el teléfono. En las **críticas** se suma la **demora acumulada**.

**Resolver una alerta:**

Las acciones disponibles dependen del tipo de alerta.

**Alertas críticas (sin respuesta del socio):**

1. Si el socio tiene teléfono cargado, aparece el botón **WhatsApp**. Al tocarlo abre la conversación de WhatsApp con el socio (WhatsApp Web o la app de escritorio desde la computadora, o la app desde el celular). Reemplaza al antiguo botón "Llamar", que no funcionaba desde la computadora.
2. Si el socio no responde y necesitás cerrar la salida manualmente, hacé clic en **Cerrar salida**. Esto registra el arribo en ese momento y desactiva la alerta de forma permanente.

**Alertas de retorno próximo:**

1. Tienen una única acción: **Marcar resuelta**, para cerrar la alerta sin registrar arribo. Los botones WhatsApp y Cerrar salida solo aparecen en las alertas **críticas**.

---

## 3. Socios

Desde **Socios** en el menú lateral gestionás el padrón de socios de tu club.

### Ver la lista de socios

La tabla muestra: número de socio (#), nombre, email, embarcación asignada, ubicación, fecha de ingreso, estado y **Saldo**.

- Usá la barra de búsqueda para filtrar por nombre o email.
- Al lado del buscador hay **filtros por columna**: **Nº socio**, **Nombre** y **Embarcación**. Filtran en vivo a medida que escribís y se combinan entre sí y con el buscador.
- Podés ordenar la lista haciendo clic en los encabezados **#**, **Nombre**, **Embarcación** o **Ubicación** (ascendente o descendente).
- La columna **Ingreso** muestra la fecha en que se incorporó el socio al club.
- La columna **Saldo** muestra el saldo de la cuenta del socio. Si **debe**, aparece el monto adeudado. Si tiene **saldo a favor** (pagó de más), aparece el monto en verde con la etiqueta **"a favor"**. Podés ordenar por esta columna haciendo clic en su encabezado (de mayor deuda a saldo a favor).
- El **número de socio** (#NNN) aparece como un chip junto al nombre. Podés editarlo en el perfil del socio → pestaña **Generales**.
- El **estado** de la membresía se indica con un badge de color:
  - **Verde (Activo)** — socio con membresía vigente, puede acceder a la app.
  - **Gris (Inactivo)** — socio sin acceso a la app (la app mobile lo bloquea al iniciar sesión).
  - **Rojo (Moroso)** — socio con deuda pendiente.
- Si un socio tiene un **ícono de alerta amarillo** junto a su nombre, significa que tiene datos de perfil o documentación incompletos. Hacé clic en su nombre para ver qué falta completar.
- Cada fila tiene un **botón chevron (▾)** a la derecha. Al hacerle clic se despliega un panel con:
  - **Invitados autorizados** — personas registradas por el socio como invitados permanentes. Cada nombre muestra la fecha hasta la que está autorizado (ej: `· válido hasta 30/06/2026`). No incluye accesos externos.
  - **Accesos externos recientes** — últimas entradas registradas por portería como acceso externo. Cada nombre muestra la fecha de la última entrada (ej: `· desde 19/06/2026`). Si la misma persona ingresó varias veces, aparece una sola vez con la entrada más reciente.

### Dar de alta un socio manualmente

1. Hacé clic en **Agregar socio**.
2. Completá los datos en el formulario (las secciones se van desplegando):

   **Datos personales**
   - Nombre y apellido _(requeridos)_
   - Email _(requerido)_
   - Teléfono _(requerido)_
   - Tipo de documento _(requerido)_: DNI / CUIT / CUIL / Pasaporte / CDI
   - Número de documento _(requerido)_
   - Dirección _(requerida)_, ciudad, provincia, código postal
   - Contacto de emergencia
   - Condición frente al IVA

   **Datos impositivos**
   - **Usar datos personales para facturación** — define con qué datos se factura. **Desmarcado (por defecto)** se factura con los **datos impositivos** y se muestran sus campos (Razón social, CUIT, etc.). **Marcado**, se factura con los **datos personales** (nombre y documento) y los campos impositivos se ocultan.
   - Razón social, CUIT, Dirección fiscal, Condición frente al IVA, Ingresos Brutos y Email de facturación _(visibles cuando "Usar datos personales para facturación" está **desmarcado**)_

   **Datos de embarcación** _(opcional al momento del alta)_
   - Nombre de la embarcación
   - Matrícula
   - Astillero
   - Modelo
   - Eslora: ingresá el valor y usá el toggle **m / ft** para elegir la unidad (siempre se guarda en metros)

   **Adjuntos** _(opcional)_
   - Podés subir documentación desde esta sección o hacerlo después desde el perfil del socio.

3. Hacé clic en **Guardar socio**.

### Ver y editar el perfil de un socio

Hacé clic en el nombre del socio en la tabla para abrir su perfil. El perfil tiene diez pestañas:

#### Pestaña Generales

Mostrá y editá los datos personales: nombre, apellido, email, teléfono, documento y dirección.

- **Número de socio** — campo editable para asignar o modificar el número interno del socio. El número aparece como chip (#NNN) en la cabecera del perfil y en la lista de socios.
- **Estado de membresía** — selector en la cabecera del perfil para cambiar el estado: **Activo** o **Inactivo**. Un socio Inactivo no puede acceder a la app (bloqueo al iniciar sesión). Para desvincular al socio del club existe por separado el botón **Eliminar socio** (más abajo, en la pestaña Generales), que lo oculta del listado conservando su historial.

#### Pestaña Datos Impositivos

Mostrá y editá los datos fiscales del socio: razón social, CUIT, dirección fiscal, **email de facturación**, condición frente al IVA e Ingresos Brutos.

El **email de facturación** es la dirección a la que se envía el comprobante. Si se deja vacío, se usa el email de la cuenta del socio (pestaña Generales).

**Usar datos personales para facturación** — checkbox en la parte superior de esta pestaña. Define **con qué datos se emiten los comprobantes** del socio:

- **Desactivado** (valor por defecto): se factura con los **Datos Impositivos** (razón social, CUIT, dirección fiscal y condición frente al IVA de esta pestaña).
- **Activado**: se factura con los **datos personales** del socio (nombre y apellido, tipo y número de documento, dirección y condición frente al IVA cargados en la pestaña **Generales**).

> **Importante:** todos los socios activos aparecen en los flujos de facturación (individual y lote). Este checkbox ya **no** controla si el socio aparece o no en el módulo: solo elige el conjunto de datos con el que se emite.

**Comprobante interno** — checkbox de esta pestaña. Define el valor **por defecto** del campo Comprobante al **Cargar Servicio** a este socio: tildado, los servicios nuevos arrancan como **Interno**; destildado, como **Fiscal (ARCA)**. Es solo el default — en cada carga se puede cambiar.

> Este checkbox solo se puede marcar si el club tiene al menos un medio de pago habilitado para comprobantes internos en **Mi perfil → Datos Impositivos → Gestión de cobranza**. Con la configuración vacía, el tilde queda deshabilitado (igual que la opción Interno al cargar servicios y la emisión de comprobantes internos en Ventas).

**Cobro Automático Payway** — checkbox de esta pestaña. Adhiere al socio al **débito automático**: sus servicios contratados fiscales se cobran todos los meses con la tarjeta de crédito que tenga cargada (ver capítulo 14).

- Requiere que el socio tenga una **tarjeta cargada** en la pestaña **Débito automático**; sin tarjeta el tilde no se puede marcar y la pantalla lo indica.
- Al **tildarlo**, los servicios que se le carguen de ahí en más vienen con el tilde "Incluir en el débito automático" ya marcado (se puede destildar servicio por servicio).
- Al **destildarlo**, el débito automático del socio se frena y queda registrada la **fecha de baja**, visible debajo del checkbox. Si se vuelve a marcar, la fecha se blanquea (arranca un período nuevo de adhesión).

> **Campos requeridos para poder emitir factura ARCA al socio:**
>
> Según el modo elegido, el receptor del comprobante necesita: **razón social / nombre**, **documento** (CUIT para Responsable Inscripto o Monotributo —11 dígitos sin guiones—; DNI válido para Consumidor Final), **condición frente al IVA** (determina si es comprobante A, B o C) y **dirección**.
>
> - Con el checkbox **desactivado** estos datos salen de la pestaña Datos Impositivos.
> - Con el checkbox **activado** salen de la pestaña Generales (incluida la nueva **Condición frente al IVA** de datos personales).
>
> Si alguno de estos datos falta en el modo elegido, la emisión puede fallar o generar un rechazo de ARCA. Completalos antes de intentar facturar al socio.

#### Pestaña Embarcación

Muestra las embarcaciones del socio. Podés editar o eliminar cada una.

Cada embarcación tiene su **propio espacio asignado**. Dentro de la tarjeta de cada embarcación hay un selector de espacio que muestra la amarra o cama actual. Podés asignar o cambiar el espacio directamente desde ahí, sin necesidad de ir a la sección Espacios. Si el socio tiene varias embarcaciones, cada una puede estar en un espacio diferente.

#### Pestaña Servicios Contratados

Lista los servicios que el socio tiene contratados. Es un **contrato**, no un historial de cargos: cada servicio ocupa su propia fila, con su categoría, un badge **Fijo** o **Variable** según su tarifa, el tipo de comprobante (**Interno / Fiscal**), la columna **Débito autom.** (Sí/No — si el servicio entra al débito automático Payway, ver capítulo 14), el precio con y sin IVA, la fecha de inicio, la fecha de baja (si tiene) y su **estado**:

- **Vigente** — el contrato está activo y se sigue facturando.
- **Concluido** — servicio **Variable** que ya se facturó: los Variables se cobran una sola vez y el contrato se cierra solo. Para volver a cobrarlo, cargalo de nuevo.
- **Dado de baja** — la fecha de baja ya se cumplió.

**Cargar un servicio nuevo no genera ningún cargo en el momento.** Solo registra el contrato; el cargo real lo va a generar la facturación (mensual para los servicios Fijos, una vez para los Variables) cuando corresponda.

**Cargar Servicio:**

1. Hacé clic en **Cargar Servicio**.
2. Elegí el servicio en el buscador (agrupado por categoría, igual que en el Tarifario — solo aparecen tarifas **Activas**).
3. Completá el **Detalle del servicio** (texto libre, opcional) y la **Fecha de inicio** del servicio (obligatoria). La **Fecha de baja** es opcional — dejala vacía si el servicio sigue vigente.
4. Si el servicio elegido es **Variable con tarifa diaria** (en el buscador su precio aparece como "por día"), aparece un campo más: **Cantidad de días** (obligatorio). El cargo va a ser el precio diario multiplicado por esos días — el total se muestra abajo del campo antes de confirmar, y la cantidad queda visible en la fila del contrato (por ej. "5 días").
5. Elegí el **tipo de comprobante**:
   - **Fiscal (ARCA)** — el cargo se va a facturar por ARCA cuando corresponda (manual o automático).
   - **Interno** — el cargo queda excluido de toda facturación por ARCA; se consolida después en un comprobante interno desde **Ventas** (ver sección Comprobantes internos). La opción solo está disponible si el club tiene medios habilitados en **Mi perfil → Gestión de cobranza**.
6. Si el socio está **adherido al Cobro Automático Payway** (con tarjeta cargada), aparece además el tilde **"Incluir este servicio en el débito automático"**, marcado por defecto. Destildalo si este servicio en particular se va a cobrar por otro medio.

   > Con el comprobante en **Interno**, este tilde queda **bloqueado** si el club no admite **Débito automático** entre los medios de la **Gestión de cobranza (comprobantes internos)** — por ejemplo, si solo admite Efectivo. Para poder tildarlo, habilitá ese medio en Mi perfil → Datos Impositivos.

7. Confirmá. El sistema muestra: _"Servicio contratado. Todavía no aparece en la cuenta corriente — va a impactar recién cuando corresponda facturarlo."_

**Editar un servicio contratado:**

1. Hacé clic en el ícono de **lápiz** de la fila del servicio.
2. En el modal podés modificar: **Fecha de inicio**, **Fecha de baja**, **Detalle del servicio**, el tipo de **Comprobante** (Interno / Fiscal) y el tilde **"Incluir este servicio en el débito automático"** (solo tiene efecto si el socio está adherido al Cobro Automático Payway con tarjeta cargada; con comprobante **Interno** queda bloqueado si el club no admite Débito automático en la Gestión de cobranza).
3. Si es la **primera vez** que le ponés fecha de baja a ese contrato, aparece un bloque adicional: un checkbox **"Cobrar por esta baja"** con el monto sugerido según la **política de baja anticipada** configurada en la tarifa (mes completo o proporcional al uso) — podés editar ese monto antes de guardar (con techo en el precio de un mes completo). Si lo tildás, el cobro queda **pendiente de facturar** y se incluye en el **próximo comprobante** que se le emita al socio (manual o automático) — recién ahí aparece en la Cuenta Corriente. Si no lo tildás (o si solo estás editando una baja ya cargada antes), no se genera ningún cobro.
4. Hacé clic en **Guardar**.

**Servicio de guarda (espacio):** ponerle fecha de baja a un servicio de guarda **detiene el cargo mensual automático** de ahí en más. El espacio **sigue asignado** (la embarcación queda en su lugar); si querés **liberar el lugar** para otro socio, hacelo desde la sección **Espacios**. Si más adelante le volvés a asignar ese espacio al socio, la baja se limpia sola y vuelve a facturarse.

> **Recordá:** contratar un servicio o asignar un espacio **no genera deuda por sí solo**. La deuda nace recién cuando se **emite el comprobante** (factura o comprobante interno), que toma los servicios vigentes del socio: los Fijos cada mes, los Variables una sola vez, y el proporcional de los días restantes si el servicio arrancó a mitad de mes.

> La baja no borra datos: el historial de movimientos anteriores del servicio se conserva. Para reactivar un servicio que no es de guarda, volvé a cargarlo mediante Cargar Servicio.

#### Pestaña Cuenta Corriente

Muestra los movimientos del socio: facturas, cobros y saldo.

Arriba de la tabla hay tres tarjetas: **Ingresos por venta**, **Cobranzas** y una tercera que muestra **Saldo cliente** (lo que debe, en naranja) o **Saldo a favor** (crédito sin usar, en verde), según cuál tenga. Si el socio debe y **además** tiene algo de crédito sin usar sin alcanzar a cubrir la deuda, debajo del monto aparece la aclaración **"+ $X a favor sin usar"**. Cuando hay saldo a favor, un link **Ver historial** abre un panel con el detalle de **de dónde salió cada peso de crédito y en qué se aplicó** (por ejemplo, un adelanto que después se usó para pagar una factura puntual).

> Esta pestaña es de **solo lectura** de movimientos. Para registrar un cobro del socio, andá a la sección **Cobranzas** (menú lateral) y usá **Nueva cobranza** — reemplaza al viejo botón "Registrar pago" que tenía esta pestaña. Los consumos tampoco se cargan acá: usá **Cargar Servicio** en la pestaña **Servicios Contratados**.

**Filtros.** Sobre la tabla podés filtrar los movimientos por:

- **Desde / Hasta** — rango de fechas.
- **Estado** — Todos / Cobrado / Anulado (NC) / Parcial / Pendiente.
- **Tipo de comprobante** — Factura A/B/C, Recibo, Comprobante interno, Nota de crédito o Sin comprobante.

Al aplicar **cualquier filtro**, la tercera tarjeta (Saldo cliente / Saldo a favor) se **oculta**: su valor es el saldo total del socio y no se corresponde con el subconjunto de movimientos filtrados. Las tarjetas de **Ingresos por venta** y **Cobranzas** se mantienen. Al limpiar los filtros, vuelve a aparecer.

**Ordenar por fecha.** Hacé clic en el encabezado **Fecha** para alternar el orden de los movimientos entre **más nuevo primero** (por defecto) y **más antiguo primero**. La flechita del encabezado indica el orden actual.

**Columnas de la tabla.** En orden: **Fecha**, **Tipo de comprobante**, **Nº Comprobante**, **Nº de operación**, **Detalle**, **Vencimiento**, **Situación**, **Ventas**, **Cobranzas**, **Saldo**, **Importe pendiente** y **Estado**.

Cada comprobante ocupa **una sola fila**: si una factura o un comprobante interno se emitió por varios Servicios Contratados a la vez, sus cargos se muestran consolidados en una línea, con el importe total y el detalle indicando el primer servicio y cuántos más incluye (ej. "Guarda mensual (+2)").

- **Vencimiento** — fecha límite de pago del cargo. En las **facturas fiscales** es el vencimiento que se eligió al emitirlas. En los **comprobantes internos** se calcula como la **fecha de emisión más el Plazo de cobro** definido en la tarifa del Tarifario (Contado, 5, 10, 15, 20 o 30 días); si la fila consolida varios servicios con plazos distintos, rige el que vence primero. Ejemplo: un comprobante del 26/06 con plazo de 30 días vence el 26/07. En cargos sin comprobante y en cobranzas muestra "—".
- **Situación** — estado según esa fecha: **En término** (verde) o **Vencida** (rojo). Una fila pasa a **Vencida** el día siguiente al vencimiento (siguiendo el ejemplo, el 27/07). Es **puramente por fecha**: un cargo pagado tarde también puede figurar Vencida. Es independiente de la columna **Estado**, que refleja el estado de pago: **Cobrado** (cubierto por cobranzas), **Parcial** (cobrado en parte), **Pendiente** (sin cobrar), **Vencido** o **Anulado (NC)** (anulado por una nota de crédito). El Estado aplica solo a los **cargos**: en las filas de **recibo** muestra "—", porque un recibo _es_ el cobro (el estado de lo cobrado se ve en la factura que ese recibo pagó).
- **Saldo** — saldo acumulado de la cuenta hasta ese movimiento (en verde cuando es a favor del socio).
- **Importe pendiente** — cuánto falta cobrar de **ese comprobante puntual**, descontando notas de crédito y pagos parciales ya aplicados. En rojo si falta cobrar algo, en verde si ese comprobante ya está cancelado al 100%. En pagos y anulaciones muestra "—" (no son cargos, no deben nada).

#### Pestaña Accesos Externos

Historial de accesos externos registrados por el socio. Muestra todas las personas que ingresaron al club bajo la autorización del socio como acceso externo.

Cada registro muestra el nombre de la persona, el período autorizado (desde / hasta) y un badge con el **estado del acceso**:

- **Autorizado** — el acceso está vigente, la persona todavía no ingresó.
- **Ingresó** — la persona ya registró entrada en portería.
- **Cancelado** — el acceso fue revocado desde la app.

Aparte del estado, junto al nombre aparece la pastilla **Autorizado a navegar** **solo** en las personas a las que el socio les dio permiso para navegar con su embarcación. Si no la tiene, es un acceso al club nada más.

#### Pestaña Invitados

Lista los invitados autorizados por el socio (los mismos que aparecen al desplegar la fila del socio en la lista de Socios). Cada invitado muestra su nombre, la fecha hasta la que está autorizado, teléfono, DNI y un badge **Invitado** o **Autorizado**.

> No incluye los accesos externos (esos están en la pestaña Accesos Externos).

#### Pestaña Salidas

Historial de salidas y entradas de la embarcación. Las salidas que el socio finalizó desde la app mobile antes de zarpar aparecen con el badge **Finalizada** en rojo.

#### Pestaña Documentación

- **Subir documento** — seleccioná el tipo de documento y adjuntá el archivo.
- Los documentos subidos aparecen listados con tipo, fecha y enlace para verlos.
- Podés eliminar documentos desde esta misma pestaña.

#### Pestaña Débito automático

Registrá y gestioná la tarjeta de crédito o débito del socio para el cobro automático mensual. Ver sección 13 para el flujo completo.

---

## 4. Carga masiva

Si tenés muchos socios o embarcaciones para cargar, podés hacerlo importando un archivo Excel.

### Importar socios desde Excel

1. En **Socios**, hacé clic en **Importar socios**.
2. Descargá la plantilla haciendo clic en **Descargar plantilla**. Abrí el archivo `.xlsx` y completá los datos de cada socio en una fila. La plantilla incluye una columna **Número de socio** (opcional); si la completás, se asigna ese número al socio; si la dejás vacía, el sistema asigna el siguiente número disponible automáticamente.
3. Guardá el archivo y volvé al panel. Hacé clic en **Elegir archivo .xlsx**, seleccioná tu archivo y luego en **Ver previsualización**.
4. El sistema mostrará una vista previa con el resultado del análisis:
   - **A crear** (verde) — socios nuevos que se van a agregar.
   - **A vincular** (verde) — emails que ya existen en el sistema; el socio se va a vincular a tu club.
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

La sección Tareas tiene dos vistas: **Tablero** (kanban operativo del día a día) e **Historial** (todos los registros, sin filtrar por fecha).

### Estados del tablero

| Columna           | Qué representa                       |
| ----------------- | ------------------------------------ |
| Salida programada | Embarcaciones con salida planificada |
| Preparar          | Tareas en preparación                |
| Navegando         | Embarcación actualmente en el agua   |
| Guardada          | Embarcación de regreso y guardada    |
| Lavado            | Solicitudes de lavado                |

Arriba del tablero hay una card por columna con la cantidad de tareas activas. Las tareas **canceladas** (ver más abajo) siguen visibles en el tablero con su badge, pero **no suman** en el número de la card.

### Qué muestra cada tarjeta

Cada tarjeta muestra:

- **Nombre del socio** (arriba, en gris).
- **Nombre de la embarcación** (en negrita).
- **Ubicación** — nave y/o número de espacio donde está guardada la embarcación (ej. "Nave A — A-12"). Aparece si el espacio está asignado en el sistema.
- **Para el DD/MM** — solo en tarjetas de lavado: la fecha en que el socio pidió que el lavado esté listo.
- **Descripción / nota** — si la tarea tiene texto.

### Visibilidad según estado

Nada se borra físicamente: una tarea que desaparece del tablero por los criterios de abajo sigue disponible en el **Historial**.

- **Salida programada** — se muestran de hoy en adelante. Las sin fecha o de fecha ya pasada no aparecen en el tablero.
- **Preparar** — se oculta del tablero si la fecha de salida ya pasó y la tarea nunca avanzó a Navegando (queda solo en el Historial).
- **Navegando cancelada** — si el socio revocó la salida desde la app mobile con el barco ya afuera, la tarjeta se marca **Cancelada** (badge rojo) y se sigue viendo el resto del día; se oculta del tablero recién al día siguiente.
- **Navegando — Ya llegó** — cuando el socio confirma "Ya llegué" desde el celular mientras la tarjeta sigue en Navegando, aparece un badge verde **Ya llegó**. Indica que el barco ya volvió y está esperando que el Operario/Marinero lo mueva a Guardada.
- **Guardada** — solo se ven las del **día en curso**: a las **00:00 (medianoche)** la tarjeta desaparece del tablero (pasa a verse solo en el Historial).
- **Lavado lista** — cuando marcás un lavado como **Lista**, la tarjeta se mantiene visible el resto del día y desaparece del tablero al día siguiente.
- **Lavado cancelado** — nunca se muestra en el tablero; solo aparece en el Historial.

### Historial

Muestra **todas** las tareas y solicitudes de lavado, mezcladas en una sola tabla ordenada por fecha (más reciente primero), sin el recorte de "solo hoy/vencidas" del tablero.

- **Filtros**: Operario, Embarcación, y rango de fechas (Desde / Hasta).
- **Columnas**: Embarcación, Titular, Tipo (Salida o Lavado), Horario, Operario/Marinero, Estado (con tag rojo **Cancelado** cuando corresponde).
- Tabla paginada.

### Crear una tarea

1. Hacé clic en el botón **Nueva tarea** (arriba a la derecha de la pantalla).
2. Completá el formulario:
   - **Descripción** _(requerida)_ — qué hay que hacer.
   - **Operario** — a quién se le asigna (opcional; el operario la verá en su lista).
   - **Embarcación** — embarcación relacionada.
   - **Estado** — columna inicial del tablero.
   - **Fecha y hora** — cuándo debe realizarse.
   - **Nota** — información adicional para el operario.
3. Hacé clic en **Crear tarea** (o **Guardar cambios** si estás editando una existente).

### Mover una tarea de estado

Desde la tarjeta de la tarea, usá el selector **Mover a...** para cambiar la columna.

> **Si el socio canceló la salida antes de que el barco navegara** (la tarea todavía estaba en Salida programada o Preparar), la tarjeta queda de **solo lectura**: no aparece el selector "Mover a..." y no se puede arrastrar. Va a desaparecer sola del tablero al día siguiente, sin que haga falta tocarla. Si en cambio la cancelación llegó estando ya en **Navegando** (el barco sí llegó a salir), la tarjeta se sigue pudiendo mover normalmente hasta Guardada.

### Asignar o reasignar un operario

En la tarjeta de la tarea, usá el selector **Operario** para asignar o cambiar la persona responsable. La lista incluye tanto a los **Operarios** como a los **Marineros** de tu club.

### Operarios y Marineros por área (a quién le aparecen las tareas)

Cada tarea (lavado, salida, etc.) se asocia automáticamente al **área** del espacio de la embarcación. Las tareas de un área le aparecen solo al personal asignado a esa área:

- Si la embarcación está en un área **Nave**, la tarea es de **Operario**: la ven los operarios asignados a esa área.
- Si está en un área **Marina**, la tarea es de **Marinero**: la ven los marineros asignados a esa área.
- El personal se asigna a cada área desde **Espacios** (ver "Asignar operarios a un área").
- Una tarea **sin** área (ej. una tarea genérica sin embarcación) la ven **todos** los operarios o marineros de la guardería, según corresponda.
- El administrador sigue viendo **todas** las tareas, de ambos tipos.
- Un operario y un marinero **no ven las tareas del otro**: cada uno solo opera las de su tipo (Nave o Marina). El que esté disponible dentro de esa área **toma** la tarea.

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

En la sección **Áreas** (arriba de Espacios), cada tarjeta de área tiene un botón **Asignar** junto a la lista de personal. Ahí elegís uno o más operarios para esa área. Esos operarios son los que van a ver y poder tomar las tareas de las embarcaciones ubicadas en esa área (lavados, salidas, etc.). También podés asignar operarios **al crear el área** (ver abajo); después los cambiás desde la tarjeta.

> **Marineros vs. Operarios.** Son dos roles de staff distintos, cada uno con su propia lista de personal. En un área **Marina** el botón Asignar te deja elegir entre el personal con rol **Marinero**; en un área **Nave**, entre el personal con rol **Operario**. Los dos operan igual dentro de **Tareas** (crear, mover estado, tomar tareas) — la diferencia es que cada uno solo ve y gestiona las tareas de su tipo de área.

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

También podés asignar un socio a un espacio **sin elegir todavía una embarcación** (para reservarle el lugar antes de que llegue el barco). Ojo: el espacio empieza a facturarse **desde el momento en que le asignás el socio**, no desde que aparece una embarcación ahí — ver la nota al final de esta sección.

### Mover un socio a otro espacio (mudanza)

1. Hacé clic en el espacio ocupado y seleccioná **Cambiar ubicación**.
2. Elegí el espacio destino (puede estar en otra marina o nave).
3. Confirmá. El socio conserva su fecha de asignación original y sus embarcaciones se mueven con él, y el espacio de origen queda libre y disponible para otro socio.

### Liberar un espacio

Sacá al cliente desde la ficha del espacio. Esto detiene la facturación mensual desde el próximo ciclo (no toca los cargos ya generados) y desvincula cualquier embarcación que estuviera ahí. Si el espacio queda con **Estado: Ocupado** sin nadie asignado, el sistema lo baja solo a **Disponible**; si preferís reservarlo para alguien, podés dejarlo en **Reservado** a propósito.

Al **borrar una embarcación** que tenía un espacio asignado, el espacio se libera automáticamente en el mismo paso.

> **Un espacio asignado a un socio se factura todos los meses, tenga o no una embarcación real ahí.** No lo dejes "reservado sin uso" por mucho tiempo si no vas a completarlo pronto — mientras tenga un socio asignado, sigue generando el cargo mensual.

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

> Solo podés editar una publicación dentro de las **24 horas** siguientes a su creación. Pasado ese tiempo el botón de edición se bloquea (cambia a **BLOQUEADO** con un candado) y ya no se puede modificar.

### Filtros y búsqueda

Podés filtrar las publicaciones por tipo (Amarras / Camas), por estado (Publicadas / Borradores) y ordenarlas por fecha o precio.

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

Hacé clic en el **ícono de lápiz** de la comunicación para abrirla y editarla. Podés volver a guardarla como borrador si necesitás pausar su visibilidad.

> Solo podés editar una comunicación dentro de las **24 horas** siguientes a su creación. Pasado ese tiempo el lápiz se reemplaza por un **candado** grisado y ya no se puede modificar.

---

## 10. Ventas

Desde esta sección emitís y gestionás las facturas de tu club.

> Para poder emitir facturas ARCA necesitás tener configurado el **Punto de Venta** y haber confirmado el **Certificado ARCA**. Podés hacerlo desde **Mi perfil → Datos Impositivos**. Si la emisión está bloqueada, el panel muestra un aviso explicando qué falta. Los **recibos internos** se pueden emitir aunque el certificado todavía no esté configurado.

### Datos requeridos para emitir facturas ARCA

Para que la emisión no falle, tanto el **club** como cada **socio** deben tener ciertos datos completos:

**Del club** (Mi perfil → Información general):

- CUIT del club
- Condición frente al IVA
- Punto de Venta configurado y Certificado ARCA confirmado

**Del socio** (perfil):

- **Usar datos personales para facturación** — elige con qué datos se emite: desactivado usa los **Datos Impositivos**; activado usa los datos de **Generales**.
- **Razón social / nombre** — nombre que figura en el comprobante (razón social si es por Datos Impositivos; nombre y apellido si es por datos personales).
- **CUIT / documento** — CUIT obligatorio para Responsable Inscripto y Monotributo (11 dígitos). Para Consumidor Final se acepta DNI.
- **Condición frente al IVA** — define si se emite Factura A, B o C. Está en Datos Impositivos y, para datos personales, en Generales.
- **Dirección** — requerida para el encabezado del comprobante (fiscal o personal según el modo).

Si alguno de estos datos falta en el modo elegido, el sistema puede rechazar la emisión o TusFacturas puede devolver un error de ARCA. Completalos antes de intentar facturarle.

### Resumen de facturación

Las tarjetas superiores muestran:

- **Pendientes de cobro** — **cantidad** de facturas sin cobrar.
- **Pagadas este mes** — **cantidad** de facturas cobradas en el mes.
- **Vencidas** — cantidad de facturas que superaron su fecha de vencimiento sin cobro.
- **Total facturado** — monto acumulado histórico.

### Emitir una factura individual

1. Hacé clic en **Nuevo comprobante** → **Facturación manual**. El formulario sigue este orden:
2. **Socio y Número de documento** — buscá y seleccioná el socio; el buscador filtra por nombre, número de socio o embarcación (mismo buscador que usás en Cobranzas). El documento (DNI/CUIT/CUIL) se completa solo.
3. **Fecha y Vencimiento** — el vencimiento se sugiere solo **según el tarifario**: fecha + el **Plazo de cobro** de los servicios seleccionados (si tienen plazos distintos, rige el que vence primero). Podés pisarlo a mano cuando haga falta.
4. **Centro emisor y Tipo de comprobante**:
   - **Centro emisor** — por qué punto de venta de ARCA sale el comprobante (ver "Centros emisores" en Mi perfil → Datos Impositivos). El campo aparece siempre, arriba de Tipo de comprobante, preseleccionado en el principal; con un solo centro configurado queda como única opción. Los centros emisores solo intervienen en la facturación por ARCA — los **comprobantes internos no los usan**.
   - **Tipo de comprobante** — se determina automáticamente según la condición IVA del club y del socio:
     - Club Monotributo → siempre **Factura C**.
     - Club Responsable Inscripto + Socio Responsable Inscripto o Monotributista → **Factura A**.
     - Club Responsable Inscripto + cualquier otra condición (Exento, Consumidor Final) → **Factura B**.
5. **Servicios a facturar** — el sistema muestra automáticamente los servicios vigentes del período (mensualidades, proporcionales, variables, cobros por baja) que todavía no tienen comprobante. Marcá los que querés incluir — lo que destildes queda pendiente para la próxima emisión. Podés usar **Todos** o **Ninguno** para seleccionar rápido.
6. **Condición de venta** (Contado, Cuenta corriente, 30 / 60 / 90 días) y **Forma de pago** (Efectivo, Transferencia, Tarjeta de crédito, Mercado Pago, etc.).
7. **Descripción** (opcional) y **Período facturado** — el rango de fechas del servicio que se informa a ARCA en el comprobante (por defecto, el mes en curso).
8. Antes del botón Emitir aparece el **desglose del importe**, siempre completo con sus cuatro líneas, sin importar la letra ni la condición IVA del club:
   - **Importe neto** — el monto gravado, sin el impuesto (en un club **Monotributista**, va acá el importe entero: ese club nunca discrimina IVA, así que no corresponde tratarlo como exento).
   - **Importe exento** — el monto de los conceptos genuinamente exentos / no gravados de un club Responsable Inscripto.
   - **Impuestos (IVA)** — el IVA de los conceptos gravados.
   - **Importe bruto** — la suma de los tres anteriores: el total a emitir.
9. Hacé clic en **Emitir**. La factura se envía a ARCA y queda registrada.

   Si el socio tiene un **contrato Fijo** vigente que ya está facturado este mes, el checkbox **"Adelantar la cuota del mes que viene"** (si aparece) te deja sumar también la cuota del mes siguiente completo, para cobrarla por adelantado. Los ítems de adelanto aparecen sin tildar y con la etiqueta **Adelanto** — vos elegís si los incluís. Una vez emitido, ese mes queda saldado: no se vuelve a facturar cuando llega.

> En el selector aparecen **todos los socios del club**. Lo que define si la emisión sale bien son los **datos fiscales/personales completos** del socio (ver "Datos requeridos para emitir facturas ARCA"); si faltan, ARCA puede rechazar la emisión.

> Además del número que devuelve ARCA, cada comprobante lleva un identificador interno correlativo, visible debajo del número ARCA en la tabla de **Comprobantes ARCA**: **FM-NNNNNN** para lo emitido por Facturación manual (y sus NC), **FL-NNNNNN** para lo emitido por Facturación por lote (y sus NC). La factura automática mensual y los recibos internos (RB-) no llevan este identificador.

### Facturación en lote

Emití facturas para múltiples socios al mismo tiempo.

1. Hacé clic en **Nuevo comprobante** → **Facturación por lote**.
2. El sistema lista los socios con conceptos pendientes. Cada socio puede tener uno o más conceptos expandibles.
   - La **casilla del socio** selecciona o deselecciona todos sus conceptos de una vez.
   - Podés marcar o desmarcar conceptos individuales dentro del socio. Si solo algunos están marcados, la casilla del socio muestra el estado **intermedio** (guión) indicando selección parcial.
3. Revisá el resumen y confirmá. Antes del botón Emitir aparece el mismo **desglose** que en la factura individual, siempre con las cuatro líneas: **Importe neto**, **Importe exento**, **Impuestos (IVA)** e **Importe bruto** del total seleccionado (en un club Monotributista todo el importe figura como neto, no exento — ese club nunca discrimina IVA).

El tipo de comprobante se determina automáticamente para cada socio según la condición IVA del club y de cada socio individualmente (igual que en la factura individual). La condición de venta es siempre **Contado**.

> La facturación por lote y la facturación mensual automática salen siempre por el **centro emisor principal** del club — el punto de venta se elige a mano solo en la Facturación manual.

> La facturación mensual automática corre el día del mes que configuraste en **Mi perfil → Información general** (campo "Día de facturación"). Ese día el sistema emite solo, para cada socio, la **factura fiscal** por sus servicios "Fiscal" **y el comprobante interno** por sus servicios "Interno" (identificador **CA-NNNNNN**).

**¿Qué conceptos entran en la factura automática?** Todos los **servicios vigentes** del socio pendientes de facturar: la mensualidad de cada servicio Fijo contratado (espacio de guarda incluido), el proporcional de los que arrancaron a mitad de mes, los Variables sin cobrar y los cobros por baja anticipada. Los servicios marcados **Interno** no entran en la factura fiscal — salen por su propio comprobante interno automático. No se duplica nada: lo que ya tiene comprobante de este período no se vuelve a incluir.

> **Qué se cobra solo cada mes.** Toda tarifa marcada **Fija** se cobra mensual automático — no solo Espacio de guarda: también Cuota social, Membresía, Expensas ordinarias/extraordinarias y Servicio extra. Para Espacio de guarda alcanza con tener el espacio asignado con tarifa; para el resto, con tener el servicio contratado (**Cargar Servicio**). La recurrencia se corta cuando lo cancelás desde **Servicios Contratados**. Las tarifas **Variables** nunca se repiten solas — se cobran una vez y el contrato se cierra; para volver a cobrarlas hay que cargarlas de nuevo.

### Comprobantes internos

Los comprobantes internos son documentos propios del club, sin intervención de ARCA. No tienen CAE ni validez fiscal — sirven para dejar constancia de un cobro o cargo que no se factura por AFIP.

**Paso 1 — marcar un cargo como Interno:**

Al **Cargar Servicio** (pestaña Servicios Contratados de un socio) eligiendo **Interno** en vez de Fiscal, el servicio queda excluido de toda facturación por ARCA (automática y manual).

**Paso 2 — emitir el comprobante:**

Los servicios Interno se consolidan en un comprobante desde **Ventas → Nuevo comprobante**, o los emite solo el sistema el día de facturación:

- **Comprobante interno manual** — elegís un socio, el sistema te muestra sus servicios Interno pendientes en una lista para tildar (igual que Facturación manual), y emitís un solo comprobante con todos los que selecciones. Numeración **CM-NNNNNN**.
- **Comprobante interno por lote** — igual, pero para todos los socios con servicios Interno pendientes a la vez; genera un comprobante por socio. Numeración **CL-NNNNNN**.
- **Automático** — el día de facturación del club, el sistema emite solo un comprobante interno por socio con sus servicios Interno del período. Numeración **CA-NNNNNN**.

El comprobante generado muestra fecha de emisión, descripción del o los servicios incluidos, precio y datos del cliente — como una factura, pero sin validez fiscal.

Todos aparecen en **Ventas → tab Comprobantes internos** y quedan disponibles para imprimir o enviar por mail.

### Anular un comprobante interno (Nota de Crédito interna)

Si necesitás anular un comprobante interno (CM- o CL-) ya emitido, hay una Nota de Crédito interna — no pasa por ARCA, no tiene CAE ni validez fiscal, es solo para dejar constancia dentro del club.

1. En el tab **Comprobantes internos**, en la fila del comprobante CM-/CL- que querés anular, hacé clic en el ícono de flecha curva (↩) — **"Emitir Nota de Crédito interna"**.
2. Elegí el motivo: **Anulación total**, **Descuento parcial** o **Devolución de servicio**.
3. Si no es anulación total, ingresá el **importe a acreditar** (no puede superar el importe original). La **descripción** es opcional — si la dejás vacía, el sistema arma una automática.
4. Confirmá. Se numera con su propia serie **NCI-NNNNNN** y se ve/imprime desde el mismo visor que el resto de los comprobantes.

> En la Cuenta Corriente del socio, el cargo cubierto por una Nota de Crédito interna se muestra igual que una NC fiscal: **Anulado (NC)**.

### Emitir una nota de crédito o débito

Si necesitás anular parcial o totalmente una factura ya emitida (nota de crédito) o cargarle un importe adicional (nota de débito), tenés dos caminos:

**Camino 1 — desde la fila de la factura:**

1. Andá a **Ventas** en el menú lateral → tab **Comprobantes ARCA**.
2. Encontrá la factura original en la tabla y hacé clic en el ícono de flecha curva (↩) al final de la fila — "Emitir Nota de Crédito o Débito".
3. Elegí **NC** o **ND** y seleccioná el motivo:
   - **Anulación total** _(solo NC)_ — anula la factura completa; el importe se toma automáticamente.
   - **Descuento parcial** — acreditá un monto parcial; ingresás el importe manualmente.
   - **Devolución de servicio** — igual que descuento parcial, con un motivo descriptivo diferente.
4. Confirmá.

**Camino 2 — desde Nuevo comprobante:**

En **Nuevo comprobante → Facturación manual**, el campo **Tipo de comprobante** también ofrece **Nota de crédito** y **Nota de débito**. Al elegir una, el formulario cambia al de la nota, con dos variantes:

- **Sobre un comprobante emitido** — elegís entre las facturas fiscales con CAE del socio; equivale al camino 1.
- **Sin comprobante de origen** — una NC/ND "libre", sin factura asociada (por ejemplo, una bonificación comercial nueva). El tipo (A/B/C) se deriva de la condición IVA del club y del socio, y el importe es siempre manual. Como ARCA exige que toda nota referencie comprobantes **o un rango de fechas**, esta variante pide un **Período asociado** (Desde/Hasta, por defecto los últimos 30 días): la nota queda referida a ese rango en lugar de a una factura puntual. El formulario sigue el mismo formato que la factura: **Fecha**, Centro emisor, Tipo, Motivo e Importe, Descripción, Período asociado y el **desglose** (neto/IVA/bruto según la letra) antes de emitir.

> El botón de la fila solo aparece en facturas tipo A, B o C que ya tienen **CAE** asignado. El CAE es el código que ARCA emite al autorizar una factura — sin él la factura no es válida fiscalmente ni puede tener nota de crédito asociada. En la **nota de débito** el importe es siempre manual (no existe "anulación total": completarlo automáticamente duplicaría el cobro al socio).

> La **nota de débito impacta como una factura**: es deuda nueva del socio. Nace **Pendiente**, suma al saldo de la Cuenta Corriente y se cobra por los mismos circuitos que una factura — aparece en **Cobranzas → Nueva cobranza**, se puede **Marcar como cobrada** desde la fila, y el débito automático/pagos a cuenta la saldan por FIFO. La **nota de crédito**, en cambio, nace ya "Cobrada" (un crédito no queda pendiente de cobro).

> **Tope de las notas de crédito**: entre todas las NC de una misma factura no se puede acreditar más que el **total facturado**. Podés emitir varias NC parciales, pero el formulario muestra cuánto queda **disponible** (total menos lo ya acreditado) y el sistema rechaza cualquier importe que lo supere. Una factura totalmente acreditada ya no admite más NC, y si tiene NC parciales deja de ofrecer "Anulación total" (queda el camino parcial por lo disponible). La misma regla aplica a las **NC internas** sobre comprobantes CM-/CL-.

> La nota de crédito o débito sobre un comprobante emitido sale siempre por el **mismo punto de venta** que la factura original (así las asocia ARCA) — no hay que elegir centro emisor. Lo mismo aplica al **Reenviar** una factura rechazada: se reintenta por el punto de venta del intento original.

### Emitir notas de crédito en lote

Si necesitás **anular varias facturas a la vez** (anulación total), podés hacerlo desde el listado sin entrar una por una:

1. En el tab **Comprobantes ARCA**, tildá la **casilla** al inicio de cada factura que quieras anular. La casilla del encabezado selecciona/deselecciona de una todas las elegibles.
2. Solo se pueden seleccionar facturas **A, B o C con CAE** que **todavía no tengan una nota de crédito**. El resto (recibos, notas de crédito, facturas ya anuladas) tienen la casilla deshabilitada.
3. Al haber al menos una seleccionada aparece una barra con la cantidad y el botón **Emitir NC en lote**.
4. Confirmá en el modal (muestra el total a anular). El sistema emite una **nota de crédito por el total** de cada factura, **una por una**.
5. Al terminar muestra un resumen de **emitidas** y **fallidas** (con el motivo de cada falla). Si una falla, continúa con las demás.

> El lote es solo para **anulación total**. Para una nota de crédito **parcial**, usá la emisión individual (ícono ↩ en la fila). Como cada nota de crédito es una emisión real a ARCA, el proceso puede tardar unos segundos si seleccionás muchas.

### Filtrar y exportar comprobantes

En el tab **Comprobantes ARCA** podés acotar la tabla con los siguientes filtros:

- **Estado**: Todos / Pendiente / Pagada / Vencida
- **Tipo**: Todos / Facturas ARCA / Notas de Crédito
- **Período**: fecha desde y fecha hasta

Para exportar los comprobantes actualmente visibles (respetando los filtros activos), hacé clic en **Exportar** — se descarga un archivo CSV.

**Columnas de la tabla Comprobantes ARCA.** En orden: casilla de selección, Ente emisor, CUIT emisor, Nº Op. SC, Fecha, Tipo de comprobante (solo la sigla FC/NC/ND — la letra va en su propia columna), Letra, Número de comprobante legal (con el folio interno FM-/FL- debajo), Nº Socio, Razón social, CUIT/CUIL, Vencimiento, CAE, Vencimiento del CAE, Período (Desde/Hasta), Neto, Exento, IVA, Total, Estado envío ARCA (Aceptado/Rechazado), Estado de cobro y Acciones.

**Columnas de la tabla Comprobantes internos.** En orden: Ente emisor, CUIT emisor, Número, Tipo, Nº Op. SC, Nº Socio, Razón social, CUIT/CUIL, Fecha, Neto, Exento, IVA, Total y Acciones.

**Acciones por fila (Comprobantes ARCA).** El **lápiz (✏️)** marca la factura como cobrada, el **avión de papel (➤)** envía el comprobante por email al socio con el PDF de ARCA adjunto, y la **flecha de descarga (⬇)** abre el PDF para verlo o descargarlo. En las filas con **Estado envío ARCA = Rechazado** aparece además la **flecha circular (↻)**, que abre **Reenviar comprobante legal rechazado**.

**Reenviar un comprobante rechazado por ARCA.** El modal muestra el **motivo del rechazo** que devolvió ARCA. Corregí lo que haga falta (normalmente un dato del socio: CUIT, condición frente al IVA, domicilio) y reintentá; el sistema toma los datos del socio frescos, así que la corrección se aplica sola. Podés ajustar la **fecha** y el **vencimiento**. La **condición de venta**, el **medio de pago** y los **cargos incluidos** no se piden de nuevo: se reintenta el mismo comprobante con los datos del intento original, por su mismo punto de venta. La **letra** tampoco se elige: es la que corresponde según las condiciones frente al IVA del club y del socio (si ARCA rechazó la letra, corregí la condición IVA del socio en su ficha).

### Marcar una factura como pagada

Cuando un socio te abona **una factura puntual** que le emitiste, marcala como pagada:

1. En el tab **Comprobantes ARCA**, ubicá la factura en la tabla. En la última columna (acciones) hacé clic en el **ícono de lápiz (✏️)** — al pasar el mouse aparece el texto "Marcar como cobrada". Si la factura ya está cobrada, el ícono se ve deshabilitado.
2. Seleccioná el **medio de pago**.
3. Confirmá. La factura pasa de **Pendiente** a **Pagada** y los cargos vinculados a ella quedan saldados.

> **No la confundas con una cobranza** (sección **Cobranzas** → **Nueva cobranza**): esa registra un **cobro** que descuenta del **saldo** del socio. Esta acción solo cambia el estado de **una factura** y **no modifica el saldo** de la cuenta corriente. Si necesitás que baje la deuda del socio, registrá el cobro desde **Cobranzas** o por débito automático.

---

## 11. Cobranzas

Desde acá registrás los cobros que recibís de tus socios (efectivo, transferencia, tarjeta, cheque, Mercado Pago, etc.) y los aplicás a sus comprobantes pendientes. También es donde ves el historial de cobros por **débito automático** (Payway). Reemplaza al viejo botón "Registrar pago" que tenía la pestaña Cuenta Corriente del socio.

### Cómo se ve la pantalla

La pantalla tiene dos pestañas:

- **Cobranzas** — el registro de cobros manuales que fuiste cargando.
- **Débito automático** — el historial de cobros automáticos por Payway (ver capítulo 14).

Arriba de la tabla de Cobranzas está el botón **Nueva cobranza**.

### Registrar una cobranza nueva

1. Hacé clic en **Nueva cobranza**.
2. Elegí **qué tipo de comprobantes vas a cobrar**: **Comprobantes ARCA** (facturas A/B/C y notas de débito) o **Comprobantes internos** (CM-/CL-/CA-) — la misma separación que las pestañas de Ventas. Un recibo no puede mezclar los dos circuitos, así que la lista solo muestra los del tipo elegido. La opción **Comprobantes internos** solo aparece si el club tiene medios habilitados en **Mi perfil → Datos Impositivos → Gestión de cobranza**.
3. Buscá al socio por nombre, número de socio o embarcación, y hacé clic sobre él en la lista.
4. El sistema te muestra **solo los comprobantes pendientes de cobro** de ese socio (total o parcialmente), del tipo elegido en el paso 2. Los comprobantes ya cobrados enteros no aparecen; los que tuvieron un **cobro parcial** aparecen con el **saldo que falta cobrar** (y la aclaración del total original). Tampoco incluye notas de crédito.
5. Tildá los comprobantes que estás cobrando (o usá **Seleccionar todos**). Abajo se muestra el **Total seleccionado**.
6. Hacé clic en **Continuar**. También podés continuar **sin seleccionar ningún comprobante**: en ese caso el monto se registra como **adelanto** y queda como **saldo a favor** en la Cuenta Corriente del socio. Un adelanto **no salda ningún comprobante viejo pendiente por sí solo** — sigue disponible entero hasta que lo usés a mano (tildando un comprobante y marcando "Usar saldo a favor disponible", ver paso 7) o lo consuma el débito automático al cobrar.
7. Si tildaste **un solo comprobante**, revisá o ajustá el **Monto a cobrar** (viene precargado con el saldo pendiente) y la **Fecha** del cobro.
   - Si el monto es **menor** al pendiente, es un **pago parcial**: se aplica a ese comprobante y lo que falte queda pendiente en él para una próxima cobranza.
   - Si el monto es **mayor**, el excedente queda como **saldo a favor** del socio.

   Si tildaste **dos o más comprobantes**, en vez de un monto único aparece un **casillero por cada comprobante** (precargado con su saldo pendiente): escribí ahí cuánto le pagás a cada uno — así elegís vos a qué factura imputa un pago parcial, en vez de que el sistema lo aplique solo del más viejo al más nuevo. El **Total a cobrar** se calcula solo, sumando los casilleros.

   Si el socio tiene **saldo a favor sin usar** (de un adelanto o de un cobro anterior), aparece el tilde **"Usar saldo a favor disponible ($X)"**: al marcarlo, ese monto se descuenta del total a cobrar y el resto se completa con las formas de pago de siempre. Se agota solo — una vez usado por completo, deja de ofrecerse en la próxima cobranza.

8. Elegí la **forma de pago**: Efectivo (pesos), Efectivo (dólares), Tarjeta de crédito, Tarjeta de débito, Transferencia bancaria, Cheque, Mercado Pago u Otro. Cada una pide sus propios datos (por ejemplo, Efectivo en dólares pide el tipo de cambio y calcula el equivalente en pesos; si el socio ya tiene una tarjeta cargada para débito automático, podés reutilizarla con un clic). Si estás cobrando **comprobantes internos**, el desplegable muestra **solo los medios habilitados** en la Gestión de cobranza del club (Efectivo habilita también Efectivo en dólares). Si el saldo a favor cubre el total completo, no hace falta cargar ninguna forma de pago.
9. **Podés combinar más de una forma de pago** en el mismo cobro: hacé clic en **Agregar forma de pago** y repetí el paso anterior para cada una. La suma de todas tiene que coincidir con el Monto a cobrar.
10. Hacé clic en **Registrar cobranza**.

### Qué pasa al confirmar

Al registrar la cobranza, el sistema genera un **recibo de cobranza** con numeración propia e **independiente por circuito**: **RC-NNNNNN** para cobros de comprobantes ARCA y **CI-NNNNNN** para cobros de comprobantes internos. Marca como **Cobrados** los comprobantes que quedaron cubiertos enteros (contando cobros parciales anteriores) y actualiza la Cuenta Corriente del socio. Si el pago fue parcial, cada comprobante guarda cuánto se le aplicó y queda pendiente por el resto.

El recibo se puede ver e imprimir con el ícono **Ver** (ojo) de su fila. La plantilla muestra la **Fecha de emisión** y, en pagos parciales, el monto aplicado a cada comprobante.

### Anular una cobranza

1. En la tabla de Cobranzas, hacé clic en **Anular recibo** en la fila del recibo (solo disponible si todavía está **Vigente**).
2. Confirmá.

Al anular: el pago se revierte, los comprobantes que ese recibo había cobrado (enteros o en parte) vuelven a pendiente, y los cargos vuelven a su estado previo. El recibo queda marcado **Anulado**, con su fecha de anulación, y no se puede volver a anular ni se genera ningún comprobante nuevo. El PDF del recibo anulado muestra el **monto en negativo** y la leyenda **ANULADO** (vale igual para RC- y CI-).

> La anulación es siempre por el **total** del recibo — no se puede anular parcialmente una cobranza.

### Pestaña Débito automático

Historial de cobros automáticos por Payway (antes vivía en Ventas). Ver el capítulo **14. Débito automático (Payway)** para el detalle completo de estados y cómo reintentar un cobro fallido.

---

## 12. Tarifario

Desde aquí definís los precios de los servicios que ofrece tu club.

### Ver las tarifas

Las tarifas están agrupadas por categoría. Podés filtrar usando los botones: **Todas**, **Espacio de guarda**, **Cuota social**, **Membresía**, **Expensas ordinarias**, **Expensas extraordinarias** y **Servicio extra**.

Cada tarifa muestra su concepto, un badge **Fijo** o **Variable** (fijo = precio único; variable = se cobra según el metraje de la embarcación) — si la Variable es de **tarifa diaria**, el badge dice **Variable · Diaria** —, el período de vigencia, el precio y el estado. **Fijo/Variable también define si se repite sola todos los meses**: las Fijas sí, las Variables se cobran una sola vez (ver "¿Qué conceptos entran en la factura automática?" más abajo). En la columna de precio se muestran dos valores:

- **Precio c/IVA** — el total que se le cobra al socio, calculado automáticamente sumando la alícuota al precio de lista (precio × (1 + alícuota)).
- **Precio s/IVA** — el precio de lista que cargaste (sin impuesto). La línea "s/IVA" solo aparece cuando la alícuota es mayor a 0; si la tarifa es **Exento / No gravado** (0 %), no se muestra.

**Estados de una tarifa:** **Activa**; **Vencida** (en ámbar, si pasó su fecha de vencimiento); **Pausada**; o **Inactiva**. Con el botón **Pausar** dejás de aplicar una tarifa sin borrarla, y con **Reactivar** la volvés a habilitar — si hay socios con ese servicio contratado, el sistema te los muestra a modo informativo antes de confirmar, pero **no bloquea** la pausa (a esos socios no les afecta, siguen facturándose igual; solo deja de poder contratarse de nuevo mientras esté pausada). Cambiar el **Estado** a "Inactivo" desde Editar es más restrictivo: **si hay socios con el servicio contratado, no se puede** — hay que darlos de baja primero. Una tarifa Pausada o Inactiva deja de generar cargos nuevos (el cron mensual la salta, no se puede cargar manualmente por "Cargar Servicio", y no aparece en los selectores para asignarla a un espacio o socio nuevo).

### Crear una tarifa

1. Hacé clic en **Nueva tarifa**.
2. Seleccioná la **Categoría**: Espacio de guarda, Cuota social, Membresía, Expensas ordinarias, Expensas extraordinarias o Servicio extra.
3. Indicá si el servicio es **Fijo** (precio único) o **Variable** (se cobra según el metraje de la embarcación). Si elegís **Variable**, aparece un campo más, **Tipo de tarifa**:
   - **Tarifa mensual** — el precio se cobra tal cual, una sola vez (como hasta ahora).
   - **Tarifa diaria** — el precio que cargás es **por día**. Al cargarle el servicio a un socio, el sistema pide la **cantidad de días** y cobra precio × días.

   > **Importante:** el campo "Cantidad de días" solo existe en **Cargar Servicio** (ficha del socio → Servicios Contratados). Si creás una tarifa de categoría "Espacio de guarda" que sea Variable con tarifa diaria y la asignás desde **Espacios → Asignar espacio**, ahí no se piden los días y se cobraría el precio de un solo día. Para tarifas diarias, usá siempre **Cargar Servicio**.

4. Ingresá el **Precio (sin IVA)** y la **Alícuota de IVA**: **Exento / No gravado**, **10,5 %** o **21 %**. El sistema suma el IVA automáticamente para calcular lo que se le cobra al socio.

   > Si tu club es **Monotributista**, el campo IVA queda **bloqueado en "Exento / No gravado"**: un Monotributista emite siempre Factura C, sin IVA, así que sus tarifas no llevan alícuota y al socio se le cobra el precio tal cual lo cargás.

5. Configurá el **Plazo de cobro** (días) y la **Vigencia**:
   - El **Plazo de cobro** (Contado, 5, 10, 15, 20 o 30 días) define la **fecha de vencimiento** de los cargos de esa tarifa en la Cuenta Corriente del socio: vencimiento = fecha de la factura + el plazo elegido.
   - **Vigencia desde** — fecha a partir de la cual la tarifa está activa.
   - **Vencimiento** — fecha hasta la que aplica.
   - No pueden existir dos tarifas del mismo concepto con fechas superpuestas.
6. Si el servicio es **Fijo**, opcionalmente tildá **"Establecer política de baja anticipada"**. Al tildarlo aparecen dos opciones (queda seleccionada "proporcional" por defecto, podés cambiarla):
   - **Cobrar mes completo.**
   - **Cobrar días proporcionales de uso.**

   Esta política actúa en dos momentos:
   - **Al dar de baja** el servicio desde la ficha de un socio: sugiere el monto del cobro por baja (ver "Editar un servicio contratado" en la sección Socios).
   - **Al alta**, si elegiste **mes completo**: un servicio que arranca a mitad de mes se cobra el **mes entero** en su primer ciclo, sin proporcional. Con la política proporcional (o sin política configurada), el primer mes se cobra **proporcional** a los días desde la fecha de inicio.

   Para tarifas **Variables** este campo no aplica y no se muestra.

7. Hacé clic en **Guardar tarifa**.

### Editar una tarifa

Hacé clic en el ícono de edición (lápiz) en la fila de la tarifa. Podés cambiar el precio (sin IVA), el concepto, la alícuota de IVA, las fechas de vigencia o desactivarla cambiando el **Estado** a "Inactivo" (bloqueado si hay socios con el servicio contratado — cancelalo en esos socios primero).

### Ajuste masivo de precios

Si necesitás actualizar varios precios a la vez:

1. Hacé clic en **Ajuste masivo**. Se abre un modal donde elegís:
   - **Categoría** — Todos o una categoría específica (el ajuste aplica solo a esa categoría).
   - **Tipo**: Porcentaje o Monto fijo.
   - **Acción** (si es Porcentaje): Aumentar o Descontar.
   - **Valor** — el porcentaje o monto a aplicar.
   - **Vigencia desde** — fecha a partir de la cual rige el nuevo precio.
2. Hacé clic en **Aplicar** y confirmá.

> **Ajustes programados a futuro.** Si en **Vigencia desde** elegís una fecha **futura**, el precio **no cambia en el momento**: el ajuste queda **programado** y el sistema lo aplica solo el día indicado. Hasta entonces la tarifa sigue cobrándose al precio actual y muestra un cartelito ámbar con el precio y la fecha programada (ej. "$X desde DD/MM"). Si la fecha es **hoy o pasada**, el cambio se aplica al instante. Solo puede haber un ajuste programado por tarifa: si cargás otro, reemplaza al anterior.

### Historial de cambios

Cada tarifa tiene un acordeón **Historial de cambios** donde podés ver los precios anteriores, la variación porcentual, la fecha del cambio, el origen (manual o ajuste masivo) y quién lo realizó.

---

## 13. Mi perfil

Desde **Mi perfil** administrás los datos de tu club y las integraciones.

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

**Datos Impositivos:**

Configurá aquí el Punto de Venta para poder emitir facturas electrónicas. Antes de configurarlo, esta sección aparece debajo de las fotos; una vez configurado el POS, pasa a una **pestaña propia "Datos impositivos"**.

_Paso 1 — Configurar el Punto de Venta:_

1. Completá los datos:
   - **Nº de referencia** _(requerido)_ — el número de Punto de Venta, que debe existir previamente en ARCA (Servicios → Administrador de Relaciones → POS de Facturación Electrónica).
   - **Razón social** _(requerida)_
   - **CUIT** _(requerido)_
   - **Condición frente al IVA** _(requerida)_ — la de tu club.
   - **Condición Ingresos Brutos** _(opcional)_
   - **Fecha de inicio de actividades** _(requerida)_
2. Hacé clic en **Guardar cambios**.

Una vez creado, el **número de Punto de Venta no se puede cambiar** (identifica el POS en ARCA). El resto de los datos (razón social, CUIT, condición IVA, fecha de inicio) son editables: modificalos y hacé clic en **Guardar cambios** cuando necesites actualizarlos. Este primer punto de venta queda registrado como tu **Centro emisor principal**.

> Si el POS ya tiene facturas emitidas, TusFacturas puede bloquear la edición del CUIT y la condición frente al IVA. En ese caso el sistema mostrará el mensaje de error devuelto por TusFacturas.

_Paso 2 — Certificado de enlace con ARCA:_

El certificado permite que el sistema emita facturas directamente a ARCA en nombre de tu club.

1. Hacé clic en **Solicitar certificado ARCA**. TusFacturas va a enviar las instrucciones al mail del administrador de la cuenta de TusFacturas.
2. Instalá el certificado en el portal de ARCA siguiendo las instrucciones recibidas.
3. Volvé al panel y hacé clic en **Confirmar instalación** para habilitar la emisión.

> Hasta que no confirmes la instalación del certificado, el botón "Nuevo comprobante" aparece deshabilitado.

_Centros emisores (varios puntos de venta):_

Si tu club factura desde **más de un punto de venta** de ARCA (por ejemplo, dos sucursales), podés cargarlos todos en la sección **Centros emisores**, debajo del formulario de datos impositivos:

1. Hacé clic en **Agregar centro emisor**.
2. Completá:
   - **Nombre** _(requerido)_ — cómo lo querés ver en los listados (ej. "Sucursal río").
   - **Número de punto de venta** _(requerido)_ — igual que el primero, debe existir previamente en ARCA (Servicios → Administrador de Relaciones → POS de Facturación Electrónica).
3. Hacé clic en **Agregar**. Los datos impositivos (razón social, CUIT, condición IVA) se reusan de los ya cargados — todos los centros emisores del club comparten el mismo CUIT, por lo que también comparten el certificado ARCA.

Sobre cada centro de la lista podés:

- **Renombrarlo** (ícono de lápiz) — el número no se puede cambiar.
- **Hacer principal** — el centro **principal** es el que usa la **facturación mensual automática**, la **facturación por lote** y todo flujo que no elige punto de venta a mano.

Cómo se comporta la emisión con varios centros:

- En **Facturación manual** (y en las NC/ND "sin comprobante de origen") aparece el dropdown **Centro emisor** para elegir por cuál sale, preseleccionado en el principal (con un solo centro queda como única opción).
- Las **NC/ND sobre un comprobante emitido**, el **Reenviar** de rechazadas y la descarga de **PDF** usan siempre el punto de venta del comprobante original.
- En la tabla de Ventas, el punto de venta de cada comprobante se ve en el prefijo del **Número de comprobante legal** (formato PPPPP-NNNNNNNN).

**Dar de baja un centro emisor.** Si dejás de usar un punto de venta, tocá **Dar de baja** en su fila. Deja de aparecer al emitir, pero **los comprobantes que ya emitió quedan intactos** y se pueden seguir consultando, reimprimiendo y reenviando por ese mismo punto de venta — por eso el centro nunca se borra del todo (la trazabilidad ante ARCA lo exige). Queda marcado como **De baja** y podés **Reactivarlo** cuando quieras.

Dos casos en los que el sistema no te va a dejar darlo de baja:

- **Es el principal** — es el que usa la facturación mensual automática. Designá otro como principal y recién entonces dalo de baja.
- **Es el único activo** — el club quedaría sin poder facturar.

> Si intentás agregar un centro emisor con un número que ya usaste y diste de baja, el sistema te avisa para que lo **reactives** en vez de crearlo de nuevo.

_Gestión de cobranza (comprobantes internos):_

Debajo del formulario de datos impositivos está la sección **Gestión de cobranza (comprobantes internos)**: los **medios de pago que el club admite para cobrar comprobantes internos** (Efectivo, Tarjeta de crédito, Tarjeta de débito, Débito automático, Transferencia, Cheque, Mercado Pago). Como los comprobantes internos no son comprobantes legales, lo ideal es admitir **solo Efectivo** — que es como viene configurado de entrada.

Esta configuración gobierna toda la pata de internos de la app:

- **Sin ningún medio tildado**, los comprobantes internos quedan **deshabilitados**: no se puede marcar el tilde "Comprobante interno" en Datos Impositivos del socio, ni cargar servicios con facturación Interno, ni emitir comprobantes internos desde Ventas, y la opción "Comprobantes internos" desaparece de Nueva cobranza.
- En **Cobranzas**, al cobrar comprobantes internos el desplegable **Forma de cobro** muestra **solo los medios habilitados acá** (para los comprobantes ARCA se sigue mostrando la lista completa).
- Tildar **Débito automático** habilita además que los servicios **Interno** de socios adheridos entren al cobro automático por Payway (ver capítulo 14) — sin este tilde, el débito automático cobra únicamente servicios fiscales.

Elegí los medios y hacé clic en **Guardar configuración**.

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
     - **Operario** — ve y resuelve las tareas de embarcaciones guardadas en **Nave** (guarda en seco).
     - **Marinero** — igual que Operario, pero para embarcaciones en **Marina** (amarras en agua): ve y resuelve las tareas de sus áreas de marina.
     - **Portería / Seguridad** — opera exclusivamente desde la app mobile (ingreso y egreso de embarcaciones).
   - **DNI**, **Teléfono**, **Sede** _(opcionales)_
3. Hacé clic en **Guardar**. El nuevo miembro recibe un email de invitación para activar su cuenta.

**Editar o eliminar un miembro:**
Usá los íconos de edición y eliminación en la tarjeta del miembro.

> ⚠️ **Eliminar un miembro del equipo borra su cuenta de TODA la plataforma**, no solo de tu club. Si el usuario pertenece a otros clubes, también pierde el acceso ahí. Es una acción **destructiva e irreversible**; el sistema te pide confirmación antes de ejecutarla. (No se puede eliminar a un Super Admin desde acá.)

### Pestaña: Plan

Muestra tu plan actual y te permite cambiarlo.

Los tres planes disponibles son **Esencial**, **Premium** y **Élite**. Cada uno incluye un conjunto diferente de funcionalidades.

**Cambiar de plan:**

1. Hacé clic en **Cambiar a [nombre del plan]** bajo el plan deseado.
2. Confirmá el cambio en el modal. El sistema te indica la fecha exacta en que se aplicará.
3. El cambio **no es inmediato**: se programa para el **primer día del mes siguiente**. Hasta esa fecha seguís con tu plan actual.

Si confirmaste un cambio y querés cancelarlo antes de que se aplique, aparece un aviso ámbar en la parte superior de la pestaña con el detalle del cambio pendiente y un botón **Cancelar cambio**.

---

## 14. Débito automático (Payway)

El débito automático permite cobrar los servicios contratados directamente desde la tarjeta de crédito del socio, sin necesidad de que el socio realice ninguna acción. El cobro se genera automáticamente el día de facturación de tu club.

### ¿Cómo funciona?

1. El admin configura las credenciales de Payway de tu club (una sola vez).
2. El admin registra la tarjeta de cada socio que quiera adherirse.
3. El admin marca el tilde **Cobro Automático Payway** en la pestaña **Datos Impositivos** del socio (con tarjeta ya cargada). Desde ahí, los servicios que se le carguen vienen incluidos en el débito por defecto, y cada Servicio Contratado se puede incluir o excluir individualmente.
4. Cada mes, el sistema emite el comprobante y cobra automáticamente los servicios incluidos.
5. Si un cobro falla, el admin puede reintentarlo desde Cobranzas → Débito automático.

> **Qué entra al débito y qué no.** Se cobran los cargos de los **Servicios Contratados con el tilde de débito** de socios **adheridos**. Los cargos que no salen de un servicio contratado (una nota de débito, un cobro por baja anticipada suelto) quedan afuera y se cobran a mano desde **Cobranzas**. Los servicios **Interno** solo entran si el club tildó **Débito automático** en su Gestión de cobranza — y aún así se cobran en un **pago separado** de los fiscales: los dos circuitos nunca se mezclan en un mismo cobro.

### Paso 1 — Configurar Payway en tu club

> Necesitás tener una cuenta en **Payway (Decidir)** y tus claves pública y privada. Si no las tenés, contactá a Payway para darlas de alta.

> **Requisito previo:** el débito automático requiere que Payway habilite la funcionalidad "Store Credential / MIT" en tu cuenta. Solicitalo a tu ejecutivo de cuentas o al soporte de Payway antes de empezar. Sin esta habilitación el sistema no puede generar los tokens para cobrar mensualmente.

1. Andá a **Mi perfil** en el menú lateral.
2. Hacé clic en la pestaña **Payway**.
3. Ingresá tu **Public Key** y tu **Private Key**.
4. Hacé clic en **Conectar Payway** (si ya estaba configurado, el botón dice **Actualizar claves**).

Una vez configurado, el tab muestra el mensaje **"Payway está conectado."**.

Para desconectar Payway, usá el botón **Desconectar** en esa misma pantalla. Esto no elimina las tarjetas de los socios, pero los cobros automáticos dejarán de procesarse.

### Paso 2 — Registrar la tarjeta de un socio

1. Andá a **Socios** y abrí el perfil del socio.
2. Hacé clic en la pestaña **Débito automático**.
3. Completá los datos de la tarjeta:
   - Número de tarjeta
   - Mes y año de vencimiento
   - Código de seguridad (CVV)
   - Nombre del titular (tal como figura en la tarjeta)
4. Hacé clic en **Registrar tarjeta**.

Una vez registrada, el tab muestra la tarjeta activa con los últimos 4 dígitos y la marca.

**Para reemplazar una tarjeta:** hacé clic en **Reemplazar** y completá los nuevos datos. El proceso es el mismo que el alta.

**Para dar de baja el débito automático:** destildá **Cobro Automático Payway** en la pestaña **Datos Impositivos** del socio (queda registrada la fecha de baja). También podés hacer clic en **Eliminar tarjeta** al pie de la pestaña Débito automático — sin tarjeta activa no se procesa ningún cobro. En los dos casos los movimientos pendientes siguen en la cuenta del socio.

### Paso 3 — Adherir al socio y sus servicios

Con la tarjeta cargada, marcá el tilde **Cobro Automático Payway** en la pestaña **Datos Impositivos** del socio. A partir de ahí:

- Todo **servicio nuevo** que se le cargue viene con el tilde **"Incluir este servicio en el débito automático"** marcado por defecto (se puede destildar en la carga).
- Los servicios ya contratados **no** se adhieren solos: prendeles el tilde uno por uno desde **Editar** en Servicios Contratados (la columna **Débito autom.** muestra Sí/No para cada uno).

### Paso 4 — Cobros mensuales automáticos

No hace falta hacer nada más. El día de facturación configurado en tu club, el sistema:

1. Emite el comprobante automáticamente a cada socio con servicios pendientes de facturar, lo que genera los cargos del mes.
2. Cobra por débito automático los cargos de los **servicios con el tilde de débito** de cada socio **adherido** con tarjeta activa. Fiscales e internos van en cobros separados (los internos solo si el club los habilitó, ver arriba).

Cuando el cobro se aprueba, se registra un pago **Pago — Débito automático** en la cuenta corriente del socio, los cargos cobrados quedan **Cobrados** y los comprobantes cubiertos enteros pasan a **Cobrada**.

> **No se cobra de más.** Si el socio tenía **saldo a favor** o pagos parciales previos, ese crédito se descuenta del débito del mes. Y si un cargo ya quedó cubierto por un pago anterior, no se vuelve a cobrar.

### Ver el historial de cobros

1. Andá a **Cobranzas** en el menú lateral.
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
3. El sistema vuelve a correr el **débito automático del socio hoy**, con las mismas reglas del cobro mensual: cargos pendientes de sus servicios con el tilde de débito, con el crédito previo descontado. Requiere que el socio siga adherido y con tarjeta activa.
4. Si sale aprobado, se registra el pago y el saldo del socio baja automáticamente.

> Si el cobro vuelve a fallar, probablemente la tarjeta tiene un problema. Comunicarte con el socio para actualizar los datos.

### Preguntas frecuentes sobre débito automático

**¿El socio recibe alguna notificación del cobro?**
Payway envía la notificación directamente al banco del socio. La app no envía notificación adicional por el momento.

**¿Qué pasa si el socio tiene deuda de meses anteriores?**
Se cobra todo lo pendiente de sus **servicios con el tilde de débito**, no solo el mes corriente — siempre descontando lo que ya haya pagado. La deuda que no salió de esos servicios (por ejemplo una nota de débito) no entra: se cobra desde Cobranzas.

**¿Se puede configurar un tope de monto?**
No. Se cobra el pendiente completo de los servicios incluidos, sin tope.

**¿Qué pasa si el socio no tiene movimientos pendientes ese mes?**
No se genera ningún cobro. El débito automático solo se dispara si el socio tiene cargos pendientes de servicios incluidos — no importa si tiene o no espacio asignado.

---

## Preguntas frecuentes

**¿Cómo agrego una embarcación a un socio que ya existe?**
Entrá al perfil del socio → pestaña **Embarcación** → hacé clic en el botón de agregar embarcación.

**¿Qué pasa si importo socios con emails que ya están en el sistema?**
El sistema los detecta como "A vincular" (no los duplica). Los vincula a tu club manteniendo su cuenta existente.

**¿Puedo asignar un espacio sin tarifa?**
Sí. La tarifa es opcional al momento de asignar. Podés cargarla después; cuando lo hagas, el sistema genera el movimiento mensual correspondiente con cálculo proporcional desde la fecha de asignación.

**¿La facturación automática mensual aplica a todos los socios?**
Sí: emite a todo socio con servicios vigentes pendientes de facturar, tenga o no facturas anteriores. Si el socio ya tiene facturas, la nueva hereda el tipo de comprobante y la condición de venta de la última; si es la primera, se derivan de su condición frente al IVA. Los comprobantes fiscales requieren además que el club tenga TusFacturas y el certificado ARCA configurados.

**¿Cómo contacto a soporte?**
Desde el menú lateral, hacé clic en **¿Necesitás ayuda?** para abrir el chat de soporte por WhatsApp.
