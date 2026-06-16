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

Esto se hace una sola vez por socio. Después, el sistema cobra solo cada mes.

1. Andá a **Usuarios** y abrí el perfil del socio.
2. Hacé clic en la pestaña **Débito automático**.
3. Completá los datos de la tarjeta:
   - Número de tarjeta
   - Mes y año de vencimiento
   - Código de seguridad (CVV)
   - Nombre del titular (tal como figura en la tarjeta)
4. Hacé clic en **Registrar tarjeta**.

El sistema confirma que la tarjeta quedó registrada mostrando los últimos 4 dígitos y la marca.

---

## Paso 4 — Cobros mensuales automáticos

No hace falta hacer nada. El día de facturación configurado en tu club, el sistema:

1. Genera los movimientos del mes.
2. Emite la factura automáticamente.
3. Cobra desde la tarjeta de cada socio que tenga débito registrado.

Los movimientos cobrados quedan marcados como **Pagados**.

> **Importante:** el sistema cobra **todos los movimientos pendientes del socio**, no solo los del mes actual. Si el socio tenía deuda anterior al momento de registrar la tarjeta, ese monto se sumará al próximo cobro automático. Revisá la cuenta corriente del socio antes de registrar la tarjeta si querés evitar un cobro de golpe por deuda acumulada.

---

## Si un cobro falla

1. Andá a **Comprobantes** → **Débito automático**.
2. Buscá el cobro con estado **Rechazado** o **Error**.
3. Hacé clic en **Reintentar**.

> Si el cobro vuelve a fallar, comunicate con el socio para actualizar los datos de la tarjeta o con el soporte de Payway.

---

## ¿Por qué se cobra $1 al registrar la tarjeta?

Payway no tiene un modo de "guardar tarjeta sin cobrar". Para obtener el token que permite los débitos automáticos futuros, el sistema necesita procesar una transacción real. Sin esa transacción inicial, Payway no devuelve el token y los cobros mensuales nunca pueden ejecutarse.

El $1 cumple dos funciones: confirma que la tarjeta está activa y válida, y dispara la devolución del token que queda guardado para todos los cobros posteriores. El importe es el mínimo viable. No representa una cuota ni un cargo por el servicio.

Ese $1 aparece como "Alta débito automático - NauticApp" en el resumen de la tarjeta del socio.
