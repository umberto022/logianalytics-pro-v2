"use client";

import { Download } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export function LandingInstallButtonHeader() {
  const { canInstall, install } = usePWAInstall();
  if (!canInstall) return null;
  return (
    <button
      onClick={install}
      className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-brand-600 border border-brand-200 px-3 py-2 rounded-lg hover:bg-brand-50 transition"
    >
      <Download size={15} /> Instalar
    </button>
  );
}

export function LandingInstallButtonHero() {
  const { canInstall, install } = usePWAInstall();
  if (!canInstall) return null;
  return (
    <button
      onClick={install}
      className="mt-4 inline-flex items-center gap-2 text-sm text-brand-600 font-semibold border border-brand-200 bg-brand-50 px-5 py-2.5 rounded-xl hover:bg-brand-100 transition mx-auto"
    >
      <Download size={16} /> Instalar app en mi dispositivo
    </button>
  );
}
