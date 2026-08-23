"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, TrendingUp, Package,
  Settings, LogOut, Truck, Building2, MapPin, ClipboardList,
  Users, Sun, Moon, Store, CreditCard, ShieldAlert, PackageCheck, UsersRound, Receipt,
  Layers,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCaja } from "@/contexts/CajaContext";
import { useStockAlerts } from "@/hooks/useStockAlerts";
import { useRawMaterialAlerts } from "@/hooks/useRawMaterialAlerts";
import { useTheme } from "@/hooks/useTheme";
import { useRole } from "@/hooks/useRole";
import type { ModuleKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: typeof LayoutDashboard; badge: "stock" | "insumos" | null; module: ModuleKey }[] = [
  { href: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard, badge: null,             module: "dashboard" },
  { href: "/ventas",        label: "Ventas",        icon: ShoppingCart,    badge: null,             module: "ventas" },
  { href: "/clientes",      label: "Clientes",      icon: Users,           badge: null,             module: "clientes" },
  { href: "/cuentas-por-cobrar", label: "Por cobrar", icon: CreditCard,     badge: null,             module: "cuentasPorCobrar" },
  { href: "/facturacion-electronica", label: "Fact. electrónica", icon: Receipt, badge: null,        module: "facturacionElectronica" },
  { href: "/rutas",         label: "Rutas",         icon: MapPin,          badge: null,             module: "rutas" },
  { href: "/rentabilidad",  label: "Rentabilidad",  icon: TrendingUp,      badge: null,             module: "rentabilidad" },
  { href: "/compras",       label: "Compras",       icon: ClipboardList,   badge: null,             module: "compras" },
  { href: "/recepciones",   label: "Recepciones",   icon: PackageCheck,    badge: null,             module: "recepciones" },
  { href: "/proveedores",   label: "Proveedores",   icon: Store,           badge: null,             module: "proveedores" },
  { href: "/inventario",    label: "Inventario",    icon: Package,         badge: "stock" as const, module: "inventario" },
  { href: "/insumos",       label: "Insumos",       icon: Layers,          badge: "insumos" as const, module: "insumos" },
  { href: "/configuracion", label: "Configuración", icon: Settings,        badge: null,             module: "configuracion" },
];

export function Sidebar() {
  const pathname               = usePathname();
  const { profile }            = useAuth();
  const { requestLogout, session } = useCaja();
  const criticalCount          = useStockAlerts();
  const rawCriticalCount       = useRawMaterialAlerts();
  const { isDark, toggle }     = useTheme();
  const { isAdmin, isPlatformAdmin, can } = useRole();
  const visibleNav = NAV.filter((item) => can(item.module).canView);

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[var(--sidebar-width)] bg-sidebar text-slate-200 flex-col z-20">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-9 h-9 bg-brand-500 rounded-lg flex items-center justify-center shadow-md">
          <Truck size={20} className="text-white" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-white font-bold text-sm leading-none">LogiAnalytics</p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 leading-none">BETA</span>
          </div>
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
        {session && (
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-emerald-400 text-xs font-medium">Caja abierta</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map(({ href, label, icon: Icon, badge }) => {
          const active     = pathname === href || pathname.startsWith(href + "/");
          const badgeCount = badge === "stock" ? criticalCount : badge === "insumos" ? rawCriticalCount : 0;
          const showBadge  = badgeCount > 0;

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
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Equipo / Admin links */}
      {(isAdmin || isPlatformAdmin) && (
        <div className="px-3 pb-2 border-t border-white/10 pt-3 space-y-0.5">
          {isAdmin && (
            <Link href="/equipo"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                pathname.startsWith("/equipo")
                  ? "bg-brand-500/20 text-brand-300"
                  : "text-slate-500 hover:bg-white/10 hover:text-brand-300"
              )}
            >
              <UsersRound size={15} className="flex-shrink-0" />
              Mi Equipo
            </Link>
          )}
          {isPlatformAdmin && (
            <Link href="/admin"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-amber-500/20 text-amber-300"
                  : "text-slate-500 hover:bg-white/10 hover:text-amber-300"
              )}
            >
              <ShieldAlert size={15} className="flex-shrink-0" />
              Panel Admin
            </Link>
          )}
        </div>
      )}

      {/* Logout */}
      <div className="px-3 pb-4 border-t border-white/10 pt-4">
        <button
          onClick={requestLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
