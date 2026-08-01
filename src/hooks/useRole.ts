"use client";

import { useAuth } from "@/contexts/AuthContext";
import { canEditModule, canViewModule, type ModuleKey } from "@/lib/permissions";
import type { Department } from "@/types";

export function useRole() {
  const { profile } = useAuth();
  const role: Department = profile?.role ?? "ventas";
  const workspaceId = profile?.workspaceId ?? profile?.id ?? "";

  return {
    role,
    workspaceId,
    isAdmin: role === "admin",
    isPlatformAdmin: profile?.platformAdmin === true,
    can(moduleKey: ModuleKey) {
      return {
        canEdit: canEditModule(role, moduleKey),
        canView: canViewModule(role, moduleKey),
      };
    },
  };
}
