// Arma mensajes prellenados de WhatsApp (wa.me) — Stefany revisa y envía a
// mano. Nada acá manda mensajes ni usa la API de WhatsApp Business.
import type { CatalogQuote, CatalogSettings } from "@/types";
import { fmtRD } from "@/lib/money";

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export function buildWhatsappLink(phone: string, message: string): string {
  return `https://wa.me/${onlyDigits(phone)}?text=${encodeURIComponent(message)}`;
}

function itemsBlock(quote: CatalogQuote): string {
  return quote.items
    .map((it) => {
      const variant = it.variantLabel ? ` (${it.variantLabel})` : "";
      const tag = it.isBackorder ? " — por encargo" : "";
      return `• ${it.productName}${variant} x${it.quantity} — ${fmtRD(it.unitPriceCents * it.quantity)}${tag}`;
    })
    .join("\n");
}

export function buildQuoteMessage(quote: CatalogQuote, settings: CatalogSettings): string {
  const lines = [
    `Hola ${quote.customerName}, somos ${settings.businessName} 🌸`,
    `Referencia: ${quote.publicRef}`,
    ``,
    itemsBlock(quote),
    ``,
    `Subtotal: ${fmtRD(quote.subtotalCents)}`,
  ];
  if (quote.discountCents > 0) lines.push(`Descuento (${quote.discountPct}%): -${fmtRD(quote.discountCents)}`);
  lines.push(`Total productos: ${fmtRD(quote.productsTotalCents)}`);
  lines.push(quote.shippingCents !== undefined ? `Envío: ${fmtRD(quote.shippingCents)}` : `Envío: por cotizar`);
  if (quote.totalCents !== undefined) lines.push(`Total: ${fmtRD(quote.totalCents)}`);
  if (quote.requiresAdvance && quote.advanceAmountCents) {
    lines.push(``, `Anticipo requerido: ${fmtRD(quote.advanceAmountCents)}`);
    if (quote.balanceDueCents !== undefined) lines.push(`Saldo restante: ${fmtRD(quote.balanceDueCents)}`);
  }
  lines.push(
    ``,
    `Modalidad: ${quote.deliveryMethod === "retiro" ? "Retiro" : `Entrega${quote.zone ? ` - ${quote.zone}` : ""}`}`,
    `Plazo: ${quote.leadTimeNote}`,
    ``,
    `¿Confirmamos el pedido con estas condiciones?`
  );
  return lines.join("\n");
}

export function buildConfirmationMessage(quote: CatalogQuote, settings: CatalogSettings): string {
  const lines = [
    `¡Gracias ${quote.customerName}! Tu pedido con ${settings.businessName} quedó confirmado ✅`,
    `Referencia: ${quote.publicRef}`,
    ``,
    itemsBlock(quote),
  ];
  if (quote.totalCents !== undefined) lines.push(``, `Total: ${fmtRD(quote.totalCents)}`);
  if (quote.balanceDueCents !== undefined && quote.balanceDueCents > 0) {
    lines.push(`Saldo pendiente: ${fmtRD(quote.balanceDueCents)}`);
  }
  lines.push(
    `Modalidad: ${quote.deliveryMethod === "retiro" ? "Retiro" : `Entrega${quote.zone ? ` - ${quote.zone}` : ""}`}`,
    `Plazo: ${quote.leadTimeNote}`,
    ``,
    `¡Te avisamos cualquier novedad!`
  );
  return lines.join("\n");
}
