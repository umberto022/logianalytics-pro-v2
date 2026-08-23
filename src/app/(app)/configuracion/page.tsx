"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { updatePassword, type User } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { updateUserProfile } from "@/lib/firestore/users";
import { createCompany, getCompany, updateCompany } from "@/lib/firestore/companies";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { PageHeader } from "@/components/ui/PageHeader";
import { INDUSTRIES, COUNTRIES, ECF_TYPE_LABELS, type Company, type TaxpayerType, type ECfType } from "@/types";
import { CheckCircle2, Bell, BellOff, Camera, User as UserIcon, History, ShieldCheck, Mail, Send, Receipt } from "lucide-react";
import { listAuditLog, type AuditEntry, type AuditAction } from "@/lib/firestore/auditLog";
import {
  isPushEnabled,
  setPushEnabled,
  requestNotificationPermission,
} from "@/lib/notifications";
import { registerFcmToken, unregisterFcmToken, getCurrentFcmToken } from "@/lib/fcm";

const ACTION_LABELS: Record<AuditAction, string> = {
  inventory_add:    "Producto agregado",
  inventory_update: "Producto actualizado",
  inventory_delete: "Producto eliminado",
  stock_adjust:     "Ajuste de stock",
  purchase_create:  "Orden creada",
  purchase_update:  "Orden actualizada",
  purchase_receive: "Orden recibida",
  purchase_delete:  "Orden eliminada",
  sale_register:    "Venta registrada",
  customer_add:     "Cliente agregado",
  customer_update:  "Cliente actualizado",
  customer_delete:  "Cliente eliminado",
  supplier_add:     "Proveedor agregado",
  supplier_update:  "Proveedor actualizado",
  supplier_delete:  "Proveedor eliminado",
  raw_material_add:          "Insumo agregado",
  raw_material_update:       "Insumo actualizado",
  raw_material_delete:       "Insumo eliminado",
  raw_material_stock_adjust: "Ajuste de stock de insumo",
  production_register:       "Producción registrada",
};

const ACTION_COLOR: Record<AuditAction, string> = {
  inventory_add: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  inventory_update: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  inventory_delete: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  stock_adjust: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  purchase_create: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  purchase_update: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  purchase_receive: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  purchase_delete: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  sale_register: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  customer_add: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  customer_update: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  customer_delete: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  supplier_add: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  supplier_update: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  supplier_delete: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  raw_material_add: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  raw_material_update: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  raw_material_delete: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  raw_material_stock_adjust: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  production_register: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
};

