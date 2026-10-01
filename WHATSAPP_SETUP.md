# Aviso automático por WhatsApp (Cloud API de Meta) — estado, garantías y activación

Última revisión: 2026-09-29. Este documento distingue tres cosas que no son lo mismo:
**implementado** (está en el código y probado), **desplegado** (corre en producción) y
**operativo** (un aviso real llega de verdad). Hoy: implementado sí, desplegado no, operativo no.

## 1. Estado real

| | Estado | Evidencia |
|---|---|---|
| Código del aviso (job atómico, toma con lease, reintentos, reconciliación, expiración) | **Implementado** en local, sin desplegar | `npm test` (95), `npm run test:rules` (24), `npm run test:integration` (60) contra emuladores; defectos inyectados detectados |
| Webhook (`/api/webhooks/whatsapp`) | **Implementado**; comprobado por HTTPS público contra un entorno aislado | `npm run sandbox:preflight` (8 comprobaciones, ver §7) |
| Plantilla `nueva_solicitud_cotizacion` | **Creada y APROBADA en la WABA de prueba** (Utilidad, es; creada 2026-09-29 20:05, aprobada antes del 2026-09-30 20:00). La WABA de PRUEBA sí permite plantillas propias. Falta crearla en la WABA de producción | §3 |
| Envío de nuestra plantilla a un teléfono real | **Probado en el sandbox (2026-09-30 20:24, WABA y número de PRUEBA de Meta)**: aviso PAL-Z6SZ4Z → Stefany; la API de Meta devolvió el wamid; llegaron 3 POST reales de Meta, firmados y validados (`sent`, `delivered`, `read`), todos con el MISMO wamid del envío. `hello_world` no contaba | `sandbox:e2e -- send` |
| Webhook guardado en Meta y suscripción de la app al campo `messages` | **Comprobado** (2026-09-29): el handshake de Meta llegó al sandbox (200) y la Graph API confirma suscripción activa de `whatsapp_business_account` con `messages` y la URL del túnel | `npm run sandbox:meta-check` |
| Vinculación de NUESTRA app a la WABA de prueba (`subscribed_apps`) | **NO vinculada**: solo figura la app de Meta "WA DevX Webhook Events 1P App". Sin esto los eventos de esa WABA no llegan a nuestro webhook. Pendiente de autorización (`npm run sandbox:link-waba -- --apply`) | `sandbox:meta-check` |
| Evento firmado de Meta recibido por NUESTRO servidor | **Probado** (2026-09-30 20:25): 3 POST reales (User-Agent `facebookexternalua`, IPv6 `2a03:2880::/32`, firmas `X-Hub-Signature` y `-256`) aceptados con 200 tras validar la firma con el App Secret real | inspector del túnel + emulador |
| Producción | **Envío apagado**: Vercel no tiene ninguna variable `WHATSAPP_*` (verificado 2026-09-29) | `vercel env ls production` |
| Recuperación en minutos | **No existe todavía** (Vercel Hobby: cron 1 vez al día) — recomendación en §6 | — |

Un HTTP 200 de Meta al enviar solo significa "aceptado". Solo un evento `delivered`/`read` firmado, asociado al mismo
mensaje, demuestra entrega.

## 2. Cómo funciona (y qué NO promete)

```
solicitud del visitante
  └─ UNA transacción de Firestore: deduplicación + cliente + cotización + job (+ clave de dedup)
        └─ envío en línea (best effort)  ──┐
        └─ worker (cola/barrido)  ─────────┼─▶ toma atómica (pending → sending, lease 2 min) ─▶ Meta
        └─ "Reintentar aviso" (humano) ────┘
Meta ─▶ webhook firmado ─▶ transacción por evento ─▶ accepted → sent → delivered → read  (o failed)
```

Estados del job: `pending`, `sending`, `unconfirmed`, `accepted`, `sent`, `delivered`, `read`, `failed`, `expired`.
`accepted` = Meta aceptó la petición; `sent`/`delivered`/`read`/`failed` solo los pone un evento firmado del webhook.

