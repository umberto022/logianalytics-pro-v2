"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteStats } from "@/types";
import { fmtCurrency, fmt } from "@/lib/utils";

// Deterministic lat/lng offset from route name string hash
function routeHash(route: string): [number, number] {
  let h = 5381;
  for (let i = 0; i < route.length; i++) h = ((h << 5) + h + route.charCodeAt(i)) | 0;
  const a = Math.abs(h);
  const lat = ((a % 800) / 800 - 0.4) * 8;
  const lng = (((a >> 8) % 800) / 800 - 0.4) * 12;
  return [lat, lng];
}

const KNOWN: Record<string, [number, number]> = {
  norte: [11.1, -66.9], sur: [9.7, -66.9], este: [10.5, -64.8],
  oeste: [10.5, -68.8], centro: [10.48, -66.9], caracas: [10.48, -66.9],
  maracaibo: [10.65, -71.6], valencia: [10.16, -68.0], barquisimeto: [10.07, -69.3],
  maturin: [9.74, -63.18], barcelona: [10.13, -64.69], cumana: [10.46, -64.17],
  bogota: [4.71, -74.07], medellin: [6.25, -75.56], cali: [3.43, -76.52],
  lima: [-12.04, -77.03], quito: [-0.22, -78.51], santiago: [-33.45, -70.67],
  ciudad: [10.48, -66.9], zona: [10.3, -67.1], ruta: [10.2, -67.3],
};

function getCoords(route: string, center: [number, number]): [number, number] {
  const key = route.toLowerCase().split(/[\s,_\-]/)[0];
  if (KNOWN[key]) return KNOWN[key];
  const [dlat, dlng] = routeHash(route);
  return [center[0] + dlat, center[1] + dlng];
}

function markerColor(marginPct: number): string {
  if (marginPct >= 20) return "#10b981";
  if (marginPct >= 10) return "#f59e0b";
  return "#ef4444";
}

interface Props {
  routes: RouteStats[];
  center?: [number, number];
}

export default function RouteMap({ routes, center = [10.48, -66.9] }: Props) {
  return (
    <MapContainer
      center={center}
      zoom={6}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {routes.map((r) => {
        const pos = getCoords(r.route, center);
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