export default function ConfiguracionPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { workspaceId, isAdmin } = useRole();
  const [company, setCompany] = useState<Company | null>(null);
  const [auditLog,     setAuditLog]     = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditDays,    setAuditDays]    = useState(7);
  const [pushEnabled, setPushEnabledState] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [sendingReport, setSendingReport] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const enabled = isPushEnabled();
      setPushEnabledState(enabled);
      if ("Notification" in window) setPushPermission(Notification.permission);
      // Backfill: gente que ya tenía notificaciones activadas antes de que existiera el push
      // real (FCM) nunca registró un token — de(re)gistrarlo es gratis si ya existe.
      if (enabled && Notification.permission === "granted" && user) registerFcmToken(user.uid);
    }
  }, [user]);

  async function sendTestReport() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setSendingReport(true);
    try {
      const token = await currentUser.getIdToken();
      const res   = await fetch("/api/send-test-report", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Reporte enviado a ${data.email}`);
      } else {
        toast.error(`Error: ${data.error ?? "Intenta de nuevo"}`);
      }
    } catch {
      toast.error("Error al enviar el reporte");
    } finally {
      setSendingReport(false);
    }
  }

  async function togglePush() {
    if (!pushEnabled) {
      const permission = await requestNotificationPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        toast.error("Permite las notificaciones en tu navegador para activar esta función.");
        return;
      }
      setPushEnabled(true);
      setPushEnabledState(true);
      toast.success("Notificaciones de stock crítico activadas");
      // Best-effort: registra este dispositivo para recibir el push real (FCM) aunque la
      // pestaña esté cerrada. Si el navegador no soporta Push API, sigue funcionando con la
      // notificación local instantánea de siempre — no bloquea el toggle.
      if (user) registerFcmToken(user.uid);
    } else {
      setPushEnabled(false);
      setPushEnabledState(false);
      toast("Notificaciones desactivadas", { icon: "🔕" });
      if (user) {
        const token = await getCurrentFcmToken();
        if (token) unregisterFcmToken(user.uid, token);
      }
    }
  }

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingProfile,  setSavingProfile]  = useState(false);
  const [savingCompany,  setSavingCompany]  = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savedProfile,   setSavedProfile]   = useState(false);
  const [savedCompany,   setSavedCompany]   = useState(false);
  const [savedPassword,  setSavedPassword]  = useState(false);

  const [prof, setProf] = useState({ fullName: "", phone: "" });
  const [comp, setComp] = useState<{
    name: string; rif: string; address: string; phone: string; email: string;
    industry: string; country: string;
  }>({
    name: "", rif: "", address: "", phone: "", email: "", industry: INDUSTRIES[0], country: COUNTRIES[0],
  });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  const [savingECf, setSavingECf] = useState(false);
  const [savedECf,  setSavedECf]  = useState(false);
  const [eCf, setECf] = useState<{
    taxpayerType: TaxpayerType | "";
    eCfEnvironment: "sandbox" | "production";
    alanubeCompanyId: string;
    sequences: Record<Extract<ECfType, "31" | "32">, { nextNumber: string; rangeEnd: string }>;
  }>({
    taxpayerType: "",
    eCfEnvironment: "sandbox",
    alanubeCompanyId: "",
    sequences: { "31": { nextNumber: "", rangeEnd: "" }, "32": { nextNumber: "", rangeEnd: "" } },
  });

  useEffect(() => {
    if (profile) setProf({ fullName: profile.fullName, phone: profile.phone });
  }, [profile]);

  useEffect(() => {
    if (profile?.companyId) {
      getCompany(profile.companyId).then((c) => {
        if (c) {
          setCompany(c);
          setComp({ name: c.name, rif: c.rif, address: c.address, phone: c.phone, email: c.email, industry: c.industry, country: c.country });
          setECf({
            taxpayerType: c.taxpayerType ?? "",
            eCfEnvironment: c.eCfEnvironment ?? "sandbox",
            alanubeCompanyId: c.alanubeCompanyId ?? "",
            sequences: {
              "31": {
                nextNumber: c.eCfSequences?.["31"]?.nextNumber?.toString() ?? "",
                rangeEnd:   c.eCfSequences?.["31"]?.rangeEnd?.toString()   ?? "",
              },
              "32": {
                nextNumber: c.eCfSequences?.["32"]?.nextNumber?.toString() ?? "",
                rangeEnd:   c.eCfSequences?.["32"]?.rangeEnd?.toString()   ?? "",
              },
            },
          });
        }
      });
    }
  }, [profile]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    setAuditLoading(true);
    listAuditLog(workspaceId, auditDays).then((entries) => {
      setAuditLog(entries);
      setAuditLoading(false);
    });
  }, [user, auditDays]);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
      fd.append("folder", "profile-photos");
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: fd }
      );
      const data = await res.json();
      if (data.secure_url) {
        await updateUserProfile(user.uid, { photoURL: data.secure_url });
        await refreshProfile();
        toast.success("Foto actualizada");
      } else {
        toast.error("Error al subir la foto");
      }
    } catch {
      toast.error("Error al subir la foto");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }

  function flashSaved(setter: (v: boolean) => void) {
    setter(true);
    setTimeout(() => setter(false), 3000);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    await updateUserProfile(user.uid, { fullName: prof.fullName, phone: prof.phone });
    await refreshProfile();
    flashSaved(setSavedProfile);
    setSavingProfile(false);
  }

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingCompany(true);
    if (company) {
      await updateCompany(company.id, comp);
      flashSaved(setSavedCompany);
    } else {
      const r = await createCompany(user.uid, comp);
      if (r.ok) {
        await updateUserProfile(user.uid, { companyId: r.id, companyName: comp.name });
        await refreshProfile();
        flashSaved(setSavedCompany);
      } else {
        toast.error(r.message);
      }
    }
    setSavingCompany(false);
  }

  async function saveECf(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSavingECf(true);
    try {
      const sequences: Company["eCfSequences"] = {};
      for (const type of ["31", "32"] as const) {
        const { nextNumber, rangeEnd } = eCf.sequences[type];
        if (nextNumber !== "" && rangeEnd !== "") {
          sequences[type] = { nextNumber: Number(nextNumber), rangeEnd: Number(rangeEnd) };
        }
      }
      await updateCompany(company.id, {
        taxpayerType: eCf.taxpayerType || undefined,
        eCfEnvironment: eCf.eCfEnvironment,
        alanubeCompanyId: eCf.alanubeCompanyId || undefined,
        eCfSequences: sequences,
      });
      flashSaved(setSavedECf);
    } catch {
      toast.error("Error al guardar la configuración de facturación electrónica");
    }
    setSavingECf(false);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next !== pw.confirm) { toast.error("Las contraseñas no coinciden"); return; }
    if (pw.next.length < 6)     { toast.error("Mínimo 6 caracteres"); return; }
    setSavingPassword(true);
    try {
      await updatePassword(auth.currentUser as User, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      flashSaved(setSavedPassword);
    } catch {
      toast.error("Re-inicia sesión para cambiar la contraseña");
    }
    setSavingPassword(false);
  }

  const inputCls = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400";
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Administra tu perfil y empresa" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Profile */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-700 dark:text-slate-100 mb-5">Perfil de usuario</h2>

          {/* Avatar */}
          <div className="flex items-center gap-4 mb-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700 flex items-center justify-center border-2 border-slate-200 dark:border-slate-600">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="Foto de perfil" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={28} className="text-slate-400 dark:text-slate-500" />
                )}
              </div>
              <label className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center cursor-pointer hover:bg-brand-700 transition shadow-sm ${uploadingPhoto ? "opacity-50 pointer-events-none" : ""}`}>
                {uploadingPhoto
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera size={13} />
                }
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
              </label>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{profile?.fullName || "Sin nombre"}</p>
              <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">Haz clic en la cámara para cambiar tu foto</p>
            </div>
          </div>

          <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700/40 rounded-xl text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Email</span>
              <span className="font-medium dark:text-slate-100">{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Rol</span>
              <span className="font-medium capitalize dark:text-slate-100">{profile?.role ?? "—"}</span>
            </div>
          </div>

          <form onSubmit={saveProfile} className="space-y-3">
            <div>
              <label className={labelCls}>Nombre completo</label>
              <input value={prof.fullName} onChange={(e) => setProf((p) => ({ ...p, fullName: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Teléfono</label>
              <input value={prof.phone} onChange={(e) => setProf((p) => ({ ...p, phone: e.target.value }))} className={inputCls} />
            </div>
            <button type="submit" disabled={savingProfile}
              className={`w-full font-semibold py-2.5 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 ${savedProfile ? "bg-emerald-600 text-white" : "bg-brand-600 hover:bg-brand-700 text-white"}`}>
              {savingProfile ? "Guardando…" : savedProfile ? <><CheckCircle2 size={16} /> Guardado</> : "Guardar perfil"}
            </button>
          </form>
        </div>

        {/* Password */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-700 dark:text-slate-100 mb-5">Cambiar contraseña</h2>
          <form onSubmit={savePassword} className="space-y-3">
            {[
              { label: "Nueva contraseña",    key: "next"    as const },
              { label: "Confirmar contraseña", key: "confirm" as const },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className={labelCls}>{label}</label>
                <input type="password" value={pw[key]} onChange={(e) => setPw((p) => ({ ...p, [key]: e.target.value }))} className={inputCls} />
              </div>
            ))}
            <button type="submit" disabled={savingPassword}
              className={`w-full font-semibold py-2.5 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2 ${savedPassword ? "bg-emerald-600 text-white" : "bg-slate-800 hover:bg-slate-900 text-white"}`}>
              {savingPassword ? "Actualizando…" : savedPassword ? <><CheckCircle2 size={16} /> Actualizada</> : "Cambiar contraseña"}
            </button>
          </form>
        </div>

        {/* Company — full width, admin only */}
        {isAdmin && (
        <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-700 dark:text-slate-100 mb-5">
            {company ? "Datos de la empresa" : "Registrar empresa"}
          </h2>
          <form onSubmit={saveCompany}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {[
                { label: "Nombre de la empresa *", key: "name" as const },
                { label: "RIF / NIT / RFC",        key: "rif" as const  },
                { label: "Teléfono",               key: "phone" as const },
                { label: "Email empresarial",      key: "email" as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className={labelCls}>{label}</label>
                  <input value={comp[key]} onChange={(e) => setComp((p) => ({ ...p, [key]: e.target.value }))} className={inputCls} />
                </div>
              ))}

              <div>
                <label className={labelCls}>Industria</label>
                <select value={comp.industry} onChange={(e) => setComp((p) => ({ ...p, industry: e.target.value }))}
                  className={inputCls}>
                  {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>País</label>
                <select value={comp.country} onChange={(e) => setComp((p) => ({ ...p, country: e.target.value }))}
                  className={inputCls}>
                  {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className={labelCls}>Dirección</label>
                <textarea value={comp.address} onChange={(e) => setComp((p) => ({ ...p, address: e.target.value }))}
                  className={`${inputCls} resize-none`} rows={2} />
              </div>
            </div>

            <button type="submit" disabled={savingCompany}
              className={`font-semibold px-6 py-2.5 rounded-lg transition disabled:opacity-50 flex items-center gap-2 ${savedCompany ? "bg-emerald-600 text-white" : "bg-brand-600 hover:bg-brand-700 text-white"}`}>
              {savingCompany ? "Guardando…" : savedCompany ? <><CheckCircle2 size={16} /> Guardado</> : (company ? "Actualizar empresa" : "Registrar empresa")}
            </button>
          </form>
        </div>
        )}

        {/* Facturación electrónica (DGII / e-CF) — admin only, requiere empresa ya registrada */}
        {isAdmin && company && (
        <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-700 dark:text-slate-100 mb-1 flex items-center gap-2">
            <Receipt size={16} className="text-brand-500" /> Facturación electrónica (DGII)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            El RNC se toma del campo &quot;RIF / NIT / RFC&quot; de arriba. LogiAnalytics es la cuenta
            principal en Alanube — esta empresa debe registrarse ahí como compañía asociada primero;
            pegá acá el ID que Alanube le asigne, más la categoría de contribuyente y el rango de
            e-NCF que le haya autorizado DGII para cada tipo de comprobante.
          </p>
          <form onSubmit={saveECf}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div>
                <label className={labelCls}>ID de empresa asociada en Alanube</label>
                <input
                  value={eCf.alanubeCompanyId}
                  onChange={(e) => setECf((p) => ({ ...p, alanubeCompanyId: e.target.value }))}
                  placeholder="Ej: 01FVK1KD4581EF7CCK7TX55420"
                  className={`${inputCls} font-mono text-xs`}
                />
              </div>
              <div>
                <label className={labelCls}>Categoría de contribuyente (DGII)</label>
                <select
                  value={eCf.taxpayerType}
                  onChange={(e) => setECf((p) => ({ ...p, taxpayerType: e.target.value as TaxpayerType | "" }))}
                  className={inputCls}
                >
                  <option value="">Sin definir</option>
                  <option value="grande">Gran contribuyente</option>
                  <option value="mediano">Mediano contribuyente</option>
                  <option value="pequeno">Pequeño contribuyente</option>
                  <option value="micro">Micro contribuyente</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Ambiente Alanube</label>
                <select
                  value={eCf.eCfEnvironment}
                  onChange={(e) => setECf((p) => ({ ...p, eCfEnvironment: e.target.value as "sandbox" | "production" }))}
                  className={inputCls}
                >
                  <option value="sandbox">Pruebas (sandbox)</option>
                  <option value="production">Producción</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              {(["31", "32"] as const).map((type) => (
                <div key={type} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end p-3 bg-slate-50 dark:bg-slate-700/40 rounded-xl">
                  <div className="sm:col-span-1">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">{ECF_TYPE_LABELS[type]}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-400">e-NCF tipo {type}</p>
                  </div>
                  <div>
                    <label className={labelCls}>Próximo número</label>
                    <input
                      type="number" min={1}
                      value={eCf.sequences[type].nextNumber}
                      onChange={(e) => setECf((p) => ({
                        ...p, sequences: { ...p.sequences, [type]: { ...p.sequences[type], nextNumber: e.target.value } },
                      }))}
                      placeholder="Ej: 1"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Hasta (fin del rango autorizado)</label>
                    <input
                      type="number" min={1}
                      value={eCf.sequences[type].rangeEnd}
                      onChange={(e) => setECf((p) => ({
                        ...p, sequences: { ...p.sequences, [type]: { ...p.sequences[type], rangeEnd: e.target.value } },
                      }))}
                      placeholder="Ej: 50000"
                      className={inputCls}
                    />
                  </div>
                </div>
              ))}
            </div>

            <button type="submit" disabled={savingECf}
              className={`font-semibold px-6 py-2.5 rounded-lg transition disabled:opacity-50 flex items-center gap-2 ${savedECf ? "bg-emerald-600 text-white" : "bg-brand-600 hover:bg-brand-700 text-white"}`}>
              {savingECf ? "Guardando…" : savedECf ? <><CheckCircle2 size={16} /> Guardado</> : "Guardar configuración"}
            </button>
          </form>
        </div>
        )}

        {/* Push Notifications */}
        <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-700 dark:text-slate-100 mb-1">Notificaciones de stock</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Recibe alertas del navegador cuando un producto caiga por debajo del stock mínimo.
          </p>

          <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-700/40 rounded-xl">
            <div className="flex items-center gap-3">
              {pushEnabled
                ? <Bell size={20} className="text-brand-600" />
                : <BellOff size={20} className="text-slate-400 dark:text-slate-500" />}
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-100">
                  {pushEnabled ? "Notificaciones activas" : "Notificaciones desactivadas"}
                </p>
                {pushPermission === "denied" && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">
                    Bloqueadas en el navegador — actívalas desde la configuración del sitio.
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={togglePush}
              disabled={pushPermission === "denied"}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-40 ${
                pushEnabled ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  pushEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Reportes por email */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Mail size={18} className="text-brand-600" />
            <h2 className="font-semibold text-slate-700 dark:text-slate-100">Reportes por email</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
            Recibe un resumen mensual con KPIs, top productos y alertas de stock directamente en tu correo. Se envía automáticamente el 1° de cada mes.
          </p>
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3.5 mb-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p>✉️ Se enviará a: <span className="font-semibold text-slate-700 dark:text-slate-100">{profile?.email}</span></p>
            <p>🗓️ Frecuencia: primer día de cada mes a las 9:00 AM</p>
            <p>📊 Incluye: ingresos, ganancia, margen, top 5 productos y alertas</p>
          </div>
          <button
            onClick={sendTestReport}
            disabled={sendingReport}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition"
          >
            {sendingReport
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enviando…</>
              : <><Send size={14} /> Enviarme un reporte de prueba</>}
          </button>
        </div>

        {/* Audit Log — admin only */}
        {isAdmin && (
        <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-brand-600" />
              <h2 className="font-semibold text-slate-700 dark:text-slate-100">Auditoría de actividad</h2>
            </div>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
              {([7, 30, 90] as const).map((d) => (
                <button key={d} onClick={() => setAuditDays(d)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${auditDays === d ? "bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {auditLoading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-400">Cargando…</div>
          ) : auditLog.length === 0 ? (
            <div className="py-10 text-center">
              <History size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-500" />
              <p className="text-sm text-slate-400 dark:text-slate-400">Sin actividad en los últimos {auditDays} días</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/40 text-xs text-slate-500 dark:text-slate-400">
                    <th className="text-left px-4 py-2.5 font-medium">Acción</th>
                    <th className="text-left px-4 py-2.5 font-medium">Entidad</th>
                    <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Detalle</th>
                    <th className="text-right px-4 py-2.5 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.slice(0, 50).map((e) => (
                    <tr key={e.id} className="border-t border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLOR[e.action] ?? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                          {ACTION_LABELS[e.action] ?? e.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100 max-w-[140px] truncate">{e.entityName}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs hidden sm:table-cell max-w-[200px] truncate">{e.detail}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-400 dark:text-slate-400 whitespace-nowrap">
                        {e.createdAt?.toDate?.()?.toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditLog.length > 50 && (
                <p className="px-4 py-2 text-xs text-slate-400 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/40 border-t border-slate-100 dark:border-slate-700">
                  Mostrando 50 de {auditLog.length} eventos
                </p>
              )}
            </div>
          )}
        </div>
        )}

      </div>
    </div>
  );
}
