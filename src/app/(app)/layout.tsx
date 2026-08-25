"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Zap, LogOut, Truck, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { moduleForPath } from "@/lib/permissions";
import { CajaProvider, useCaja } from "@/contexts/CajaContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { QuickSaleModal } from "@/components/ui/QuickSaleModal";
import { ShortcutsModal } from "@/components/ui/ShortcutsModal";
import { OnboardingWizard } from "@/components/ui/OnboardingWizard";
import { FeedbackButton } from "@/components/ui/FeedbackButton";
import { AperturaCajaModal } from "@/components/ui/AperturaCajaModal";
import { CajaAbiertaModal } from "@/components/ui/CajaAbiertaModal";
import { useStockNotifications } from "@/hooks/useStockNotifications";
import { useRawMaterialNotifications } from "@/hooks/useRawMaterialNotifications";
import { useOverdueOrders } from "@/hooks/useOverdueOrders";
import { CONTACT_EMAIL } from "@/lib/legal";
import type { WorkspaceStatus } from "@/types";

const BLOCKED_COPY: Record<Exclude<WorkspaceStatus, "active">, { title: string; desc: string }> = {
  pending:   { title: "Tu cuenta está pendiente de aprobación",  desc: "Te avisamos apenas quede lista. Si tenés dudas mientras tanto, escribinos." },
  suspended: { title: "Tu acceso fue suspendido",                 desc: "Escribinos para resolverlo y reactivar tu cuenta." },
  cancelled: { title: "Esta cuenta fue cancelada",                 desc: "Si creés que es un error, escribinos y lo revisamos." },
};

function BlockedScreen({ status }: { status: Exclude<WorkspaceStatus, "active"> }) {
  const { logout } = useAuth();
  const copy = BLOCKED_COPY[status];
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
      <div className="max-w-sm w-full text-center bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-sm p-8">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center">
          <Truck size={22} className="text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">{copy.title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{copy.desc}</p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-flex items-center justify-center gap-2 w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-xl transition mb-3"
        >
          <Mail size={16} /> Escribinos a {CONTACT_EMAIL}
        </a>
        <button
          onClick={logout}
          className="text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, workspaceStatus } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Cargando…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // Corta acá, ANTES de montar CajaProvider/AppLayoutInner — esos componentes
  // abren listeners de Firestore (onSnapshot) apenas se montan, y no tiene
  // sentido dejar que lo intenten para una cuenta que firestore.rules va a
  // rechazar de todos modos. La protección real sigue siendo las reglas, esto
  // es solo para no mostrar la app ni gastar lecturas que van a fallar.
  if (workspaceStatus && workspaceStatus !== "active") {
    return <BlockedScreen status={workspaceStatus} />;
  }

  return (
    <CajaProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </CajaProvider>
  );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  useStockNotifications();
  useRawMaterialNotifications();
  useOverdueOrders();
  const { profile } = useAuth();
  const { can } = useRole();
  const { session, loading: cajaLoading, needsCierre, requestLogout } = useCaja();
  const router = useRouter();
  const pathname = usePathname();
  const [saleOpen,      setSaleOpen]      = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [skipApertura,  setSkipApertura]  = useState(false);

  useEffect(() => {
    const moduleKey = moduleForPath(pathname);
    if (moduleKey && !can(moduleKey).canView) router.replace("/dashboard");
  }, [pathname, can, router]);

  const canSell = can("ventas").canEdit;
  const canUseCaja = can("caja").canView;

  // Show apertura modal if no open session today (and user hasn't skipped)
  const showApertura = canUseCaja && !cajaLoading && !session && !skipApertura;

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 min-h-screen bg-slate-50 dark:bg-slate-900 lg:ml-[var(--sidebar-width)]">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-sidebar border-b border-white/10 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
              <Truck size={14} className="text-white" />
            </div>
            <span className="text-white font-bold text-sm">LogiAnalytics</span>
          </div>
          <div className="flex items-center gap-3">
            {session && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                Caja abierta
              </span>
            )}
            <span className="text-slate-400 text-xs truncate max-w-[120px]">
              {profile?.fullName?.split(" ")[0] ?? ""}
            </span>
            <button
              onClick={requestLogout}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition"
            >
              <LogOut size={13} />
              Salir
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-6 lg:py-8 pb-24 lg:pb-8">
          {children}
        </div>
      </main>

      {/* FAB venta rápida */}
      {canSell && (
        <button
          onClick={() => setSaleOpen(true)}
          title="Venta rápida (V)"
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 w-14 h-14 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center group animate-pulse-ring"
        >
          <Zap size={22} className="transition-transform group-hover:scale-110 duration-150" />
        </button>
      )}

      <KeyboardShortcut
        onSale={() => canSell && setSaleOpen((v) => !v)}
        onShortcuts={() => setShortcutsOpen((v) => !v)}
      />
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}

      <BottomNav />

      {canSell && <QuickSaleModal isOpen={saleOpen} onClose={() => setSaleOpen(false)} />}
      <FeedbackButton />

      {profile && !profile.onboardingCompleted && (
        <OnboardingWizard onDone={() => {}} />
      )}

      {/* Apertura de caja — shown automatically if no open session */}
      {showApertura && (
        <AperturaCajaModal onSkip={() => setSkipApertura(true)} />
      )}

      {/* Cierre obligatorio antes de logout */}
      {needsCierre && <CajaAbiertaModal />}
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