Problemas que tenía el código y cómo quedaron (cada uno tiene prueba de integración):

| Problema confirmado | Corrección |
|---|---|
| Sin toma atómica: envío en línea, worker y reintento manual podían enviar el mismo aviso a la vez | Transacción `pending → sending` con lease (2 min) y dueño; solo el dueño cierra el intento. 8 workers simultáneos → 1 llamada a Meta |
| Deduplicación "consultar y luego escribir": solicitudes simultáneas idénticas creaban N cotizaciones y N avisos (y N clientes) | Clave de dedup **dentro** de la transacción que crea cliente + cotización + job. 6 solicitudes simultáneas → 1 cotización, 1 job, 1 cliente, 1 envío |
| Timeout ambiguo reintentado a ciegas | Estado `unconfirmed`, **sin reenvío automático**. Cada envío lleva `biz_opaque_callback_data` (`wa1\|workspace\|solicitud\|intento`); si el mensaje sí salió, el webhook lo trae de vuelta y el job se reconcilia solo aunque nunca vimos el wamid. Un lease vencido (worker muerto) también es ambiguo |
| Worker aceptaba `Bearer undefined` si faltaba `CRON_SECRET` | Falla cerrado: sin `CRON_SECRET` (≥16 caracteres) o firma de QStash válida → 401. **En producción `CRON_SECRET` no existe hoy**, así que la ruta desplegada sí acepta `Bearer undefined` hasta que se despliegue este cambio (impacto acotado: no hay credenciales de Meta) |
| Activar credenciales enviaba en masa avisos viejos | Los jobs con más de `WHATSAPP_JOB_MAX_AGE_MINUTES` (360 por defecto) o anteriores a `WHATSAPP_SEND_NOT_BEFORE` pasan a `expired` y NO se envían. Además hay un interruptor aparte: `WHATSAPP_SENDING_ENABLED` debe ser exactamente `true` |
| Configuración ausente consumía intentos | Sin credenciales o con el envío apagado, el job queda `pending`, con 0 intentos consumidos, y solo se anota el motivo |

Hallazgo adicional (no era del aviso, pero rompía el enlace autenticado): la app no recordaba el destino al redirigir a `/login`; con la sesión cerrada, `/solicitudes?ref=<id>` terminaba en `/dashboard`.
Ahora `/login?next=<ruta interna>` vuelve a esa ruta (`src/lib/safeRedirect.ts`, rechaza otros orígenes y `//`, con pruebas). Comprobado en local con la app real; no desplegado.

Límites que NO se pueden eliminar (documentados por Meta): no hay clave de idempotencia en el envío ni endpoint para
consultar mensajes enviados. Por eso **no se promete "exactamente una vez"**: se promete un solo intento concurrente y
ningún reenvío automático tras una incertidumbre. Un humano puede reintentar un `unconfirmed` ("Reintentar aviso") sabiendo
que, si el original sí salió, llegará duplicado (solo al receptor interno, nunca al cliente final).

El receptor sale **siempre** de `catalogSettings.whatsappNumber` (configuración protegida, con consentimiento explícito);
nunca del teléfono que escribió el visitante ni de un dato deducido del perfil. Si ese número no es válido, el job nace
`failed` con un motivo claro y la solicitud igual se guarda.

## 3. Plantilla (crear en el WhatsApp Manager de la WABA correspondiente)

- **Nombre:** `nueva_solicitud_cotizacion` · **Categoría:** Utilidad · **Idioma:** Español (`es`)
- **Cuerpo** (no puede empezar ni terminar con una variable: lo exige Meta):

```
Nueva solicitud de cotización para {{1}}.

Cliente: {{2}}
WhatsApp del cliente: {{3}}
Referencia: {{4}}
Resumen: {{5}}

Abre la solicitud con el botón de abajo (te pedirá iniciar sesión).
```
- **Botón:** tipo *Ir al sitio web* → texto `Ver solicitud` → URL dinámica `https://logianalytics-pro-v2.vercel.app/solicitudes?ref={{1}}`
  (el sufijo es el id de la solicitud; abre `/solicitudes` dentro de la app, que exige sesión propia de la empresa. No lleva token).
