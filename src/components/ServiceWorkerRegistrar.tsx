"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // El SW cachea JS/CSS cache-first (ver sw.js). Si un deploy nuevo sale
        // mientras el usuario tenía la app abierta (o instalada como PWA sin
        // cerrarla nunca), el navegador puede tardar en notar que /sw.js cambió
        // — hasta entonces sigue sirviendo el bundle viejo desde caché aunque el
        // código en memoria ya no exista en el servidor. Forzamos un chequeo de
        // update apenas se monta la app y cada vez que la pestaña vuelve a
        // primer plano, en vez de esperar al chequeo automático del navegador
        // (que puede tardar hasta 24h).
        registration.update().catch(() => {});
        const onVisible = () => {
          if (document.visibilityState === "visible") registration.update().catch(() => {});
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
      })
      .catch(() => {});

    // Cuando un SW nuevo termina de instalarse, sw.js llama a skipWaiting() +
    // clients.claim() — eso cambia quién responde los fetch(), pero el bundle
    // React ya cargado en memoria en esta pestaña sigue siendo el viejo hasta
    // que se recargue. "controllerchange" se dispara justo en ese momento
    // (nunca en la carga inicial, solo cuando YA había un controller antes y
    // cambió) — recargamos una sola vez para que la pestaña quede 100%
    // sincronizada con el código nuevo, en vez de quedar en un estado mixto
    // donde el HTML/JS es viejo pero el SW de abajo ya es otro.
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
