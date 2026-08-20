"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Package,
  ClipboardList, Users, MoreHorizontal,
  MapPin, TrendingUp, Settings, LogOut, X, Download, Store, CreditCard, ShieldAlert,
  PackageCheck, UsersRound, Receipt,
} from "lucide-react";
import { useStockAlerts } from "@/hooks/useStockAlerts";
import { useAuth } from "@/contexts/AuthContext";
import { useCaja } from "@/contexts/CajaContext";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useRole } from "@/hooks/useRole";
import type { ModuleKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const MAIN_NAV: { href: string; label: string; icon: typeof LayoutDashboard; badge: boolean; module: ModuleKey }[] = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard, badge: false, module: "dashboard" },
  { href: "/ventas",     label: "Ventas",     icon: ShoppingCart,    badge: false, module: "ventas" },
  { href: "/clientes",   label: "Clientes",   icon: Users,           badge: false, module: "clientes" },
  { href: "/compras",    label: "Compras",    icon: ClipboardList,   badge: false, module: "compras" },
  { href: "/inventario", label: "Inventario", icon: Package,         badge: true,  module: "inventario" },
];

const MORE_NAV: { href: string; label: string; icon: typeof LayoutDashboard; module: ModuleKey }[] = [
  { href: "/rutas",               label: "Rutas",           icon: MapPin,       module: "rutas" },
  { href: "/recepciones",         label: "Recepciones",     icon: PackageCheck, module: "recepciones" },
  { href: "/proveedores",         label: "Proveedores",     icon: Store,        module: "proveedores" },
  { href: "/cuentas-por-cobrar",  label: "Por cobrar",      icon: CreditCard,   module: "cuentasPorCobrar" },
  { href: "/facturacion-electronica", label: "Fact. electrónica", icon: Receipt, module: "facturacionElectronica" },
  { href: "/rentabilidad",        label: "Rentabilidad",    icon: TrendingUp,   module: "rentabilidad" },
  { href: "/configuracion",       label: "Configuración",   icon: Settings,     module: "configuracion" },
];

export function BottomNav() {
  const pathname      = usePathname();
  const criticalCount = useStockAlerts();
  const { logout }    = useAuth();
  const { canInstall, install } = usePWAInstall();
  const { isAdmin, isPlatformAdmin, can } = useRole();
  const { requestLogout }     = useCaja();
  const [moreOpen, setMoreOpen] = useState(false);
  const visibleMain = MAIN_NAV.filter((item) => can(item.module).canView);
  const visibleMore = MORE_NAV.filter((item) => can(item.module).canView);

  const moreActive = visibleMore.some(
    ({ href }) => pathname === href || pathname.startsWith(href + "/")
  );

  return (
    <>
      {/* ── Drawer overlay ── */}
      {moreOpen && (
        <>
          {/* Backdrop — tap fuera para cerrar */}
          <div
            className="fixed inset-0 z-[90] lg:hidden"
            onClick={() => setMoreOpen(false)}
          />

          {/* Drawer panel */}
          <div className="fixed inset-x-0 bottom-14 z-[100] lg:hidden bg-white rounded-t-2xl shadow-2xl border-t border-slate-100">
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-2">
              <span className="font-bold text-slate-800">Más opciones</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-1.5 rounded-xl bg-slate-100 active:bg-slate-200"
              >
                <X size={16} className="text-slate-500" />
              </button>
            </div>

            {/* Links */}
            <div className="px-4 pb-6 space-y-1">
              {visibleMore.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium",
                      active
                        ? "bg-brand-50 text-brand-600"
                        : "text-slate-700 active:bg-slate-100"
                    )}
                  >
                    <Icon size={20} />
                    {label}
                  </Link>
                );
              })}

              {canInstall && (
                <button
                  onClick={() => { install(); setMoreOpen(false); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm font-medium text-brand-600 active:bg-brand-50"
                >
                  <Download size={20} />
                  Instalar app en este dispositivo
                </button>
              )}

              {isAdmin && (
                <>
                  <div className="h-px bg-slate-100 my-1" />
                  <Link href="/equipo" onClick={() => setMoreOpen(false)}
                    className={cn("flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold",
                      pathname.startsWith("/equipo") ? "bg-brand-50 text-brand-600" : "text-brand-600 active:bg-brand-50")}>
                    <UsersRound size={20} /> Mi Equipo
                  </Link>
                </>
              )}

              {isPlatformAdmin && (
                <Link href="/admin" onClick={() => setMoreOpen(false)}
                  className={cn("flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold",
                    pathname.startsWith("/admin") ? "bg-amber-50 text-amber-600" : "text-amber-600 active:bg-amber-50")}>
                  <ShieldAlert size={20} /> Panel Admin
                </Link>
              )}

              <div className="h-px bg-slate-100 my-1" />

              <button
                onClick={() => { setMoreOpen(false); requestLogout(); }}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-sm font-semibold text-red-500 active:bg-red-50"
              >
                <LogOut size={20} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Bottom nav bar ── */}
      <nav className="fixed bottom-0 inset-x-0 z-[80] bg-sidebar border-t border-white/10 flex lg:hidden safe-area-bottom">
        {visibleMain.map(({ href, label, icon: Icon, badge }) => {
          const active    = pathname === href || pathname.startsWith(href + "/");
          const showBadge = badge && criticalCount > 0;

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative",
                active ? "text-brand-400" : "text-slate-500"
              )}
            >
              <span className="relative">
                <Icon size={20} />
                {showBadge && (
                  <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {criticalCount > 9 ? "9+" : criticalCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-none">{label}</span>
              {active && (
                <span className="absolute top-0 inset-x-0 h-0.5 bg-brand-400 rounded-b" />
              )}
            </Link>
          );
        })}

        {/* Más */}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative",
            moreOpen || moreActive ? "text-brand-400" : "text-slate-500"
          )}
        >
          <MoreHorizontal size={20} />
          <span className="text-[10px] font-medium leading-none">Más</span>
          {moreActive && (
            <span className="absolute top-0 inset-x-0 h-0.5 bg-brand-400 rounded-b" />
          )}
        </button>
      </nav>
    </>
  );
}
