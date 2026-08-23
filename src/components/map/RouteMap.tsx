"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteStats } from "@/types";
import type { RouteRecord } from "@/lib/firestore/routes";
import { fmtCurrency, fmt } from "@/lib/utils";

// Coordenadas reales de ciudades/zonas dominicanas comunes en nombres de ruta, para cuando
// la ruta todavía no está formalizada en "Mis rutas" con su Provincia. Antes esto apuntaba a
// Venezuela (Caracas, Maracaibo...) — bug real reportado por un cliente: una ruta llamada
// "Santiago" terminaba clavada en Santiago de Chile en vez de Santiago, RD.
const KNOWN: Record<string, [number, number]> = {
  santo: [18.4861, -69.9312], domingo: [18.4861, -69.9312], dn: [18.4861, -69.9312],
  santiago: [19.4517, -70.697], vega: [19.2233, -70.5287], moca: [19.3945, -70.5271],
  bonao: [18.9388, -70.4083], cristobal: [18.4167, -70.1058], bani: [18.2799, -70.3308],
  azua: [18.4539, -70.7358], barahona: [18.2085, -71.1002], plata: [19.7934, -70.6884],
  romana: [18.4273, -68.9728], macoris: [18.4539, -69.3084], higuey: [18.6147, -68.7078],
  altagracia: [18.6147, -68.7078], samana: [19.2058, -69.3364], nagua: [19.3801, -69.8489],
  cotui: [19.0533, -70.1517], mao: [19.5497, -71.0783], monte: [19.8508, -71.6492],
  seibo: [18.7644, -69.0392], ocoa: [18.5442, -70.5044], juan: [18.8058, -71.2295],
  jarabacoa: [19.1167, -70.6333], constanza: [18.9098, -70.7601], punta: [18.5601, -68.3725],
  bavaro: [18.6941, -68.4183], boca: [18.3833, -69.6],
  norte: [18.55, -69.88], sur: [18.4, -69.9], este: [18.5, -69.6], oeste: [18.45, -70.1], centro: [18.4861, -69.9312],
  capital: [18.4861, -69.9312], sde: [18.4894, -69.85], sdn: [18.55, -69.98], sdo: [18.47, -70.03],
};

// Último recurso para nombres de ruta que no matchean ni una RouteRecord con provincia ni el
// diccionario de arriba: un jitter chico y determinístico (mismo nombre → misma posición)
// alrededor del centro, acotado al tamaño real de RD (~2.4° x 3.7°), no a Sudamérica entera.
function routeHash(route: string): [number, number] {
  let h = 5381;
  for (let i = 0; i < route.length; i++) h = ((h << 5) + h + route.charCodeAt(i)) | 0;
  const a = Math.abs(h);
  const lat = ((a % 800) / 800 - 0.5) * 1.0;
  const lng = (((a >> 8) % 800) / 800 - 0.5) * 1.4;
  return [lat, lng];
}

function markerColor(marginPct: number): string {
  if (marginPct >= 20) return "#10b981";
  if (marginPct >= 10) return "#f59e0b";
  return "#ef4444";
}

interface Props {
  routes: RouteStats[];
  /** Catálogo "Mis rutas" — si una ruta tiene Provincia asignada, sus lat/lng reales tienen
   *  prioridad sobre cualquier adivinanza por nombre. Es la fuente de verdad. */
  records?: RouteRecord[];
  center?: [number, number];
}

export default function RouteMap({ routes, records = [], center = [18.4861, -69.9312] }: Props) {
  // Nombre de ruta (normalizado) → coordenadas reales guardadas en "Mis rutas".
  const realCoords = new Map<string, [number, number]>();
  records.forEach((r) => {
    if (typeof r.lat === "number" && typeof r.lng === "number") {
      realCoords.set(r.name.trim().toLowerCase(), [r.lat, r.lng]);
    }
  });

  function getCoords(route: string): [number, number] {
    const key = route.trim().toLowerCase();
    if (realCoords.has(key)) return realCoords.get(key)!;

    const firstWord = key.split(/[\s,_\-]/)[0];
    for (const word of key.split(/[\s,_\-]/)) {
      if (KNOWN[word]) return KNOWN[word];
    }
    if (KNOWN[firstWord]) return KNOWN[firstWord];

    const [dlat, dlng] = routeHash(route);
    return [center[0] + dlat, center[1] + dlng];
  }

  return (
    <MapContainer
      center={center}
      zoom={9}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {routes.map((r) => {
        const pos = getCoords(r.route);
        const color = markerColor(r.marginPct);
        const radius = Math.max(14, Math.min(34, (r.totalUnits / 5) + 12));
        return (
          <CircleMarker
            key={r.route}
            center={pos}
            radius={radius}
            pathOptions={{ fillColor: color, color: "#fff", fillOpacity: 0.88, weight: 2.5 }}
          >
            <Popup minWidth={170}>
              <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
                <p style={{ fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>{r.route}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px", color: "#475569" }}>
                  <span>Ventas</span>      <strong>{r.numSales}</strong>
                  <span>Unidades</span>    <strong>{fmt(r.totalUnits, 0)}</strong>
                  <span>Ingresos</span>    <strong style={{ color: "#6366f1" }}>{fmtCurrency(r.revenue)}</strong>
                  <span>Ganancia</span>    <strong style={{ color }}>{fmtCurrency(r.profit)}</strong>
                  <span>Margen</span>      <strong style={{ color }}>{r.marginPct}%</strong>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
