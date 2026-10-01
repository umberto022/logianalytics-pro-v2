// Redirección de vuelta tras el login (`/login?next=/solicitudes?ref=...`). Solo se acepta una RUTA interna de la
// app: nunca otro origen, esquema ni "//host" (open redirect). Sirve para que el enlace autenticado del aviso de
// WhatsApp (/solicitudes?ref=<id>) siga abriendo esa solicitud aunque la sesión esté cerrada.

const ORIGIN = "http://internal.invalid";

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 500) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (/[\u0000-\u001f\\]/.test(raw)) return null; // controles y barra invertida (los navegadores la tratan como "/")
  let url: URL;
  try { url = new URL(raw, ORIGIN); } catch { return null; }
  if (url.origin !== ORIGIN) return null;
  if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return null;
  return url.pathname + url.search + url.hash;
}

/** URL de login que recuerda a dónde volver. Sin destino útil (raíz, dashboard, login) devuelve "/login" a secas. */
export function loginUrlWithNext(pathname: string, search: string): string {
  const target = safeNextPath(pathname + search);
  if (!target || pathname === "/" || pathname === "/dashboard") return "/login";
  return `/login?next=${encodeURIComponent(target)}`;
}
