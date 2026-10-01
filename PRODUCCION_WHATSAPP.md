# Guía: poner en producción el aviso por WhatsApp con un número propio

Estado al 2026-09-30: el código ya está desplegado y el envío está **APAGADO**. Falta el emisor definitivo (este documento).
Contexto técnico y garantías: `WHATSAPP_SETUP.md`. Las comprobaciones de Meta de abajo vienen de su documentación oficial (consultada el 2026-09-30);
lo que no está confirmado en fuente oficial se marca **(sin confirmar)**.

Regla de oro: **ninguna credencial va por chat ni al repositorio.** Se cargan con `npm.cmd run prod:secrets` (entrada oculta → archivo local ignorado por git → Vercel,
tipo Sensitive). Los avisos siguen apagados hasta que `npm.cmd run prod:check` pase todo y tú autorices una prueba real.

## Qué necesitas antes de empezar
- **Un número de teléfono dedicado** (no el WhatsApp personal de nadie): propio, con código de país y de área, que pueda recibir **SMS o llamada de voz**. Móvil es lo recomendado; fijo o virtual (VoIP) también valen para la llamada de voz.
  Debe estar **libre de WhatsApp**: si ya tiene WhatsApp Messenger hay que eliminar esa cuenta antes (Ajustes → Cuenta → Eliminar mi cuenta; tarda hasta 3 minutos en liberarse).
  Si tiene la app WhatsApp Business, eliminar la cuenta pierde el historial; la coexistencia exige un partner de Meta y no está disponible para un desarrollador directo. Los prefijos 809/829/849 no tienen restricción documentada.
- **Una tarjeta Visa o Mastercard** (no American Express ni PayPal). Meta exige método de pago en una cuenta propia para enviar plantillas; sin él, el envío falla (error 131042). República Dominicana figura entre los países admitidos. Divisa probable: USD **(sin confirmar)**; la zona horaria y la divisa no se pueden cambiar una vez asignada una línea de crédito.
- **Coste:** USD 0,0113 por mensaje de plantilla *entregado* a República Dominicana (tarifa Utility "Resto de Latinoamérica"; igual desde el 1-oct-2026). 10 avisos al día ≈ USD 3,4 al mes. Hay impuestos/tipo de cambio de tu tarjeta que Meta no detalla.
- **Una cuenta gratuita en Upstash** (cola de reintentos QStash). Gratis: 1.000 mensajes/día (usamos ~150). Si al registrarte te pide tarjeta, detente y avísame.
- Tiempo: el trabajo en Meta son ~30–60 min; la revisión de la plantilla puede tardar hasta 24 h.

## Parte 1 — Meta: crear la cuenta de WhatsApp de producción y registrar el número (tú)
Nota: desde el 23-sep-2026 Meta está migrando la "WABA" a dos objetos (Cuenta de WhatsApp = un número; Cuenta de mensajes = plantillas, pagos, webhooks). Hasta que tu portfolio migre (mediados de octubre) verás el modelo anterior, así que algunos nombres de menú pueden variar.
**No toques la "Cuenta de prueba"** (no pulses Eliminar en Panel de apps → WhatsApp → Configuración): borraría el portfolio y los recursos de prueba.

