# Manual del Super Admin — NauticApp

Guía paso a paso para gestionar la plataforma NauticApp desde el panel de super administración.

> Este panel es de uso exclusivo del equipo de NauticApp. Permite gestionar todas las guarderías, usuarios globales, contenido de la app y configuración de planes, de forma transversal a todos los clubes.

---

## Índice

1. [Acceso al panel](#1-acceso-al-panel)
2. [Inicio — Métricas de plataforma](#2-inicio--métricas-de-plataforma)
3. [Guarderías](#3-guarderías)
4. [Usuarios](#4-usuarios)
5. [Comunicaciones](#5-comunicaciones)
6. [Publicidades](#6-publicidades)
7. [Moderación](#7-moderación)
8. [Notificaciones push](#8-notificaciones-push)
9. [Pricing](#9-pricing)
10. [Términos y Condiciones](#10-términos-y-condiciones)

---

## 1. Acceso al panel

1. Ingresá a **www.nauticapp.club** con tu cuenta de super admin.
2. El panel super admin se encuentra en **/super-admin**. Si tu cuenta tiene el flag de super admin activado, el sistema te redirige automáticamente.
3. La navegación lateral muestra las secciones: Inicio, Guarderías, Usuarios, Comunicaciones, Publicidades, Moderación, Notificaciones, Pricing y Términos.

---

## 2. Inicio — Métricas de plataforma

La pantalla de inicio muestra el estado global de la plataforma en cinco tarjetas:

| Tarjeta            | Qué mide                                                         |
| ------------------ | ---------------------------------------------------------------- |
| Guarderías activas | Clubes con acceso habilitado al dashboard                        |
| Cuentas            | Total de cuentas de usuario en la plataforma                     |
| Super admins       | Cantidad de usuarios con flag de super admin                     |
| Espacios totales   | Suma de todos los espacios (amarras + camas) de todos los clubes |
| Embarcaciones      | Total de embarcaciones registradas en la plataforma              |

---

## 3. Guarderías

Vista y administración de todos los clubes registrados en la plataforma.

### Ver la lista de guarderías

La tabla muestra por cada guardería: nombre, slug, ubicación, plan, estado, cantidad de usuarios, espacios, embarcaciones, tarifa mensual, facturado este mes y fecha de alta.

- Usá la barra de búsqueda para filtrar por nombre, slug o ciudad.
- El contador muestra "X de Y guarderías" con el resultado del filtro.

### Ver el historial de plan de una guardería

Hacé clic en el ícono de expansión (flecha) a la izquierda del nombre de la guardería. Se despliega una tabla con el historial de cambios de plan:

- **Desde** — fecha desde la que aplica ese plan.
- **Plan** — nombre del plan (esencial / premium / elite).
- **Rate** — precio por espacio en ese momento.
- **Espacios** — cantidad de espacios activos al momento del cambio.
- **Tarifa mensual** — importe resultante.

### Activar o desactivar una guardería

El botón de estado en la columna **Estado** muestra **Activa** (verde) o **Pendiente** (amarillo).

**Para activar:**

1. Hacé clic en el botón **Pendiente** de la guardería.
2. El sistema pide confirmación: "¿Activar la guardería [nombre]? Sus usuarios van a poder ingresar al dashboard."
3. Confirmá. La guardería queda activa de inmediato.

**Para desactivar:**

1. Hacé clic en el botón **Activa**.
2. Confirmá. Los usuarios del club no van a poder acceder al dashboard hasta que se reactive. La app mobile no se ve afectada.

### Eliminar una guardería

> Esta acción es **irreversible**. Borra todos los datos de la guardería: espacios, embarcaciones, facturación, comunicaciones y configuración. Las cuentas de los usuarios **no** se borran — pueden seguir teniendo acceso a otras guarderías.

1. Hacé clic en el botón **Eliminar** (rojo) en la fila de la guardería.
2. Leé el resumen de lo que se va a borrar: memberships, espacios y embarcaciones.
3. Confirmá para proceder.

---

## 4. Usuarios

Vista global de todas las cuentas de la plataforma, con gestión de roles y accesos.

### Ver la lista de usuarios

La tabla muestra por cada usuario: email, nombre, guarderías a las que pertenece con su rol, estado de super admin, y versión de Términos y Condiciones aceptada.

- Usá la barra de búsqueda para filtrar por email o nombre.

### Gestionar los roles de un usuario en sus guarderías

En la columna **Memberships** se muestra cada guardería donde el usuario tiene acceso, con su rol actual.

**Cambiar el rol en una guardería:**

1. En la fila del usuario, encontrá la guardería correspondiente.
2. Usá el selector de rol para cambiar entre los roles disponibles.
3. El cambio se guarda automáticamente.

**Quitar a un usuario de una guardería:**

1. Hacé clic en la **X** junto a la guardería correspondiente.
2. El usuario pierde el acceso a ese club. Su cuenta global permanece activa.

### Asignar o quitar el flag de super admin

La columna **Super admin** muestra **Sí** (azul) o **No** (outline).

- Hacé clic en el botón para alternar el estado.
- No podés quitarte el flag de super admin a vos mismo.

### Ver el estado de Términos aceptados

La columna **Términos** muestra la versión que el usuario aceptó y la fecha.

- Si la versión aceptada es **anterior a la vigente**, el texto aparece en ámbar como advertencia.
- Si el usuario **nunca aceptó** los T&C, aparece un guión en rojo.

### Eliminar un usuario

> Borra la cuenta y **todas** sus memberships en todas las guarderías de la plataforma.

1. Hacé clic en **Eliminar** en la fila del usuario.
2. Confirmá la acción. No podés eliminar tu propia cuenta desde este panel.

---

## 5. Comunicaciones

Anuncios a nivel plataforma, visibles para todos los usuarios de la app mobile o en la landing pública de NauticApp. Es distinto de las comunicaciones de cada club, que son solo para los socios de ese club.

### Ver comunicaciones existentes

Las comunicaciones aparecen en tarjetas con: título, texto de vista previa, categoría, tipo (socios / pública), estado (publicada o borrador), fecha y autor.

Podés buscar por título usando la barra de búsqueda.

### Crear una comunicación

1. Hacé clic en **Nueva comunicación**.
2. Completá el formulario:
   - **Título** _(requerido, máx. 200 caracteres)_
   - **Contenido** _(opcional, máx. 5000 caracteres)_
   - **Tipo** _(requerido)_:
     - **Socios** — visible para usuarios de la app mobile con club.
     - **Pública** — visible en la landing pública de NauticApp.
   - **Categoría** _(requerida)_: Información / Anuncio / Evento / Mantenimiento / Alerta.
   - **Imágenes** _(opcional)_ — relación de aspecto 16:9, resolución recomendada 1200×675 px.
3. Elegí una acción:
   - **Guardar borrador** — queda guardada sin publicar.
   - **Publicar** — se publica de inmediato.

### Editar una comunicación

Hacé clic en el ícono de edición (lápiz) en la tarjeta. Podés modificar cualquier campo y volver a guardar como borrador o republicar.

---

## 6. Publicidades

Banners que la app mobile muestra en sus slots de publicidad. Cada slot tiene un tamaño fijo y la app filtra los banners por tamaño para llenar el espacio correcto.

### Tamaños disponibles

| Tamaño                   | Uso                                     |
| ------------------------ | --------------------------------------- |
| **Cuadrada — 350×300**   | Slot de banner cuadrado                 |
| **Horizontal — 353×119** | Slot de banner horizontal (tipo banner) |

> La imagen del banner debe tener exactamente esas dimensiones para mostrarse correctamente.

### Ver publicidades existentes

Las publicidades aparecen en tarjetas con: imagen en miniatura, título, texto, link, tamaño, secciones donde aparece, rango de fechas (si aplica), estado y autor.

### Crear una publicidad

1. Hacé clic en **Nueva publicidad**.
2. Completá el formulario:
   - **Título** _(requerido, máx. 200 caracteres)_
   - **Texto** _(opcional, máx. 5000 caracteres)_
   - **Tamaño** _(requerido)_: Cuadrada 350×300 o Horizontal 353×119.
   - **Secciones** _(opcional, selección múltiple)_ — pantallas de la app donde se muestra:
     Home, NautiShop, Mi Club, Contactos, Solicitud de Lavado, Acceso Externo, QR, Marketplace · Embarcación, Marketplace · Propiedad.

     > Si no marcás ninguna sección, el banner aparece en **todas las pantallas** del tamaño elegido.

   - **Fecha de inicio / Fecha de fin** _(opcionales)_ — período en el que se muestra. Si ambas están vacías, se muestra sin restricción de fechas.
   - **Link** _(opcional)_ — URL a donde redirige al tocar el banner.
   - **Imágenes** — subí la imagen del banner.

3. Elegí una acción:
   - **Guardar borrador** — queda guardada sin publicar.
   - **Publicar** — se activa de inmediato en la app.

### Editar o eliminar una publicidad

- **Editar**: hacé clic en el lápiz. Podés modificar cualquier campo.
- **Eliminar**: dentro del modal de edición, hacé clic en el botón **Borrar** (rojo) y confirmá.

---

## 7. Moderación

Revisá y eliminá contenido inapropiado creado por los clubes: comunicaciones y publicaciones de NautiShop.

### Cómo funciona

La pantalla tiene dos pestañas: **Comunicaciones** y **Publicaciones**. Cada una muestra el contenido de todos los clubes de la plataforma, con filtros para buscar y moderar de forma eficiente.

### Filtrar contenido

En ambas pestañas podés:

- **Buscar por texto** — filtra por título o contenido (comunicaciones) o por dirección/ubicación (publicaciones).
- **Filtrar por club** — el selector desplegable muestra solo los clubes que tienen contenido en esa pestaña.
- **Limpiar filtros** — el botón con ícono de filtro los resetea.

### Revisar una comunicación

Cada tarjeta muestra: club, título, preview del texto, categoría, tipo (Socios / Pública), estado (publicada o borrador), imágenes adjuntas, fecha y autor.

Hacé clic en **Ver** para abrir el modal de detalle con el contenido completo y las imágenes en tamaño real.

### Revisar una publicación

Cada tarjeta muestra: club, tipo (Amarra / Cama), estado, imágenes, ubicación, medidas y autor.

Hacé clic en **Ver** para abrir el modal con eslora, manga, precio, expensas, servicios e imágenes completas.

### Eliminar contenido

1. En la tarjeta o dentro del modal de detalle, hacé clic en **Eliminar**.
2. El sistema pide confirmación: "¿Eliminar?".
3. Confirmá. El contenido se borra de inmediato y deja de ser visible en la app mobile.

> Esta acción es **irreversible**. Solo eliminá contenido que incumpla las normas de la plataforma.

---

## 8. Notificaciones push

Enviá notificaciones push a los usuarios de la app mobile de toda la plataforma, segmentadas por audiencia.

### Cómo funcionan

Al enviar, la notificación sale en el momento a todos los dispositivos de la audiencia elegida que tengan la app instalada y hayan dado permiso de notificaciones. Si alguna queda en estado **pendiente** o **fallida**, el sistema la reintenta automáticamente una vez por día.

### Ver notificaciones enviadas

Las notificaciones aparecen en tarjetas con: título, cuerpo, estado (Pendiente / Enviada / Fallida), audiencia, fecha y autor. Si una notificación falló, se muestra el mensaje de error.

### Enviar una notificación

1. Hacé clic en **Nueva notificación**.
2. Completá el formulario:
   - **Título** _(requerido, máx. 200 caracteres)_ — aparece como cabecera del push en el dispositivo.
   - **Cuerpo** _(requerido, máx. 2000 caracteres)_ — texto del mensaje.
   - **Audiencia** _(requerida)_:

     | Opción                            | A quiénes llega                                  |
     | --------------------------------- | ------------------------------------------------ |
     | Todos los usuarios                | Todos los que tienen la app instalada            |
     | Solo los que tienen club          | Usuarios vinculados a al menos una guardería     |
     | Solo los que usan la app sin club | Usuarios registrados pero sin guardería asignada |
     | Solo plan Esencial                | Usuarios en clubes con plan Esencial             |
     | Solo plan Premium                 | Usuarios en clubes con plan Premium              |
     | Solo plan Élite                   | Usuarios en clubes con plan Élite                |

3. Hacé clic en **Enviar notificación**. La entrega es inmediata.

### Eliminar una notificación del historial

Hacé clic en el ícono de basura (rojo) en la tarjeta de la notificación. Esto solo la borra del historial del panel; no revoca la notificación ya entregada.

---

## 9. Pricing

Editor de planes y features que se muestra en la landing pública, en el onboarding y en el panel de cada club.

### Editar los planes

Cada plan (Esencial, Premium, Élite) tiene dos campos editables:

- **Nombre visible** — el nombre que ven los usuarios (máx. 40 caracteres).
- **Rate (ARS por espacio)** — precio por espacio de guarda por mes. El precio que aparece en la landing se calcula como `rate × capacidad`, donde la capacidad la elige el visitante con el slider.

**Para guardar cambios:**

1. Modificá el nombre o el rate del plan.
2. Hacé clic en **Guardar** en la tarjeta de ese plan.

### Editar las capacidades del slider

El slider de la landing permite al visitante seleccionar una capacidad (cantidad de espacios) para ver el precio estimado. Podés controlar qué valores aparece como pasos.

1. En el campo de texto, ingresá los valores separados por coma (ej: `200, 500, 700, 1000, 1500, 2000`).
2. Hacé clic en **Guardar capacidades**.

> Mínimo 2 valores. Solo números enteros positivos.

### Editar las features por plan

La tabla de features muestra todas las funcionalidades en filas agrupadas por categoría, con una columna por plan.

**Valores posibles en cada celda:**

| Valor                       | Qué muestra en la landing                               |
| --------------------------- | ------------------------------------------------------- |
| _(vacío)_                   | El plan no incluye esa feature (no aparece en la lista) |
| `✓`                         | "Incluido" sin detalle adicional                        |
| Texto libre (ej. `2 / mes`) | Se muestra como "[Nombre de la feature]: 2 / mes"       |

**Para editar una celda:**

1. Hacé clic en el campo de texto de la celda que querés modificar.
2. Escribí el valor, o usá los botones rápidos:
   - **✓** — marca la feature como incluida.
   - **—** — deja la celda vacía (feature no incluida).
3. Guardá con el botón correspondiente (cada celda guarda de forma independiente).

> Los cambios se reflejan de inmediato en la landing pública, en el onboarding y en la pestaña Plan del panel de cada club.

---

## 10. Términos y Condiciones

Gestión del historial de versiones de los Términos y Condiciones de NauticApp.

### Cómo funciona el sistema de versiones

- Solo existe **una versión vigente** en cada momento: la de número más alto.
- Al publicar una nueva versión, **todos los usuarios** de la plataforma deben aceptarla en su próximo ingreso al dashboard. Hasta que no acepten, el acceso al panel está bloqueado.
- El historial muestra todas las versiones publicadas desde el inicio.

### Ver versiones anteriores

En la sección **Términos y Condiciones**, cada versión publicada aparece como una tarjeta con:

- Número de versión y badge **Vigente** (si es la actual).
- Fecha y hora de publicación.
- Link **Ver contenido** para desplegar el texto completo de esa versión.

### Publicar una nueva versión

1. Hacé clic en **Publicar nueva versión**.
2. Se abre el editor con dos paneles:
   - **Izquierda** — editor de texto con soporte para markdown básico.
   - **Derecha** — vista previa en tiempo real del texto formateado.
3. Redactá el contenido. Podés usar:
   - `#`, `##`, `###` para títulos.
   - `**texto**` para negrita.
   - `- ítem` para listas.
   - Líneas vacías para separar párrafos.
4. Cuando el texto tenga al menos 50 caracteres, el botón **Publicar versión [número]** se habilita.
5. Hacé clic en el botón. El sistema pide confirmación: "¿Publicar la versión [número]? Todos los usuarios van a tener que aceptarla en su próximo ingreso."
6. Confirmá. La versión queda publicada de inmediato y el gate de aceptación se activa para todos los usuarios.

> No es posible editar ni despublicar una versión ya publicada. Si hay un error, publicá una versión corregida con el número siguiente.
