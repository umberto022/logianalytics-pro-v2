import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminDb } from "@/lib/firebase-admin";
import { buildMonthlyReport, buildEmailHtml } from "@/lib/monthlyReport";

const getResend = () => new Resend(process.env.RESEND_API_KEY);

// Vercel Cron calls this route once a month (vercel.json: "0 9 1 * *").
// Authorization header must match CRON_SECRET env var.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db     = getAdminDb();
    const resend = getResend();
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
