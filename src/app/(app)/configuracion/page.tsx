"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { updatePassword, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { updateUserProfile } from "@/lib/firestore/users";
import { createCompany, getCompany, updateCompany } from "@/lib/firestore/companies";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { INDUSTRIES, COUNTRIES, type Company } from "@/types";

export default function ConfiguracionPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [savingProfile,  setSavingProfile]  = useState(false);
  const [savingCompany,  setSavingCompany]  = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [prof, setProf] = useState({ fullName: "", phone: "" });
  const [comp, setComp] = useState({
    name: "", rif: "", address: "", phone: "", email: "", industry: INDUSTRIES[0], country: COUNTRIES[0],
  });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => {
    if (profile) setProf({ fullName: profile.fullName, phone: profile.phone });
  }, [profile]);

  useEffect(() => {
    if (profile?.companyId) {
      getCompany(profile.companyId).then((c) => {
        if (c) {
          setCompany(c);
          setComp({ name: c.name, rif: c.rif, address: c.address, phone: c.phone, email: c.email, industry: c.industry, country: c.country });
        }
      });
    }
  }, [profile]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    await updateUserProfile(user.uid, { fullName: prof.fullName, phone: prof.phone });
    await refreshProfile();
    toast.success("Perfil actualizado");
    setSavingProfile(false);
  }

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingCompany(true);
    if (company) {
      await updateCompany(company.id, comp);
      toast.success("Empresa actualizada");
    } else {
      const r = await createCompany(user.uid, comp);
      if (r.ok) {
        await updateUserProfile(user.uid, { companyId: r.id, companyName: comp.name });
        await refreshProfile();
        toast.success("Empresa registrada");
      } else {
        toast.error(r.message);
      }
    }
    setSavingCompany(false);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next !== pw.confirm) { toast.error("Las contraseñas no coinciden"); return; }
    if (pw.next.length < 6)     { toast.error("Mínimo 6 caracteres"); return; }
    setSavingPassword(true);
    try {
      await updatePassword(auth.currentUser as User, pw.next);
      toast.success("Contraseña actualizada");
      setPw({ current: "", next: "", confirm: "" });
    } catch {
      toast.error("Re-inicia sesión para cambiar la contraseña");
    }
    setSavingPassword(false);
  }

  const inputCls = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
  const labelCls = "block text-sm font-medium text-slate-700 mb-1";

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Administra tu perfil y empresa" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Profile */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-5">Perfil de usuario</h2>

          <div className="mb-4 p-3 bg-slate-50 rounded-xl text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-slate-500">Email</span>
              <span className="font-medium">{user?.email}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-500">Rol</span>
              <span className="font-medium capitalize">{profile?.role ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Plan</span>
              <span className="font-medium capitalize text-brand-600">{profile?.subscriptionPlan ?? "—"}</span>
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
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50">
              {savingProfile ? "Guardando…" : "Guardar perfil"}
            </button>
          </form>
        </div>

        {/* Password */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-5">Cambiar contraseña</h2>
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
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50">
              {savingPassword ? "Actualizando…" : "Cambiar contraseña"}
            </button>
          </form>
        </div>

        {/* Company — full width */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-5">
            {company ? "Datos de la empresa" : "Registrar empresa"}
          </h2>
          <form onSubmit={saveCompany}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
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

              <div className="lg:col-span-3">
                <label className={labelCls}>Dirección</label>
                <textarea value={comp.address} onChange={(e) => setComp((p) => ({ ...p, address: e.target.value }))}
                  className={`${inputCls} resize-none`} rows={2} />
              </div>
            </div>

            <button type="submit" disabled={savingCompany}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-lg transition disabled:opacity-50">
              {savingCompany ? "Guardando…" : (company ? "Actualizar empresa" : "Registrar empresa")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