1. Entra a Meta Business Suite con el portfolio **Logianalytics pro** (el mismo de la app *LogiAnalytics Avisos*).
2. **Crear la cuenta nueva:** Configuración (engranaje) → Cuentas → **Cuentas de WhatsApp** → **+ Agregar** → *Crear una nueva cuenta de WhatsApp*. Pide nombre de la cuenta, "Mensajes para" (tu portfolio), zona horaria (`America/Santo_Domingo`) y divisa, y opcionalmente el método de pago. (Alternativa: Panel de apps → WhatsApp → Configuración de la API → agregar número de teléfono de producción.)
3. **Método de pago:** Administrador de WhatsApp → Información general → tu cuenta nueva → tres puntos → *Administrar la configuración de la cuenta* → pestaña *Configuración* → **Configuración de pago** → *Añadir método de pago* (tarjeta + datos de la empresa). Requiere el permiso "Administrar cuenta de WhatsApp".
4. **Agregar el número:** Administrador de WhatsApp → elige la **cuenta nueva** (no *Test WhatsApp Business Account*) → **Números de teléfono** → **Agregar número de teléfono**. Perfil de empresa: *nombre visible* y categoría. Luego el número y el método de verificación (SMS o llamada) y el código que recibas.
   - **Nombre visible:** debe representar tu negocio (p. ej. el nombre comercial de LogiAnalytics); no puede ser genérico, no puede incluir "oficial"/"verificado", ni mencionar Meta/WhatsApp/Facebook, ni tener formato de URL o correo, ni lenguaje promocional. No hace falta que Meta lo apruebe para empezar a enviar; la revisión llega al subir de límites.
   - **Verificación del negocio: no es obligatoria.** Sin verificar, el límite es 250 destinatarios únicos por 24 h por portfolio: de sobra para un solo destinatario.
5. Anota dos IDs (no son secretos): el **ID del número de teléfono** (Números de teléfono → tu número) y el **ID de la cuenta de WhatsApp Business** (Información general). El **ID de la app** está en el panel de la app.

## Parte 2 — Meta: token permanente de usuario del sistema (tú)
El token temporal del panel ("Configuración de la API") caduca en horas y **no sirve en producción**.
1. Business Suite → Configuración del negocio → **Usuarios del sistema** → **+ Agregar** (nombre p. ej. `avisos-whatsapp`, rol Administrador o Empleado).
2. Selecciónalo → **Asignar activos**: la app *LogiAnalytics Avisos* con **Administrar app** (control total) y la **cuenta de WhatsApp nueva** y su **cuenta de mensajes** con acceso Total. (Si es rol Empleado hay que asignar ambas explícitamente.)
3. **Generar token**: elige la app, vencimiento **"Nunca vence"** y los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. Cópialo y **no lo pegues en ningún chat**: se carga en la Parte 4. Se puede revisar con `prod:check` (debe salir "SYSTEM_USER" y sin vencimiento).

## Parte 3 — Registrar el número en la Cloud API (tú, por script, PIN oculto)
Meta solo permite hacerlo por API. Después de cargar el token y el ID del número (Parte 4):
```bash
npm.cmd run prod:register
```
Te pide un PIN de 6 dígitos con entrada oculta (si el número no tenía verificación en dos pasos, ese será su PIN: guárdalo). El script se niega si el número es el de prueba o si aún no está verificado por SMS/llamada. Debe terminar con estado `CONNECTED`.

## Parte 4 — Cargar las credenciales (tú, entrada oculta)
Crea antes la cuenta de **Upstash** → QStash y ten a mano `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` y `QSTASH_NEXT_SIGNING_KEY` (consola de Upstash → QStash). Luego, en PowerShell:
```bash
cd C:\Users\Admin\.cursor\logi_analytics_pro_v2
```
```bash
npm.cmd run prod:secrets
```
Te va pidiendo cada valor (oculto salvo los IDs; Enter = no cambiar), valida el formato (token de usuario del sistema = `EAA…`; App Secret = 32 hexadecimales), los guarda en `.env.production-meta.local` (solo tu máquina) y los envía a Vercel (Production, Sensitive). **Genera al azar** el token de verificación del webhook y `CRON_SECRET`. `npm.cmd run prod:secrets -- --dry-run` solo muestra qué falta. **No toca `WHATSAPP_SENDING_ENABLED`.**

