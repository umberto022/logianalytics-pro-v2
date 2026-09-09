import { auth } from "@/lib/firebase";

export type CloudinaryFolder = "inventory-photos" | "receipt-photos" | "profile-photos";

/**
 * Sube un archivo a Cloudinary con firma del servidor (`/api/cloudinary-signature`).
 * Reemplaza el patrón anterior de "unsigned upload preset" (cloud name + preset
 * público en el bundle, cualquiera podía subir sin pasar por auth de la app).
 * Requiere sesión de Firebase activa — usado por los 3 pickers de foto de la
 * app (inventario, recepciones, perfil).
 */
export async function uploadToCloudinary(
  file: File | Blob,
  filename: string,
  folder: CloudinaryFolder
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("No autenticado");

  const idToken = await user.getIdToken();
  const sigRes = await fetch("/api/cloudinary-signature", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ folder }),
  });
  const sigData = await sigRes.json();
  if (!sigRes.ok) throw new Error(sigData?.error ?? "No se pudo firmar la subida");

  const form = new FormData();
  form.append("file", file, filename);
  form.append("api_key", sigData.apiKey);
  form.append("timestamp", String(sigData.timestamp));
  form.append("signature", sigData.signature);
  form.append("folder", sigData.folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sigData.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Cloudinary error:", data);
    throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
  }
  return data.secure_url as string;
}
