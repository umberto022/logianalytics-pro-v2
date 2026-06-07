"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, TrendingUp, Package,
  Settings, LogOut, Truck, Building2, MapPin, ClipboardList, Zap, Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useStockAlerts } from "@/hooks/useStockAlerts";
import { usePlan } from "@/hooks/usePlan";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard, badge: null },
  { href: "/ventas",        label: "Ventas",        icon: ShoppingCart,    badge: null },
  { href: "/clientes",      label: "Clientes",      icon: Users,           badge: null },
  { href: "/rutas",         label: "Rutas",         icon: MapPin,          badge: null },
  { href: "/rentabilidad",  label: "Rentabilidad",  icon: TrendingUp,      badge: null },
  { href: "/compras",       label: "Compras",       icon: ClipboardList,   badge: null },
  { href: "/inventario",    label: "Inventario",    icon: Package,         badge: "stock" as const },
  { href: "/configuracion", label: "Configuración", icon: Settings,        badge: null },
];

export function Sidebar() {
  const pathname       = usePathname();
  const { profile, logout } = useAuth();
  const criticalCount  = useStockAlerts();
  const { isFree }     = usePlan();

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[var(--sidebar-width)] bg-sidebar text-slate-200 flex-col z-20">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-9 h-9 bg-brand-500 rounded-lg flex items-center justify-center shadow-md">
          <Truck size={20} className="text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-none">LogiAnalytics</p>
          <p className="text-slate-400 text-xs mt-0.5">Pro v2</p>
        </div>
      </div>

      {/* User */}
      <div className="px-5 py-4 border-b border-white/10">
        <p className="text-white font-semibold text-sm truncate">
          {profile?.fullName || "Usuario"}
        </p>
        {profile?.companyName && (
          <div className="flex items-center gap-1.5 mt-1">
            <Building2 size={12} className="text-slate-400 flex-shrink-0" />
            <p className="text-slate-400 text-xs truncate">{profile.companyName}</p>
          </div>
        )}
        <span className="inline-block mt-1.5 text-[10px] bg-brand-500/20 text-brand-300 rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide">
          {profile?.subscriptionPlan ?? "free"}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active    = pathname === href || pathname.startsWith(href + "/");
          const showBadge = badge === "stock" && criticalCount > 0;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-slate-400 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={18} className="flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {showBadge && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 animate-pulse">
                  {criticalCount > 9 ? "9+" : criticalCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Upgrade CTA for free users */}
      {isFree && (
        <div className="px-3 pb-3">
          <Link href="/precios"
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-semibold bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 transition-colors">
            <Zap size={15} className="text-yellow-400" />
            Upgrade a Pro
          </Link>
        </div>
      )}

      {/* Logout */}
      <div className="px-3 pb-4 border-t border-white/10 pt-4">
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
