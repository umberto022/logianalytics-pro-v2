/**
 * "Quién usó este dispositivo" — lista local (por navegador, no por Firestore)
 * de las últimas cuentas que iniciaron sesión en este equipo, para mostrar un
 * selector rápido de cuenta en /login (como el account switcher de Facebook/Google).
 *
 * IMPORTANTE: nunca guardar contraseñas ni tokens acá. Solo datos de perfil no
 * sensibles (uid, email, nombre, foto, proveedor) — lo mismo que ya es visible
 * en la UI logueada. Re-seleccionar una cuenta de tipo "password" solo precarga
 * el email; sigue pidiendo la contraseña.
 */

import type { Department } from "@/types";

const STORAGE_KEY = "logi_recent_accounts";
const MAX_ACCOUNTS = 5;

export interface RecentAccount {
  uid: string;
  email: string;
  fullName: string;
  photoURL?: string;
  provider: "password" | "google.com";
  /** Departamento al momento del último login — solo para mostrar un badge; no gatea permisos (eso lo hacen las Firestore rules). */
  role?: Department;
  /** epoch ms del último login exitoso — define el orden del selector. */
  lastLogin: number;
}

export function getRecentAccounts(): RecentAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return []; // modo privado / localStorage no disponible / JSON corrupto
  }
}

export function saveRecentAccount(account: Omit<RecentAccount, "lastLogin">): void {
  try {
    const existing = getRecentAccounts().filter((a) => a.uid !== account.uid);
    const next = [{ ...account, lastLogin: Date.now() }, ...existing].slice(0, MAX_ACCOUNTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode — no pasa nada, simplemente no se recuerda la cuenta */
  }
}

export function removeRecentAccount(uid: string): void {
  try {
    const next = getRecentAccounts().filter((a) => a.uid !== uid);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}
