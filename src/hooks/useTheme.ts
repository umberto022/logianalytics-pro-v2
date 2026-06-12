"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("logi_theme") as Theme | null;
      const preferred = saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      apply(preferred);
      setTheme(preferred);
    } catch {
      const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      apply(preferred);
      setTheme(preferred);
    }
  }, []);

  function apply(t: Theme) {
    document.documentElement.classList.toggle("dark", t === "dark");
  }

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    apply(next);
    try { localStorage.setItem("logi_theme", next); } catch { /* private mode */ }
    setTheme(next);
  }

  return { theme, toggle, isDark: theme === "dark" };
}
