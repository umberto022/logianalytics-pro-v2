// Despertador externo del worker de avisos — server-only.
//
// FUENTE DE VERDAD = Firestore (el job persistido en la misma transacción que
// la solicitud). Este módulo solo "despierta" al worker en el momento debido
// (reintento con espera progresiva) vía QStash de Upstash; si QStash no está
// configurado o falla, NO se pierde nada: el job sigue "pending" y lo levanta el
// barrido programado (cron diario de Vercel como último respaldo, o el schedule
// de QStash). Nunca lanza: un fallo acá jamás afecta la solicitud del cliente.
//
// Sin QSTASH_TOKEN este módulo es un no-op explícito.

export interface WakeResult { published: boolean; reason?: string }

function workerUrl(): string {
  const base = process.env.APP_BASE_URL || "https://logianalytics-pro-v2.vercel.app";
  return `${base}/api/cron/process-whatsapp-notifications`;
}

export async function scheduleWorkerWake(params: {
  workspaceId: string;
  quoteId: string;
  attempt: number;
  delaySeconds: number;
}): Promise<WakeResult> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return { published: false, reason: "qstash_not_configured" };
  const apiBase = (process.env.QSTASH_URL || "https://qstash.upstash.io").replace(/\/$/, "");
  try {
    const res = await fetch(`${apiBase}/v2/publish/${workerUrl()}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Upstash-Delay": `${Math.max(0, Math.round(params.delaySeconds))}s`,
        // Reintentos propios de QStash SOLO por si nuestro endpoint no responde 2xx; el
        // backoff de negocio lo maneja el job en Firestore (nextAttemptAt).
        "Upstash-Retries": "3",
        "Upstash-Deduplication-Id": `wa-${params.quoteId}-${params.attempt}`,
      },
      body: JSON.stringify({ workspaceId: params.workspaceId, quoteId: params.quoteId }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { published: false, reason: `qstash_http_${res.status}` };
    return { published: true };
  } catch {
    return { published: false, reason: "qstash_unreachable" };
  }
}
