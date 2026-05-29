"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { QuickSaleModal } from "@/components/ui/QuickSaleModal";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [saleOpen, setSaleOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Cargando…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className="flex-1 min-h-screen bg-slate-50"
        style={{ marginLeft: "var(--sidebar-width)" }}
      >
        <div className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>

      {/* Floating Action Button */}
      <button
        onClick={() => setSaleOpen(true)}
        title="Venta rápida (V)"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center group animate-pulse-ring"
      >
        <Zap size={22} className="transition-transform group-hover:scale-110 duration-150" />
      </button>

      {/* Keyboard shortcut: V opens quick sale */}
      <KeyboardShortcut onTrigger={() => setSaleOpen((v) => !v)} />

      <QuickSaleModal
        isOpen={saleOpen}
        onClose={() => setSaleOpen(false)}
      />
    </div>
  );
}

function KeyboardShortcut({ onTrigger }: { onTrigger: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "v" || e.key === "V") onTrigger();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onTrigger]);
  return null;
}
