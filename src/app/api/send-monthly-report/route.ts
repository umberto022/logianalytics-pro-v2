import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminDb } from "@/lib/firebase-admin";
import { fmtCurrency } from "@/lib/utils";

const resend = new Resend(process.env.RESEND_API_KEY);

// Vercel Cron calls this route once a month (vercel.json: "0 9 1 * *").
// Authorization header must match CRON_SECRET env var.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db   = getAdminDb();
    const sent: string[] = [];
    const errors: string[] = [];

    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const profile = userDoc.data();
      const uid     = userDoc.id;
      const email   = profile.email as string | undefined;
      if (!uid || !email) continue;

      try {
        const report = await buildMonthlyReport(db, uid);
        await resend.emails.send({
          from:    process.env.REPORT_FROM_EMAIL ?? "reportes@logianalytics.app",
          to:      email,
          subject: `📊 Reporte mensual — ${report.monthLabel}`,
          html:    buildEmailHtml(report, (profile.fullName as string) ?? ""),
        });
        sent.push(email);
      } catch (e) {
        errors.push(`${email}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    return NextResponse.json({ sent: sent.length, errors });
  } catch (e) {
    console.error("Monthly report error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ─── Data builder ─────────────────────────────────────────────────────────────

interface MonthlyReport {
  monthLabel:    string;
  totalRevenue:  number;
  totalProfit:   number;
  margin:        number;
  numSales:      number;
  topProducts:   { name: string; revenue: number }[];
  pendingOrders: number;
  criticalStock: number;
}

export async function buildMonthlyReport(
  db: FirebaseFirestore.Firestore,
  uid: string,
  testMode = false
): Promise<MonthlyReport> {
  const { Timestamp } = await import("firebase-admin/firestore");
  const now   = new Date();
  // In test mode use current month; otherwise previous month
  const start = testMode
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = testMode
    ? new Date()
    : new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const monthLabel = start.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const from = Timestamp.fromDate(start);
  const to   = Timestamp.fromDate(end);

  // Sales for the period — each doc has direct fields
  const salesSnap = await db
    .collection("sales").doc(uid).collection("records")
    .where("saleDate", ">=", from)
    .where("saleDate", "<=", to)
    .get();

  let totalRevenue = 0, totalCost = 0, numSales = 0;
  const productMap = new Map<string, number>();

  for (const d of salesSnap.docs) {
    const s = d.data();
    totalRevenue += (s.totalRevenue as number) ?? 0;
    totalCost    += (s.totalCost    as number) ?? 0;
    numSales++;
    const name = (s.productName as string) ?? "Producto";
    productMap.set(name, (productMap.get(name) ?? 0) + ((s.totalRevenue as number) ?? 0));
  }

  const totalProfit = totalRevenue - totalCost;
  const margin      = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const topProducts = Array.from(productMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, revenue]) => ({ name, revenue }));

  // Pending purchase orders
  const ordersSnap = await db
    .collection("purchaseOrders").doc(uid).collection("orders")
    .where("status", "==", "pendiente")
    .get();

  // Critical stock items (currentStock <= minStock)
  const invSnap = await db.collection("inventory").doc(uid).collection("items").get();
  let criticalStock = 0;
  for (const d of invSnap.docs) {
    const i = d.data();
    if (((i.currentStock as number) ?? 0) <= ((i.minStock as number) ?? 0)) criticalStock++;
  }

  return {
    monthLabel, totalRevenue, totalProfit, margin, numSales,
    topProducts, pendingOrders: ordersSnap.size, criticalStock,
  };
}

// ─── Email HTML ───────────────────────────────────────────────────────────────

export function buildEmailHtml(r: MonthlyReport, name: string): string {
  const topRows = r.topProducts.map((p) =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${p.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;">${fmtCurrency(p.revenue)}</td>
    </tr>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">📊 Reporte Mensual</h1>
      <p style="color:#c7d2fe;margin:8px 0 0;font-size:14px;">${r.monthLabel}</p>
    </div>
    <div style="padding:24px 32px 0;">
      <p style="color:#475569;font-size:15px;margin:0;">Hola${name ? ` <strong>${name}</strong>` : ""},</p>
      <p style="color:#475569;font-size:14px;margin:8px 0 0;">Aquí está el resumen de tu negocio${r.numSales === 0 ? " — sin ventas registradas este período." : " del período."}</p>
    </div>
    <div style="padding:24px 32px;display:flex;gap:16px;flex-wrap:wrap;">
      ${kpiBox("Ingresos",  fmtCurrency(r.totalRevenue), "#10b981")}
      ${kpiBox("Ganancia",  fmtCurrency(r.totalProfit),  "#6366f1")}
      ${kpiBox("Margen",    `${r.margin.toFixed(1)}%`, r.margin >= 20 ? "#10b981" : r.margin >= 10 ? "#f59e0b" : "#ef4444")}
      ${kpiBox("Ventas",    String(r.numSales), "#3b82f6")}
    </div>
    ${r.topProducts.length > 0 ? `
    <div style="padding:0 32px 24px;">
      <h2 style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 12px;">Top productos</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;">Producto</th>
          <th style="padding:8px 12px;text-align:right;color:#64748b;font-weight:600;">Ingresos</th>
        </tr></thead>
        <tbody>${topRows}</tbody>
      </table>
    </div>` : ""}
    ${r.pendingOrders > 0 || r.criticalStock > 0 ? `
    <div style="padding:0 32px 24px;">
      <h2 style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 12px;">Alertas</h2>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${r.pendingOrders > 0 ? alertBox(`🛒 ${r.pendingOrders} orden${r.pendingOrders !== 1 ? "es" : ""} de compra pendiente${r.pendingOrders !== 1 ? "s" : ""}`, "#fef3c7", "#92400e") : ""}
        ${r.criticalStock > 0 ? alertBox(`⚠️ ${r.criticalStock} producto${r.criticalStock !== 1 ? "s" : ""} con stock crítico`, "#fee2e2", "#991b1b") : ""}
      </div>
    </div>` : ""}
    <div style="background:#f8fafc;padding:20px 32px;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">LogiAnalytics Pro · Reporte automático mensual</p>
      <p style="color:#cbd5e1;font-size:11px;margin:6px 0 0;">Enviado el ${new Date().toLocaleDateString("es-ES")}</p>
    </div>
  </div>
</body>
</html>`;
}

function kpiBox(label: string, value: string, color: string): string {
  return `<div style="flex:1;min-width:110px;background:#f8fafc;border-radius:12px;padding:16px;text-align:center;">
    <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin:0 0 4px;">${label}</p>
    <p style="font-size:20px;font-weight:700;color:${color};margin:0;">${value}</p>
  </div>`;
}

function alertBox(text: string, bg: string, color: string): string {
  return `<div style="background:${bg};border-radius:8px;padding:10px 14px;font-size:13px;color:${color};">${text}</div>`;
}
