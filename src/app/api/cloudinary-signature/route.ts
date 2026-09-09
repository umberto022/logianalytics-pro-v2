import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

// Whitelist explícita de carpetas firmables — nunca se acepta un folder libre
// mandado por el cliente, para que nadie pueda firmar una subida hacia una
// carpeta ajena/arbitraria de la cuenta de Cloudinary.
const ALLOWED_FOLDERS = ["inventory-photos", "receipt-photos", "profile-photos"] as const;
type AllowedFolder = (typeof ALLOWED_FOLDERS)[number];

// Firma subidas a Cloudinary del lado servidor con el API secret (nunca llega
// al cliente) — reemplaza el "unsigned upload preset" anterior. Antes, el
// cloud name + preset eran públicos en el bundle (NEXT_PUBLIC_*) y cualquiera
// con devtools podía extraerlos y subir archivos arbitrarios directo a la
// cuenta de Cloudinary sin pasar por ningún login de la app. Ahora hace falta
// una sesión de Firebase válida para siquiera obtener una firma, y cada firma
// vale una sola subida a una carpeta de la whitelist.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!apiKey || !apiSecret || !cloudName) {
    console.error("cloudinary-signature: faltan CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET/NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
    return NextResponse.json({ error: "Cloudinary no está configurado en el servidor" }, { status: 500 });
  }

  try {
    await getAdminAuth().verifyIdToken(token);

    const { folder } = (await req.json()) as { folder?: string };
    if (!ALLOWED_FOLDERS.includes(folder as AllowedFolder)) {
      return NextResponse.json({ error: "Carpeta inválida" }, { status: 400 });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    // Fórmula de Cloudinary: sha1("param1=valor1&param2=valor2..." + api_secret),
    // con los params a firmar ordenados alfabéticamente — api_key, file y
    // cloud_name NUNCA van dentro del string firmado.
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto.createHash("sha1").update(paramsToSign + apiSecret).digest("hex");

    return NextResponse.json({ signature, timestamp, apiKey, cloudName, folder });
  } catch (e) {
    console.error("cloudinary-signature error:", e);
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
}
