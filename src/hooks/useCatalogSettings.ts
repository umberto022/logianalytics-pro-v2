"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { ensureCatalogSettings } from "@/lib/firestore/catalogSettings";
import type { CatalogSettings } from "@/types";

/** Crea la config inicial la primera vez (idempotente) y la mantiene en estado local — la página de configuración la edita directo con updateCatalogSettings + refetch. */
export function useCatalogSettings() {
  const { profile } = useAuth();
  const { workspaceId } = useRole();
  const [settings, setSettings] = useState<CatalogSettings | null>(null);
  const [loading, setLoading] = useState(true);

  async function refetch() {
    if (!workspaceId) return;
    setLoading(true);
    const s = await ensureCatalogSettings(workspaceId, profile?.companyName || profile?.fullName || "Mi catálogo");
    setSettings(s);
    setLoading(false);
  }

  useEffect(() => {
    if (workspaceId) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return { settings, loading, refetch };
}
