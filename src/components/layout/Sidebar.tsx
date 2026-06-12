"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, TrendingUp, Package,
  Settings, LogOut, Truck, Building2, MapPin, ClipboardList,
  Users, Sun, Moon, Store, CreditCard,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useStockAlerts } from "@/hooks/useStockAlerts";
import { useTheme } from "@/hooks/useTheme";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard, badge: null         },
  { href: "/ventas",        label: "Ventas",        icon: ShoppingCart,    badge: null         },
  { href: "/clientes",      label: "Clientes",      icon: Users,           badge: null         },
  { href: "/cuentas-por-cobrar", label: "Por cobrar", icon: CreditCard,     badge: null         },
  { href: "/rutas",         label: "Rutas",         icon: MapPin,          badge: null         },
  { href: "/rentabilidad",  label: "Rentabilidad",  icon: TrendingUp,      badge: null         },
  { href: "/compras",       label: "Compras",       icon: ClipboardList,   badge: null         },
  { href: "/proveedores",   label: "Proveedores",   icon: Store,           badge: null         },
  { href: "/inventario",    label: "Inventario",    icon: Package,         badge: "stock" as const },
  { href: "/configuracion", label: "Configuración", icon: Settings,        badge: null         },
];

export function Sidebar() {
  const pathname            = usePathname();
  const { profile, logout } = useAuth();
  const criticalCount       = useStockAlerts();
  const { isDark, toggle }  = useTheme();
  const { isAdmin }         = useRole();

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[var(--sidebar-width)] bg-sidebar text-slate-200 flex-col z-20">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-9 h-9 bg-brand-500 rounded-lg flex items-center justify-center shadow-md">
          <Truck size={20} className="text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-none">LogiAnalytics</p>
          <p className="text-slate-400 text-xs mt-0.5">Gestión logística</p>
        </div>
        <button
          onClick={toggle}
          title={isDark ? "Modo claro" : "Modo oscuro"}
          className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>

      {/* User */}
      <div className="px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <p className="text-white font-semibold text-sm truncate flex-1">
            {profile?.fullName || "Usuario"}
          </p>
          {isAdmin && (
            <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-500/30 text-brand-300 border border-brand-500/40">
              Admin
            </span>
          )}
        </div>
        {profile?.companyName && (
          <div className="flex items-center gap-1.5 mt-1">
            <Building2 size={12} className="text-slate-400 flex-shrink-0" />
            <p className="text-slate-400 text-xs truncate">{profile.companyName}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active    = pathname === href || pathname.startsWith(href + "/");
          const showBadge = badge === "stock" && criticalCount > 0;

          return (
            <Link key={href} href={href}
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
