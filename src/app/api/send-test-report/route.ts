import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { buildMonthlyReport, buildEmailHtml } from "@/lib/monthlyReport";

const getResend = () => new Resend(process.env.RESEND_API_KEY);

// Called from the Configuración page to send a test report to the current user.
// Requires Firebase ID token in Authorization header.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  try {
    const auth    = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid     = decoded.uid;

    const db      = getAdminDb();
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const profile     = userDoc.data()!;
    const email       = profile.email as string;
    const fullName    = (profile.fullName as string) ?? "";
    const workspaceId = (profile.workspaceId as string | undefined) ?? uid;

    const report = await buildMonthlyReport(db, workspaceId, true); // testMode = current month
    await getResend().emails.send({
      from:    process.env.REPORT_FROM_EMAIL ?? "reportes@logianalytics.app",
      to:      email,
      subject: `📊 Reporte de prueba — ${report.monthLabel}`,
      html:    buildEmailHtml(report, fullName),
    });

    return NextResponse.json({ ok: true, email });
  } catch (e) {
    console.error("Test report error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
