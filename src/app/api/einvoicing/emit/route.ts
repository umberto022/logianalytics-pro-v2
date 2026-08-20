import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { getAlanubeConfig, alanubeCreateInvoice, AlanubeError } from "@/lib/einvoicing/alanube";
import { buildAlanubePayload, buildInvoiceDraft } from "@/lib/einvoicing/mapper";
import { defaultECfType } from "@/lib/firestore/einvoicing";
import type { Company, ECfType, Sale } from "@/types";

// Los otros endpoints/mapeos aún no están armados.
function isEmittableType(t: ECfType): t is "31" | "32" {
  return t === "31" || t === "32";
}

// Emite un e-CF (Alanube → DGII) para una venta ya registrada.
// Requiere: Firebase ID token del caller (rol admin o ventas de su workspace),
// ALANUBE_API_KEY configurada en el server, y un rango de e-NCF autorizado
// por DGII cargado en Configuración para el tipo de comprobante pedido.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const db = getAdminDb();

    const callerSnap = await db.collection("users").doc(decoded.uid).get();
    if (!callerSnap.exists) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    const callerProfile = callerSnap.data()!;
    const role = callerProfile.role as string;
    if (role !== "admin" && role !== "ventas") {
      return NextResponse.json({ error: "Sin permiso para emitir facturas" }, { status: 403 });
    }
    const workspaceId = (callerProfile.workspaceId as string | undefined) ?? decoded.uid;

    const body = await req.json();
    const { saleOrderId, saleId, eCfType: requestedType } = body as {
      saleOrderId?: string; saleId?: string; eCfType?: ECfType;
    };
    if (!saleOrderId && !saleId) {
      return NextResponse.json({ error: "Falta saleOrderId o saleId" }, { status: 400 });
    }

    // ── 1. Cargar la(s) línea(s) de venta ──────────────────────────────────
    const recordsCol = db.collection("sales").doc(workspaceId).collection("records");
    let sales: Sale[];
    if (saleOrderId) {
      const snap = await recordsCol.where("saleOrderId", "==", saleOrderId).get();
      if (snap.empty) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
      sales = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sale));
    } else {
      const snap = await recordsCol.doc(saleId!).get();
      if (!snap.exists) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
      sales = [{ id: snap.id, ...snap.data() } as Sale];
    }

    // ── 2. Evitar doble emisión ─────────────────────────────────────────────
    const invoicesCol = db.collection("electronicInvoices").doc(workspaceId).collection("records");
    const dupQuery = saleOrderId
      ? await invoicesCol.where("saleOrderId", "==", saleOrderId).limit(1).get()
      : await invoicesCol.where("saleIds", "array-contains", saleId!).limit(1).get();
    const existing = dupQuery.docs[0];
    if (existing && ["enviado", "aceptado"].includes(existing.data().status)) {
      return NextResponse.json({ error: "Esta venta ya tiene un e-CF emitido", invoiceId: existing.id }, { status: 409 });
    }

    // ── 3. Cargar datos fiscales de la empresa ──────────────────────────────
    // El perfil de empresa cuelga del admin dueño del workspace, no de cada empleado.
    const ownerSnap = await db.collection("users").doc(workspaceId).get();
    const companyId = ownerSnap.data()?.companyId as string | undefined;
    if (!companyId) {
      return NextResponse.json(
        { error: "Falta registrar los datos de la empresa en Configuración antes de facturar" },
        { status: 422 }
      );
    }
    const companySnap = await db.collection("companies").doc(companyId).get();
    if (!companySnap.exists) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }
    const company = { id: companySnap.id, ...companySnap.data() } as Company;
    if (!company.rif) {
      return NextResponse.json({ error: "Falta el RNC de la empresa en Configuración" }, { status: 422 });
    }

    const eCfType = requestedType ?? defaultECfType(sales[0].clientRnc);
    if (!isEmittableType(eCfType)) {
      return NextResponse.json({ error: `Tipo de e-CF "${eCfType}" aún no soportado` }, { status: 400 });
    }

    // ── 4. Alanube configurada ──────────────────────────────────────────────
    const alanubeConfig = getAlanubeConfig();
    if (!alanubeConfig) {
      return NextResponse.json(
        { error: "Facturación electrónica no configurada — falta ALANUBE_API_KEY en el servidor" },
        { status: 503 }
      );
    }

    // ── 5. Asignar el próximo e-NCF del rango autorizado por DGII ───────────
    const eNcf = await allocateNextENcf(db, companyId, eCfType);
    if (!eNcf) {
      return NextResponse.json(
        {
          error: `No hay rango de e-NCF cargado (o está agotado) para el tipo ${eCfType}. ` +
            "Configuralo en Configuración con el rango que te autorizó DGII.",
        },
        { status: 422 }
      );
    }

    // ── 6. Crear el borrador local ──────────────────────────────────────────
    const draft = buildInvoiceDraft({ company, eNcf, eCfType, sales });
    const draftRef = await invoicesCol.add({
      saleOrderId: saleOrderId ?? undefined,
      saleIds: sales.map((s) => s.id),
      eCfType,
      status: "borrador",
      eNcf,
      ...draft,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // ── 7. Enviar a Alanube ──────────────────────────────────────────────────
    try {
      const payload = buildAlanubePayload({ company, eNcf, eCfType, sales });
      const response = await alanubeCreateInvoice(alanubeConfig, payload, eCfType);
      await draftRef.update({
        status: "enviado",
        trackId: response.trackId ?? null,
        securityCode: response.securityCode ?? null,
        printUrl: response.printUrl ?? null,
        updatedAt: new Date(),
      });
      return NextResponse.json({ ok: true, invoiceId: draftRef.id, eNcf, response });
    } catch (e) {
      const message = e instanceof AlanubeError ? e.message : e instanceof Error ? e.message : "Error desconocido";
      await draftRef.update({ status: "error", errorMessage: message, updatedAt: new Date() });
      // Nota: el e-NCF ya se consumió del rango aunque el envío haya fallado.
      // Si DGII/Alanube confirma que no se puede reintentar con el mismo
      // número, este caso va a necesitar lógica de "liberar" el número — no
      // implementado todavía porque depende del comportamiento real de Alanube.
      return NextResponse.json({ error: message, invoiceId: draftRef.id }, { status: 502 });
    }
  } catch (e) {
    console.error("e-CF emit error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function allocateNextENcf(
  db: FirebaseFirestore.Firestore,
  companyId: string,
  eCfType: ECfType
): Promise<string | null> {
  const companyRef = db.collection("companies").doc(companyId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(companyRef);
    const sequences = snap.data()?.eCfSequences as Company["eCfSequences"] | undefined;
    const range = sequences?.[eCfType];
    if (!range || range.nextNumber > range.rangeEnd) return null;

    tx.update(companyRef, {
      [`eCfSequences.${eCfType}.nextNumber`]: range.nextNumber + 1,
    });
    return `E${eCfType}${String(range.nextNumber).padStart(10, "0")}`;
  });
}
