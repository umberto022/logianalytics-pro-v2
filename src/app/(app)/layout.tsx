"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, LogOut, Truck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { QuickSaleModal } from "@/components/ui/QuickSaleModal";
import { ShortcutsModal } from "@/components/ui/ShortcutsModal";
import { useStockNotifications } from "@/hooks/useStockNotifications";
import { useOverdueOrders } from "@/hooks/useOverdueOrders";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useStockNotifications();
  useOverdueOrders();
  const { user, loading, logout, profile } = useAuth();
  const router = useRouter();
  const [saleOpen,      setSaleOpen]      = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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
      {/* Sidebar — desktop only */}
      <Sidebar />

      <main
        className="flex-1 min-h-screen bg-slate-50 lg:ml-[var(--sidebar-width)]"
      >
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-sidebar border-b border-white/10 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
              <Truck size={14} className="text-white" />
            </div>
            <span className="text-white font-bold text-sm">LogiAnalytics</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-xs truncate max-w-[120px]">
              {profile?.fullName?.split(" ")[0] ?? ""}
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition"
            >
              <LogOut size={13} />
              Salir
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-5 lg:py-8 pb-24 lg:pb-8">
          {children}
        </div>
      </main>

      {/* FAB venta rápida — subido en móvil para no quedar detrás del BottomNav */}
      <button
        onClick={() => setSaleOpen(true)}
        title="Venta rápida (V)"
        className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 w-14 h-14 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center group animate-pulse-ring"
      >
        <Zap size={22} className="transition-transform group-hover:scale-110 duration-150" />
      </button>

      {/* Keyboard shortcuts */}
      <KeyboardShortcut
        onSale={() => setSaleOpen((v) => !v)}
        onShortcuts={() => setShortcutsOpen((v) => !v)}
      />
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}

      {/* Bottom navigation — mobile only */}
      <BottomNav />

      <QuickSaleModal
        isOpen={saleOpen}
        onClose={() => setSaleOpen(false)}
      />
    </div>
  );
}

function KeyboardShortcut({ onSale, onShortcuts }: { onSale: () => void; onShortcuts: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "v" || e.key === "V") onSale();
      if (e.key === "?") onShortcuts();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onSale, onShortcuts]);
  return null;
}
