"use client";

import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import {
  getOpenSession, openCajaSession, closeCajaSession,
  type CajaSession, type CierreData,
} from "@/lib/firestore/caja";

interface CajaCtx {
  session:        CajaSession | null;
  loading:        boolean;
  cajaOpen:       boolean;
  openCaja:       (initialCash: number) => Promise<void>;
  closeCaja:      (data: CierreData) => Promise<void>;
  reload:         () => Promise<void>;
  // Logout guard
  needsCierre:    boolean;
  requestLogout:  () => void;   // call instead of logout()
  cancelLogout:   () => void;   // cancel cierre modal
  confirmLogout:  () => void;   // after cierre done → proceed with logout
}

const DEFAULT_CTX: CajaCtx = {
  session: null, loading: false, cajaOpen: false,
  openCaja: async () => {}, closeCaja: async () => {}, reload: async () => {},
  needsCierre: false,
  requestLogout: () => {}, cancelLogout: () => {}, confirmLogout: () => {},
};

const Ctx = createContext<CajaCtx>(DEFAULT_CTX);


export function CajaProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { workspaceId, can } = useRole();
  const cajaEnabled = can("caja").canView;
  const [session,      setSession]      = useState<CajaSession | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [needsCierre,  setNeedsCierre]  = useState(false);

  const reload = useCallback(async () => {
    if (!user || !cajaEnabled) { setSession(null); setLoading(false); return; }
    setLoading(true);
    try { setSession(await getOpenSession(workspaceId)); }
    catch { setSession(null); }
    finally { setLoading(false); }
  }, [user, cajaEnabled, workspaceId]);

  useEffect(() => { reload(); }, [reload]);

  async function openCaja(initialCash: number) {
    if (!user || !cajaEnabled) return;
    const s = await openCajaSession(workspaceId, initialCash);
    setSession(s);
  }

  async function closeCaja(data: CierreData) {
    if (!user || !session) return;
    await closeCajaSession(workspaceId, session.id, data);
    setSession(null);
  }

  function requestLogout() {
    if (session) { setNeedsCierre(true); }
    else { logout(); }
  }

  function cancelLogout() { setNeedsCierre(false); }

  function confirmLogout() {
    setNeedsCierre(false);
    logout();
  }

  return (
    <Ctx.Provider value={{
      session, loading, cajaOpen: !!session,
      openCaja, closeCaja, reload,
      needsCierre, requestLogout, cancelLogout, confirmLogout,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCaja(): CajaCtx {
  return useContext(Ctx);
}
