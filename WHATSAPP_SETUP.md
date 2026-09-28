# Aviso automático por WhatsApp — configuración pendiente en Meta

El código está listo, probado (32 pruebas unitarias + 24 de reglas + 23 de
integración contra emuladores reales — ver `npm test`, `npm run test:rules`,
`npm run test:integration`) y desplegado en el sentido de "el código ya vive
en producción". **La integración NO está operativa todavía**: falta crear la
cuenta de WhatsApp Cloud API en Meta, aprobar la plantilla de mensaje, y
cargar las credenciales en Vercel. Sin eso, cada solicitud del catálogo se
sigue guardando normalmente — el aviso automático simplemente no sale (el job
queda "pending" con un error claro: "WhatsApp Cloud API no está configurada").

## 1. Número emisor — IMPORTANTE, leer antes de empezar

**El número que reciba los avisos (WhatsApp de Stefany) NO puede ser el mismo
que se registra como número emisor de la API.** Meta lo prohíbe explícitamente:
un número ya activo en la app normal de WhatsApp no se puede registrar en
Cloud API sin darlo de baja primero, y una vez registrado en Cloud API deja
de poder usarse con la app normal de WhatsApp/WhatsApp Business.

Necesitás un **número de teléfono nuevo, dedicado, que nadie use hoy para
WhatsApp** (puede ser una línea prepago barata, un número virtual, etc.).
Ese número queda como el "emisor" — el remitente técnico de los avisos —
nunca aparece como remitente visible salvo el nombre del perfil de negocio
que le pongas. **El número de Stefany (`+1 829 347 8941`, cargado en "Mi
catálogo" → WhatsApp comercial) sigue siendo el RECEPTOR**, no se toca.

## 2. Crear la app y la cuenta en Meta

1. Entrá a https://developers.facebook.com/ con una cuenta de Facebook (recomendado: una cuenta separada para el negocio, no personal).
2. "Mis apps" → "Crear app" → tipo **"Business"**.
3. Dentro de la app, agregá el producto **"WhatsApp"**.
4. Meta te da automáticamente una **WhatsApp Business Account (WABA)** de prueba con un número de test — sirve para probar el flujo técnico, pero para producción hace falta el número dedicado propio (paso 3).

## 3. Registrar el número dedicado

1. En el panel de WhatsApp de la app → **"Números de teléfono"** → agregar tu número dedicado.
2. Verificalo por SMS o llamada (código de 6 dígitos).
3. Anotá el **Phone Number ID** (un ID numérico, no el número de teléfono en sí) — va en `WHATSAPP_PHONE_NUMBER_ID`.
4. Anotá el **WhatsApp Business Account ID** — va en `WHATSAPP_BUSINESS_ACCOUNT_ID`.

## 4. Token de acceso permanente

El token que te muestra Meta al principio dura 24 horas — no sirve para producción.

1. Meta Business Suite → **Configuración del negocio** → **Usuarios del sistema** → crear un **"Usuario del sistema"** (system user), rol Admin.
2. Asignale la app de WhatsApp creada arriba, con permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
3. Generá un token para ese usuario del sistema, marcando esos dos permisos, **sin fecha de expiración**.
4. Ese token va en `WHATSAPP_ACCESS_TOKEN` — es un secreto, tratalo como una contraseña.

## 5. Crear y enviar a aprobar la plantilla de mensaje

WhatsApp exige una plantilla pre-aprobada para poder avisar fuera de una
conversación ya abierta por el destinatario (que es siempre el caso acá — es
un aviso que arranca la conversación).

1. Meta Business Suite → **Administrador de WhatsApp** → **Plantillas de mensaje** → **Crear plantilla**.
2. Nombre: `nueva_solicitud_catalogo` (exacto, en minúsculas y guion bajo — así lo espera `WHATSAPP_TEMPLATE_NAME`).
3. Categoría: **Utilidad (Utility)** — es un aviso operativo/transaccional, no promocional.
4. Idioma: **Español** (`es`).
5. Cuerpo del mensaje (copiar tal cual, con las variables `{{1}}` a `{{5}}`):

   ```
   Nueva solicitud de cotización
   Cliente: {{1}}
   WhatsApp: {{2}}
   Referencia: {{3}}
   Pedido: {{4}}
   Ver solicitud: {{5}}
   ```

6. Al enviarla, Meta va a pedir un ejemplo de cada variable para la revisión — usá algo como:
   `{{1}}` → María Pérez · `{{2}}` → +1 809 555 1234 · `{{3}}` → SC-ABC123 · `{{4}}` → 4 unidades · `{{5}}` → https://logianalytics-pro-v2.vercel.app/solicitudes?ref=abc123
7. Enviar a revisión. Suele aprobarse en minutos, puede tardar hasta 24h.

## 6. Webhook de estado de entrega

1. Panel de la app → WhatsApp → **Configuración** → **Webhooks**.
2. URL de callback: `https://logianalytics-pro-v2.vercel.app/api/webhooks/whatsapp`
3. Verify token: cualquier string que vos inventes (ej. generá un UUID) — ponelo también en `WHATSAPP_WEBHOOK_VERIFY_TOKEN` en Vercel.
4. Suscribite al campo **`messages`** (trae los eventos de estado `sent`/`delivered`/`read`/`failed`).
5. En "App Secret" (Configuración básica de la app) copiá el App Secret → va en `WHATSAPP_APP_SECRET` (se usa para verificar que los webhooks realmente vienen de Meta).

## 7. Variables de entorno en Vercel

Proyecto `logianalytics-pro-v2` → Settings → Environment Variables → agregar en **Production** (marcar como *Secret* las que correspondan):

| Variable | Valor |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Token del usuario del sistema (paso 4) |
| `WHATSAPP_PHONE_NUMBER_ID` | Del paso 3 |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Del paso 3 |
| `WHATSAPP_APP_SECRET` | Del paso 6 |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | El que inventaste en el paso 6 |
| `WHATSAPP_TEMPLATE_NAME` | `nueva_solicitud_catalogo` |
| `WHATSAPP_TEMPLATE_LANG` | `es` |
| `WHATSAPP_API_VERSION` | `v23.0` (opcional — ya es el default) |
| `APP_BASE_URL` | `https://logianalytics-pro-v2.vercel.app` (opcional — ya es el default) |
| `CRON_SECRET` | Ya debería existir (la usa el reporte mensual) — si no existe, generá un string random |

Después de cargar las variables, hay que **re-desplegar** (un push vacío o "Redeploy" desde Vercel) para que la función serverless las tome.

## 8. Plan de Vercel — confirmado: Hobby (gratis)

Verifiqué por API que esta cuenta está en el plan **Hobby** de Vercel, que
limita los cron jobs a **como máximo una vez al día** — por eso
`vercel.json` programa el reintento a `"0 12 * * *"` (diario, 12:00 UTC) en
vez de cada pocos minutos, **sin contratar ningún plan pago**. Esto no
afecta lo principal: el **envío inmediato al recibir la solicitud sigue
funcionando igual**, en cualquier plan — el cron diario es solo la red de
seguridad para un aviso que falló y quedó "pending" (tardaría hasta 24h en
reintentarse solo; mientras tanto, "Reintentar aviso" en Solicitudes lo
dispara al instante, a mano). Si en algún momento se decide pasar a Vercel
Pro, alcanza con acortar el `schedule` en `vercel.json`.

## 9. Costo

Desde julio 2025 Meta cobra **por mensaje de plantilla efectivamente
entregado** (ya no por "conversación"), con tarifa según categoría (Utility,
más barata que Marketing) y país del número receptor — no hay tarifa fija
publicada, varía por país. Con un solo negocio (Stefany) y un aviso por
solicitud, el volumen es bajísimo (unos pocos mensajes por día como mucho) —
el costo esperado es de centavos de dólar al mes, pero no hay forma de dar
una cifra exacta sin mirar el tarifario vigente para República Dominicana en
el Administrador de Pagos de Meta. Vercel Pro (si hace falta para el cron
cada 5 min) tiene su propio costo mensual, independiente de esto.

## 10. Probar de verdad (con vos como destinatario, NUNCA con Stefany todavía)

Antes de darle esto a Stefany, probalo con tu propio WhatsApp como receptor:

1. En Vercel, cambiá temporalmente `catalogSettings.whatsappNumber` de un
   workspace de prueba (o el tuyo propio, si tenés catálogo activado) a tu
   número — **nunca reutilices el catálogo real de Stefany para esto**.
2. Activá el consentimiento ("Avisarme automáticamente...") en Mi catálogo.
3. Enviá una solicitud real desde el catálogo público de ESE workspace de prueba.
4. Confirmá que te llega el WhatsApp, con el formato esperado, y que el enlace
   abre la solicitud correcta al iniciar sesión.
5. Recién ahí, coordiná con Stefany para activar su consentimiento.

**No hice ninguna prueba real de entrega** (no tengo credenciales de Meta ni
un número receptor autorizado) — esta sección queda como el paso que falta
para poder decir "confirmado, llega de verdad".