- **Ejemplos para la revisión:** `{{1}}` Stefany's Creations · `{{2}}` María Pérez · `{{3}}` +1 809 555 1234 · `{{4}}` SC-ABC123 ·
  `{{5}}` 4 unidades en 2 productos · botón `{{1}}` `abc123XYZ`

Contenido de cada variable: nombre del negocio, nombre del cliente, WhatsApp internacional del cliente, referencia,
resumen de unidades y enlace autenticado (el botón). Los textos que escribe el visitante se sanean antes de enviarse
(sin saltos de línea/tabs/espacios repetidos, sin vacíos).

Hechos verificados en la documentación oficial de Meta: una plantilla debe estar `APPROVED` para enviarse; la categoría
Utility se aprueba/reclasifica según el contenido; el destinatario se envía en E.164 **con `+`**.
**No verificado:** si la WABA de prueba puede crear y enviar plantillas propias (la documentación solo muestra `hello_world`).
Se sabrá al crearla; si Meta no lo permite, la prueba de extremo a extremo con NUESTRA plantilla exige una WABA/número de producción.

## 4. Variables de entorno

Producción (Vercel) — **hoy no existe ninguna `WHATSAPP_*` ni `CRON_SECRET`**. Al activar, cargarlas con "Sensitive" en
Vercel → Settings → Environment Variables (nunca por chat ni en el repo):

| Variable | Qué es | Notas |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso (Bearer) para enviar | Token de **usuario del sistema**, permisos `whatsapp_business_messaging` + `whatsapp_business_management`. El del panel dura poco |
| `WHATSAPP_APP_SECRET` | Clave secreta de la app (Configuración → Básica) | Solo para **validar la firma** de los webhooks. No es el token de acceso |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Cadena propia, aleatoria | Solo el handshake GET de Meta. No es un secreto de la API |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número **emisor** | No es el número de teléfono |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ID de la WABA | Se valida contra el `entry.id` de cada webhook |
| `WHATSAPP_TEMPLATE_NAME` / `WHATSAPP_TEMPLATE_LANG` | `nueva_solicitud_cotizacion` / `es` | |
| `WHATSAPP_SENDING_ENABLED` | Interruptor: solo `true` envía | Cargar credenciales NO envía nada mientras esté ausente |
| `WHATSAPP_SEND_NOT_BEFORE` | ISO 8601, ej. `2026-10-05T14:00:00Z` | Poner al activar: nada creado antes se envía solo |
| `WHATSAPP_JOB_MAX_AGE_MINUTES` | Edad máxima para enviar sin intervención | Por defecto 360 |
| `CRON_SECRET` | ≥16 caracteres aleatorios | Para el cron diario de Vercel (el worker falla cerrado sin él) |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Solo si se adopta QStash (§6) | |
| `WHATSAPP_API_VERSION`, `APP_BASE_URL` | Opcionales | |

## 5. Webhook en Meta

