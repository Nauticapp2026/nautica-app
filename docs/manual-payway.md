# Cómo configurar el débito automático (Payway)

---

## Antes de empezar

Vas a necesitar acceso a:

- Tu cuenta de Payway.
- El panel web de NauticApp con permisos de admin.

> **Requisito previo — activar débito automático en tu cuenta Payway:** el débito automático requiere que Payway habilite la funcionalidad "Store Credential / MIT" en tu cuenta productiva. Esto no es automático: tenés que solicitarlo explícitamente a tu ejecutivo de cuentas o al soporte de Payway antes de empezar. Sin esta habilitación, el sistema no puede generar los tokens necesarios para cobrar mensualmente.

---

## Paso 1 — Obtener las credenciales de Payway

1. Ingresá a tu cuenta en ventasonline.payway.com.ar.
2. Andá a **Integración** → **Credenciales**.
3. Vas a ver dos claves:
   - **Public Key** (clave pública)
   - **Private Key** (clave privada)

> Copiá ambas claves. Las vas a usar en el siguiente paso.

---

## Paso 2 — Configurar Payway en NauticApp

1. En el panel web, andá a **Configuración** (menú lateral).
2. Hacé clic en la pestaña **Payway**.
3. Pegá la **Public Key** y la **Private Key** en los campos correspondientes.
4. Hacé clic en **Guardar credenciales**.

Listo. A partir de acá ya podés registrar tarjetas de socios.

---

## Paso 3 — Registrar la tarjeta de un socio

Esto se hace una sola vez por socio.

1. Andá a **Socios** y abrí el perfil del socio.
2. Hacé clic en la pestaña **Débito automático**.
3. Completá los datos de la tarjeta:
   - Número de tarjeta
   - Mes y año de vencimiento
   - Código de seguridad (CVV)
   - Nombre del titular (tal como figura en la tarjeta)
4. Hacé clic en **Registrar tarjeta**.

El sistema confirma que la tarjeta quedó registrada mostrando los últimos 4 dígitos y la marca.

---

## Paso 4 — Adherir al socio

Con la tarjeta cargada, marcá el tilde **Cobro Automático Payway** en la pestaña **Datos Impositivos** del socio (sin tarjeta, el tilde no se puede marcar).

A partir de ahí, todo servicio nuevo que se le cargue viene con el tilde **"Incluir este servicio en el débito automático"** marcado por defecto. Los servicios que ya tenía contratados no se adhieren solos: prendeles el tilde uno por uno desde **Editar** en Servicios Contratados (la columna **Débito autom.** muestra Sí/No).

---

## Paso 5 — Cobros mensuales automáticos

No hace falta hacer nada más. El día de facturación configurado en tu club, el sistema:

1. Emite el comprobante automáticamente (eso genera los cargos del mes).
2. Cobra desde la tarjeta de cada socio **adherido**: los cargos pendientes de sus **servicios con el tilde de débito**, descontando el crédito que ya tuviera a favor.

Los cargos cobrados quedan marcados como **Cobrados** y los comprobantes cubiertos enteros pasan a **Cobrada**.

> **Qué entra al débito:** solo los Servicios Contratados con el tilde puesto, de socios adheridos. La deuda que no salió de un servicio contratado (por ejemplo una nota de débito) se cobra a mano desde **Cobranzas**. Los servicios con facturación **Interno** solo entran si el club habilitó **Débito automático** en Mi perfil → Datos Impositivos → **Configuración de cobranzas**, y siempre en un pago separado de los fiscales.

---

## Si un cobro falla

1. Andá a **Cobranzas** → **Débito automático**.
2. Buscá el cobro con estado **Rechazado** o **Error**.
3. Hacé clic en **Reintentar**. El sistema vuelve a correr el débito del socio hoy, con las mismas reglas del cobro mensual.

> Si el cobro vuelve a fallar, comunicate con el socio para actualizar los datos de la tarjeta o con el soporte de Payway.

---

## ¿Por qué se cobra $1 al registrar la tarjeta?

Payway no tiene un modo de "guardar tarjeta sin cobrar". Para obtener el token que permite los débitos automáticos futuros, el sistema necesita procesar una transacción real. Sin esa transacción inicial, Payway no devuelve el token y los cobros mensuales nunca pueden ejecutarse.

El $1 cumple dos funciones: confirma que la tarjeta está activa y válida, y dispara la devolución del token que queda guardado para todos los cobros posteriores. El importe es el mínimo viable. No representa una cuota ni un cargo por el servicio.

Ese $1 aparece como "Alta débito automático - NauticApp" en el resumen de la tarjeta del socio.
