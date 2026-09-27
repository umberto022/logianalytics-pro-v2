"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { CatalogView } from "@/components/catalog/CatalogView";
import type { PublicCatalogPayload } from "@/lib/catalogPublicPayload";

/**
 * Catálogo público — SIN autenticación, fuera del grupo (app) a propósito
 * (no pasa por el guard de AppLayout). Los datos vienen de una API route con
 * Admin SDK (ver /api/catalogo/[slug]) — este componente nunca toca
 * Firestore directo.
 */
export default function PublicCatalogPage({ params }: { params: { slug: string } }) {
  const [data, setData] = useState<PublicCatalogPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/catalogo/${params.slug}`, { cache: "no-store" })
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (!ok) { setError(json.error ?? "Catálogo no encontrado"); return; }
        setData(json);
      })
      .catch(() => { if (!cancelled) setError("No se pudo cargar el catálogo"); });
    return () => { cancelled = true; };
  }, [params.slug]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6 text-center">
        <div>
          <AlertCircle size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-pink-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <CatalogView data={data} mode="public" slug={params.slug} />;
}
