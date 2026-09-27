import { doc, getDoc, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CatalogSettings } from "@/types";
import { toCents } from "@/lib/money";

const settingsDoc = (uid: string) => doc(db, "catalogSettings", uid);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

/** Sufijo aleatorio corto para que el slug público sea único en la práctica sin necesitar una consulta de unicidad. */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

export async function getCatalogSettings(uid: string): Promise<CatalogSettings | null> {
  const snap = await getDoc(settingsDoc(uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CatalogSettings;
}

/** Crea la config inicial la primera vez que alguien entra a "Mi catálogo" — valores provisionales confirmados, WhatsApp/dirección vacíos (no se inventan), enabled:false hasta publicar. */
export async function ensureCatalogSettings(uid: string, businessName: string): Promise<CatalogSettings> {
  const existing = await getCatalogSettings(uid);
  if (existing) return existing;

  const now = Timestamp.now();
  const data: Omit<CatalogSettings, "id"> = {
    businessName,
    colors: { primary: "#EC4899", accent: "#C084FC" }, // rosado/lila-fucsia pastel, pedido de Stefany
    whatsappNumber: "",
    pickup: { enabled: true, address: "" },
    delivery: { enabled: true, zones: ["Santo Domingo Oeste", "Distrito Nacional"] },
    publicSlug: `${slugify(businessName) || "catalogo"}-${randomSuffix()}`,
    enabled: false,
    discountRule: { minQty: 4, pct: 20, appliesToShipping: false },
    advanceRule: {
      pct: 50,
      largeOrderThresholdCents: toCents(2000),
      thresholdAfterDiscountExcludingShipping: true,
    },
    leadTimeNote: "Desde 3 días, sujeto a confirmación según el producto",
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(settingsDoc(uid), data);
  return { id: uid, ...data };
}

export async function updateCatalogSettings(
  uid: string,
  data: Partial<Omit<CatalogSettings, "id" | "createdAt">>
): Promise<{ ok: boolean; message: string }> {
  try {
    await updateDoc(settingsDoc(uid), { ...data, updatedAt: Timestamp.now() });
    return { ok: true, message: "Configuración guardada" };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}