Panel de la app → caso de uso de WhatsApp → Configuración → Webhooks: **URL de callback** = `<https-del-entorno>/api/webhooks/whatsapp`,
**Token de verificación** = el valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN` de ESE entorno, y suscribir el campo `messages`.
Meta exige HTTPS con certificado válido (los autofirmados no sirven), responde reintentando hasta 7 días y puede duplicar o
desordenar eventos: por eso cada evento se aplica en una transacción con id determinista.
Estado de la app: sin publicar. Meta advierte restricciones de webhooks en modo desarrollo; la documentación oficial no
detalla cuáles (solo dice que los de tipo `messages` funcionan en ambos modos). **Se sabrá al probar.** Además conviene
comprobar `GET /{waba-id}/subscribed_apps` (si la app no aparece, `POST` al mismo endpoint).

## 6. Recuperación durable en minutos

Hechos verificados (2026-09-29):
- Vercel **Hobby**: el cron corre como máximo **una vez al día**, con precisión de ±59 min, sin reintentos. Sirve de red de seguridad, no de recuperación en minutos.
- GCP: `billingEnabled: false` en `logianalytics-pro` (sin cambios). **Cloud Tasks / Cloud Scheduler / funciones programadas exigen facturación**: descartadas mientras no se autorice.
- Vercel exige plan Pro para uso comercial ("Hobby teams are restricted to non-commercial personal use only",
  https://vercel.com/docs/limits/fair-use-guidelines, actualizado 2026-09-14). LogiAnalytics se vende a empresas: conviene
  validarlo con Vercel; en Pro el cron admite 1 vez por minuto (US$20/mes, https://vercel.com/docs/plans/pro-plan).

**Recomendación: Upstash QStash (plan gratuito), con Firestore como fuente de verdad.**
- Coste: US$0 (Free: 1.000 mensajes/día, cada reintento cuenta como un mensaje; 10 schedules; pago por uso US$1 por 100.000 mensajes — https://upstash.com/pricing/qstash).
- Cómo encaja: el job ya está persistido en Firestore; tras un fallo reintentable, el código publica un mensaje con retraso (la espera progresiva del job) a `/api/cron/process-whatsapp-notifications`, autenticado por la firma `Upstash-Signature` (JWT HS256, ya verificada en `src/lib/workerAuth.ts`). Un *schedule* de QStash cada 10–15 min barre lo que quede vencido; el cron diario de Vercel queda como último respaldo.
- Si QStash cae o el publish falla: nada se pierde, el job sigue `pending`; lo recoge el siguiente barrido. Si nuestro endpoint falla: QStash reintenta (3 por defecto) y luego lo manda a su DLQ.
- Credenciales: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` (consola de Upstash → QStash). Se cargan directo en Vercel.
- No verificado oficialmente: si el plan gratuito pide tarjeta; el máximo de reintentos por plan.
- Alternativa sin cuenta externa: **Vercel Queues** (beta pública, 1M operaciones incluidas en Hobby, https://vercel.com/docs/queues/pricing) — descartada como primera opción por ser beta, sin DLQ nativa y con compatibilidad con Next 14 sin verificar.
- Alternativa de pago simple: Vercel Pro + cron por minuto (US$20/mes).

Estado: el código del lado servidor (verificación de firma, publicación diferida, worker por job y por barrido) **está implementado y probado**
con firmas y respuestas simuladas; **no** está probado contra QStash real (no hay cuenta).

## 7. Entorno aislado de pruebas (sandbox)

Preview de Vercel NO sirve (comparte el Firebase de producción). El sandbox usa un **emulador propio** de Firestore/Auth
(`firebase.sandbox.json`, puertos 8090/9199, proyecto `demo-logianalytics-sandbox`, en memoria y aislado de las pruebas automáticas, que usan 8080/9099),
el mismo código de la app en un servidor local (:3100), y un **proxy (:3101) que es lo único que sale a Internet por un túnel HTTPS**.
No copia datos comerciales: el negocio, el producto y el cliente son inventados; lo único real es el receptor autorizado de la prueba.

El proxy solo deja pasar:
1. `GET/POST /api/webhooks/whatsapp` → se reenvía al servidor del sandbox (valida la firma de Meta).
2. `GET /solicitudes?ref=<id>` → **página de revisión autenticada** (HTTP Basic: usuario `revision` + contraseña propia del sandbox, bloqueo de 15 min tras 5 fallos),
   servida por el propio proxy. Muestra UNA solicitud ficticia por id exacto y el estado de su aviso; no lista nada ni muestra el receptor.
Todo lo demás es 404. **Por qué no se expone la app real:** su página `/solicitudes` lee Firestore desde el navegador contra `127.0.0.1:8090/9199`;
un teléfono no los alcanza y exponerlos por el túnel dejaría abiertos los emuladores. La app real sí se comprobó en local (ver abajo).

El botón de la plantilla fija su dominio al crearla. En la WABA de prueba apunta al túnel del sandbox
(`npm run sandbox:template` lo calcula del túnel activo); en la de producción, a `https://logianalytics-pro-v2.vercel.app` (`-- --prod`).
El dominio del túnel de ngrok (`*.ngrok-free.dev`) es el del plan gratuito de la cuenta; si cambiara, habría que recrear la plantilla de prueba.
ngrok gratis muestra una pantalla de aviso ("Visit Site") la primera vez que un navegador abre el enlace; no afecta a Meta.

Requisitos: JDK 21 para los emuladores (en esta máquina: el de Android Studio, `C:\Program Files\Android\Android Studio\jbr`), `ngrok` con cuenta.

```bash
npm run sandbox:emulators           # emulador propio (con JDK 21 en PATH/JAVA_HOME)
npm run sandbox:secrets             # (tu terminal) token de acceso + App Secret con entrada OCULTA; -- --init solo genera los tokens al azar
npm run sandbox:seed                # workspace, catálogo y producto ficticios + cuenta de login que existe SOLO en el emulador
npm run sandbox:server              # Next :3100 contra los emuladores (envío apagado salvo SANDBOX_SENDING_ENABLED=true)
npm run sandbox:proxy               # :3101
ngrok http 127.0.0.1:3101
npm run sandbox:preflight           # cañería completa por la URL pública
npm run sandbox:prepare-review      # crea la solicitud ficticia SIN enviar y muestra el mensaje exacto con su referencia y enlace
npm run sandbox:copy-verify-token   # portapapeles (no se imprime) → campo "Token de verificación" de Meta
npm run sandbox:copy-review-password
npm run sandbox:meta-check          # solo lectura: suscripción messages, app↔WABA, token, número, plantillas
npm run sandbox:link-waba           # muestra el estado de subscribed_apps SIN cambiar nada; "-- --apply" vincula nuestra app (solo con autorización)
npm run sandbox:template            # muestra el payload de la plantilla; "-- status" la consulta; "-- --submit" la envía a revisión
```

Comprobaciones hechas (2026-09-29): `sandbox:preflight` (túnel, handshake, 403 con token malo, rutas ajenas 404, firma inválida 401, POST firmado aplicado,
estado escrito en el emulador, evento registrado); la página de revisión por la URL pública (401 sin credenciales, 200 con ellas, sin exponer el receptor, 404/400 en ids ajenos
o mal formados, rutas no permitidas 404); y la app real en local (sin sesión → `/login?next=…` → login → abre esa solicitud). Eso prueba la cañería local,
**no** que Meta la use: se prueba solo cuando Meta entrega un evento real.

Prueba de extremo a extremo (envía **un** mensaje real de nuestra plantilla, solo tras autorización expresa del texto, la solicitud y el receptor):
`npm run sandbox:e2e -- precheck` (no envía: plantilla APPROVED, token con margen, app vinculada, `messages` y `message_template_status_update` suscritos, servidor del webhook y túnel activos,
y que el aviso sea exactamente el autorizado), `npm run sandbox:e2e -- selftest` (no envía: ensaya el emisor con un id inexistente) y
`SANDBOX_ALLOW_REAL_SEND=yes npm run sandbox:e2e -- send`. El envío lo hace un **proceso emisor aparte** (puerto 3102, el único con el envío habilitado) que procesa
**solo ese aviso, una vez**, y se detiene en cuanto responde; el servidor del webhook (:3100, envío siempre apagado) y el túnel siguen activos hasta recibir `delivered`/`read`
o agotar una espera de 6 min. Ante un timeout ambiguo no reenvía. El servidor del sandbox nunca se inicia con el envío habilitado.
El enlace del botón apunta a la página de revisión autenticada del sandbox (la misma solicitud ficticia que se aprobó).

**Eventos reales vs sintéticos.** Un evento firmado por nuestros propios scripts (`sandbox:preflight`, `sandbox:synthetic-template-event`) es válido criptográficamente
pero **no viene de Meta y no demuestra nada sobre Meta**. Esos scripts marcan sus peticiones (cabecera `x-sandbox-synthetic` y User-Agent `sandbox-synthetic/1`); el webhook
etiqueta su log con `[SINTÉTICO]` y `sandbox:watch-meta` clasifica el tráfico del túnel por origen (`REAL de Meta` = User-Agent de Meta sin marca sintética; `SINTÉTICO`; `OTRO`).
El vigilante en modo `--loop` avisa **solo** de POST reales de Meta al webhook, y aun esos son informativos. **Ninguna señal del webhook autoriza un envío**: la única autorización técnica
es la consulta a la API de Meta (`GET /{waba}/message_templates` → `APPROVED`) que `e2e send` repite dentro de sí mismo justo antes de enviar. Para dar la prueba de extremo a extremo
por válida se exige además al menos un POST real de Meta (firmado y aceptado con 200), no solo el estado en el emulador. El User-Agent es falsificable: es una etiqueta, no una autenticación
(la autenticación es la firma).

Nota de la prueba del 2026-09-30: el aviso tenía >24 h (esperó la aprobación) y la regla de frescura lo habría descartado; se reinició su `freshSince` por decisión humana expresa (solo ese aviso). El clasificador de origen no reconocía el User-Agent real de los POST de webhook (`facebookexternalua` sin versión) y la primera evaluación dijo "NO PROBADO"; se corrigió con la muestra real y la evidencia se verificó aparte (ver arriba). Estado de la plantilla de prueba (histórico): enviada a revisión el 2026-09-29 20:05; a las 20:54 seguía `PENDING`. **Meta no ha dado ningún motivo de la demora**: que el botón devuelva 401 a
`facebookexternalhit` es solo una hipótesis, no un hallazgo. El webhook registra (solo nombre y estado) los `message_template_status_update` de nuestra WABA; ese campo está suscrito
a nivel de app (verificado en la Graph API el 2026-09-29 21:08, versión v26.0).

## 8. Número emisor definitivo y coexistencia (hechos verificados)

- El receptor (WhatsApp de Stefany) **no se registra en nada**: sigue en su app normal. Lo que se registra en la Cloud API es el **emisor**.
- Un número registrado en la Cloud API **no puede usarse a la vez** en la app WhatsApp Messenger (personal).
- **Coexistencia** (mismo número en la app *WhatsApp Business* y en la API): existe; exige WhatsApp Business app ≥ 2.24.17, onboarding por Embedded Signup
  y ser Tech Provider/Solution Partner (o usar uno); no aplica a WhatsApp Messenger; historial hasta 6 meses sincronizable en las primeras 24 h.
  Cobertura por país: la documentación oficial no menciona República Dominicana ni la excluye → **sin confirmar**. No es "incompatible" en general.
- Camino sin dependencias: número dedicado registrado directo en la Cloud API, independiente del WhatsApp de Stefany.

## 9. Coste de los mensajes

Meta cobra por mensaje de plantilla **entregado**. Utility a República Dominicana (región "Rest of Latin America"): **US$0,0113** por mensaje
(tarifa vigente desde 2026-07-01, https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing). Meta cambia tarifas los días 1 de
enero/abril/julio/octubre; el 1-oct-2026 no estaba publicado al 29-sep: volver a comprobar. Dentro de una ventana de servicio de 24 h abierta, la plantilla utility es gratuita
(no aplica a este aviso, que abre la conversación). A pocas solicitudes por día son centavos de dólar al mes.

## 10. Checklist de activación en producción (en este orden)

1. Desplegar este código (`git push origin master`) y `firebase deploy --only firestore:rules` (reglas nuevas: dedup y eventos, solo Admin SDK). Sin ninguna variable `WHATSAPP_*`, el envío sigue apagado.
2. Crear en Vercel `CRON_SECRET` (si se quiere el cron diario) y, si se adopta, las de QStash.
3. Registrar el número emisor definitivo y crear la plantilla en esa WABA; aprobar.
4. Configurar el webhook de producción y comprobar el handshake.
5. Cargar credenciales de producción **y** `WHATSAPP_SEND_NOT_BEFORE=<ahora>`, y solo después `WHATSAPP_SENDING_ENABLED=true`.
6. Una solicitud de prueba propia (no de un cliente) y verificar `delivered`/`read` en Solicitudes.
