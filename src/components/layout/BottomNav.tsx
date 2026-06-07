"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Package,
  ClipboardList, Users,
} from "lucide-react";
import { useStockAlerts } from "@/hooks/useStockAlerts";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/ventas",     label: "Ventas",     icon: ShoppingCart },
  { href: "/clientes",   label: "Clientes",   icon: Users,        badge: false },
  { href: "/compras",    label: "Compras",    icon: ClipboardList, badge: false },
  { href: "/inventario", label: "Inventario", icon: Package,       badge: true  },
];

export function BottomNav() {
  const pathname      = usePathname();
  const criticalCount = useStockAlerts();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-sidebar border-t border-white/10 flex lg:hidden safe-area-bottom">
      {NAV.map(({ href, label, icon: Icon, badge }) => {
        const active    = pathname === href || pathname.startsWith(href + "/");
        const showBadge = badge && criticalCount > 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative transition-colors",
              active ? "text-brand-400" : "text-slate-500"
            )}
          >
            <span className="relative">
              <Icon size={20} />
              {showBadge && (
                <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 animate-pulse">
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
    </nav>
  );
}
