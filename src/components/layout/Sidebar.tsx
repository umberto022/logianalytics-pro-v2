"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, TrendingUp, Package,
  Settings, LogOut, Truck, Building2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard },
  { href: "/ventas",        label: "Ventas",        icon: ShoppingCart },
  { href: "/rentabilidad",  label: "Rentabilidad",  icon: TrendingUp },
  { href: "/inventario",    label: "Inventario",    icon: Package },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, logout } = useAuth();

  return (
    <aside className="fixed inset-y-0 left-0 w-[var(--sidebar-width)] bg-sidebar text-slate-200 flex flex-col z-20">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-9 h-9 bg-brand-500 rounded-lg flex items-center justify-center">
          <Truck size={20} className="text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-none">LogiAnalytics</p>
          <p className="text-slate-400 text-xs mt-0.5">Pro</p>
        </div>
      </div>

      {/* User */}
      <div className="px-5 py-4 border-b border-white/10">
        <p className="text-white font-medium text-sm truncate">
          {profile?.fullName || "Usuario"}
        </p>
        {profile?.companyName && (
          <div className="flex items-center gap-1.5 mt-1">
            <Building2 size={12} className="text-slate-400" />
            <p className="text-slate-400 text-xs truncate">{profile.companyName}</p>
          </div>
        )}
        <span className="inline-block mt-1.5 text-[10px] bg-brand-500/20 text-brand-300 rounded-full px-2 py-0.5 font-medium uppercase tracking-wide">
          {profile?.subscriptionPlan ?? "free"}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-brand-500 text-white"
                  : "text-slate-400 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={18} />
              {label}
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
