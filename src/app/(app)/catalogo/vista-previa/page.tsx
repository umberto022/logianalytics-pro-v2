"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CatalogView } from "@/components/catalog/CatalogView";
import type { PublicCatalogPayload } from "@/lib/catalogPublicPayload";

export default function CatalogPreviewPage() {
  const { user } = useAuth();
  const [data, setData] = useState<(PublicCatalogPayload & { enabled: boolean; publicSlug: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user.getIdToken().then((token) =>
      fetch(`/api/catalogo/preview?t=${Date.now()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
        .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
        .then(({ ok, json }) => {
          if (cancelled) return;
          if (!ok) { setError(json.error ?? "No se pudo cargar la vista previa"); return; }
          setData(json);
        })
    ).catch(() => { if (!cancelled) setError("No se pudo cargar la vista previa"); });
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white">
        <Link href="/catalogo" className="p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft size={18} />
        </Link>
        <p className="text-sm font-semibold text-slate-700">Vista previa de tu catálogo</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-8 text-center">
            <AlertCircle size={28} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        )}
        {!error && !data && (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-pink-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {data && <CatalogView data={data} mode="preview" slug={data.publicSlug} />}
      </div>
    </div>
  );
}
