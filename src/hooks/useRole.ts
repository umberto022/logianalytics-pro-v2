"use client";

import { useAuth } from "@/contexts/AuthContext";

export function useRole() {
  const { profile } = useAuth();
  const role = profile?.role ?? "user";
  return {
    role,
    isAdmin: role === "admin",
    isUser:  role === "user",
  };
}