## Parte 5 — Meta: webhook de producción (tú)
1. `npm.cmd run prod:copy-verify-token` copia al portapapeles el token de verificación (sin mostrarlo).
2. Panel de la app → WhatsApp → Configuración (o Casos de uso → Personalizar → Configuración) → **URL de devolución de llamada** = `https://logianalytics-pro-v2.vercel.app/api/webhooks/whatsapp`, **Token de verificación** = Ctrl+V → *Verificar y guardar*; deja suscritos `messages` y `message_template_status_update`.
   Una app tiene **una** URL: al cambiarla a producción, los eventos de la cuenta de prueba también llegarán allí y el webhook los ignora (otro `phone_number_id`).
   *(Esto exige que Claude haya hecho antes el redeploy para que producción conozca el token; ver Parte 6.)*

## Parte 6 — Lo que hago yo cuando me avises (sin tocar credenciales)
Cuando cargues las credenciales: 1) **redeploy** de Vercel para que lea las variables; 2) `npm.cmd run prod:link-waba` (vincular la app a la cuenta nueva, con tu OK) ; 3) `npm.cmd run prod:template` → te muestro el payload y, con tu OK, `-- --submit` (plantilla *Utilidad*, español, botón → `https://logianalytics-pro-v2.vercel.app/solicitudes?ref={{1}}`; revisión hasta 24 h; si Meta la reclasifica a Marketing se cobra la tarifa de Marketing —0,0740— y se puede pedir revisión); 4) `npm.cmd run prod:qstash -- --apply` (schedule de barrido cada 10 min); 5) `npm.cmd run prod:check` hasta que todo pase.

## Parte 7 — Verificación y activación (con tu autorización expresa en cada paso)
1. `prod:check` con **todo en PASA**: token de usuario del sistema sin vencimiento, WABA y número que **no** son los de prueba, número verificado y conectado, nombre aprobado o disponible, app vinculada, callback y botón de producción, plantilla APPROVED, schedule de QStash.
2. **Una prueba real controlada** (te presento texto exacto, receptor Stefany y alcance antes; no repite PAL-Z6SZ4Z): requiere activar el envío un momento. Se verifica `delivered`/`read` firmado y con el mismo identificador de mensaje, como en el sandbox.
3. **Activar:** en Vercel (Production) poner `WHATSAPP_SEND_NOT_BEFORE` = la hora de activación (nada anterior se envía solo) y **después** `WHATSAPP_SENDING_ENABLED=true`; redeploy. Solo desde entonces cada solicitud nueva crea y envía su aviso.
4. **Reversión inmediata:** borrar `WHATSAPP_SENDING_ENABLED` en Vercel y redeploy. Con el interruptor apagado no se crea ningún aviso.

## Riesgos y cosas que podrían cambiar el plan
- **Modo de la app (Desarrollo):** la documentación recomienda modo Live para webhooks y dice que en Desarrollo "algunos webhooks no se envían"; en el sandbox sí llegaron los de mensajes. Probaremos en Desarrollo primero. Si los estados `delivered`/`read` de la cuenta nueva no llegan, publicar la app (Panel de apps → Publicar; pide URL de política de privacidad —ya existe `/privacidad`—, ícono 1024×1024, categoría y propósito "Tú o tu negocio"). No requiere App Review ni verificación del negocio cuando el único usuario es el dueño, pero Meta advierte de que en modo Live solo siguen activos los permisos aprobados: se probaría de inmediato y se podría volver a Desarrollo. **No lo hago sin tu decisión.**
- **Categoría de la plantilla:** un aviso interno al dueño es zona gris para "Utilidad"; se mantiene transaccional y sin promoción para evitar la reclasificación.
- **Cambios de precio del 1-oct-2026:** los mensajes de servicio y las plantillas de utilidad dentro de una ventana de 24 h abierta pasan a cobrarse; no cambia la tarifa de Utility para RD.
- **Vercel Hobby** prohíbe el uso comercial; sigue pendiente validarlo con Vercel (ver `WHATSAPP_SETUP.md` §6). En Pro el cron admite 1 por minuto (US$20/mes) y no haría falta QStash.
- **Sin confirmar:** entrega de SMS/voz de verificación en prefijos dominicanos por tipo de línea; límites exactos de usuarios del sistema por portfolio; si el portfolio sin verificar impone algún tope adicional al registrar el número.
